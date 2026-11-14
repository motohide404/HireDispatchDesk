"""Fixed server-side entry point for a dedicated, restricted deployment key."""
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile

ROOT = Path('/opt/hiredispatch')
STATE = Path('/var/lib/hiredispatch-github/state.json')
INSTALL = Path('/usr/local/lib/hiredispatch-github')
REPOSITORY = 'motohide404/HireDispatchDesk'
MAX_BUNDLE = 12 * 1024 * 1024
MAX_EXPANDED = 50 * 1024 * 1024


def digest(content):
    return hashlib.sha256(content).hexdigest()


def allowed_path(name):
    if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9_./-]+', name):
        return False
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in ('', '.', '..') for part in name.split('/')):
        return False
    return name in ('server/app.py', 'checks/verify_server.py') or name.startswith('client/dist/')


def unpack(body):
    if not body or len(body) > MAX_BUNDLE:
        raise ValueError('Invalid deployment size.')
    with tarfile.open(fileobj=io.BytesIO(body), mode='r:gz') as outer:
        members = outer.getmembers()
        if len(members) != 2 or {m.name for m in members} != {'manifest.json', 'payload.tgz'}:
            raise ValueError('Unexpected deployment files.')
        if any(not m.isfile() or m.size > MAX_BUNDLE for m in members):
            raise ValueError('Invalid deployment member.')
        if outer.getmember('manifest.json').size > 1024 * 1024:
            raise ValueError('Manifest too large.')
        manifest = json.loads(outer.extractfile('manifest.json').read())
        payload = outer.extractfile('payload.tgz').read()
    if not isinstance(manifest, dict):
        raise ValueError('Invalid deployment manifest.')
    commit = manifest.get('source_commit', '')
    if not isinstance(commit, str) or not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Invalid source commit.')
    if manifest.get('repository') != REPOSITORY or manifest.get('branch') != 'main':
        raise ValueError('Unexpected source repository or branch.')
    if manifest.get('release_id') != 'github-' + commit or manifest.get('archive_sha256') != digest(payload):
        raise ValueError('Release identity or checksum mismatch.')
    files = manifest.get('files')
    required = {'server/app.py', 'client/dist/index.html', 'client/dist/build.json', 'checks/verify_server.py'}
    if not isinstance(files, dict) or not required.issubset(files) or len(files) > 512:
        raise ValueError('Incomplete deployment manifest.')
    if any(not allowed_path(name) or not isinstance(value, str) or not re.fullmatch(r'[0-9a-f]{64}', value)
           for name, value in files.items()):
        raise ValueError('Unsafe path or checksum.')
    with tarfile.open(fileobj=io.BytesIO(payload), mode='r:gz') as inner:
        members = inner.getmembers()
        if len(members) != len(files) or {m.name for m in members} != set(files):
            raise ValueError('Payload does not match manifest.')
        if any(not m.isfile() for m in members) or sum(m.size for m in members) > MAX_EXPANDED:
            raise ValueError('Invalid payload members or size.')
        for member in members:
            if digest(inner.extractfile(member).read()) != files[member.name]:
                raise ValueError('Payload checksum mismatch.')
        metadata = json.loads(inner.extractfile('client/dist/build.json').read())
        if not isinstance(metadata, dict) or any(metadata.get(key) != manifest[key] for key in ('repository', 'source_commit', 'release_id')):
            raise ValueError('Public build metadata does not match source.')
    return manifest, payload


def deployed_files(manifest):
    return {name: value for name, value in manifest['files'].items()
            if name == 'server/app.py' or name.startswith('client/dist/')}


def verify_baseline(baseline):
    if not isinstance(baseline.get('files'), dict) or not {'server/app.py', 'client/dist/index.html'}.issubset(baseline['files']):
        raise ValueError('Deployment baseline is incomplete.')
    for name, expected in baseline['files'].items():
        if not allowed_path(name) or name == 'checks/verify_server.py':
            raise ValueError('Unsafe baseline path.')
        path = ROOT / name
        if path.is_symlink() or not path.is_file() or digest(path.read_bytes()) != expected:
            raise ValueError('Running files changed outside managed deployment: ' + name)


def write_state(manifest):
    value = {'release_id': manifest['release_id'], 'files': deployed_files(manifest)}
    STATE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    descriptor, temporary = tempfile.mkstemp(prefix='.state-', dir=STATE.parent)
    try:
        with os.fdopen(descriptor, 'w') as stream:
            os.fchmod(stream.fileno(), 0o600)
            json.dump(value, stream, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, STATE)
    finally:
        Path(temporary).unlink(missing_ok=True)


def apply(body):
    manifest, payload = unpack(body)
    baseline = json.loads(STATE.read_text())
    verify_baseline(baseline)
    # Never accept a root executable from the uploaded bundle. The reviewed
    # updater is installed once; its backup/clone/rollback steps are reused.
    (ROOT / 'releases').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.github-input-', dir=ROOT / 'releases') as temporary:
        staging = Path(temporary)
        staging.chmod(0o755)
        trusted = staging / 'remote_update.py'
        shutil.copyfile(INSTALL / 'remote_update.py', trusted)
        trusted.chmod(0o644)
        checked = {key: manifest[key] for key in ('release_id', 'archive_sha256', 'files')}
        checked.update(remote_update_sha256=digest(trusted.read_bytes()),
                       expected_server_sha256=baseline['files']['server/app.py'],
                       expected_index_sha256=baseline['files']['client/dist/index.html'])
        (staging / 'release.json').write_text(json.dumps(checked))
        (staging / 'payload.tgz').write_bytes(payload)
        result = subprocess.run(['/usr/bin/python3', str(trusted)], capture_output=True, text=True, timeout=300)
        receipts = [json.loads(line[len('RECEIPT='):]) for line in result.stdout.splitlines() if line.startswith('RECEIPT=')]
        if result.returncode or not receipts:
            raise RuntimeError('Update failed; baseline was not advanced.\n' + result.stdout[-1500:] + result.stderr[-1500:])
        receipt = receipts[-1]
        if receipt.get('status') != 'deployed' or receipt.get('release_id') != manifest['release_id'] or not receipt.get('deployment_preserves_workspace'):
            raise RuntimeError('Invalid deployment receipt; baseline was not advanced.')
        verify_baseline({'files': deployed_files(manifest)})
        write_state(manifest)
        return {'status': 'deployed', 'release_id': manifest['release_id'],
                'source_commit': manifest['source_commit'], 'deployment_preserves_workspace': True}


if __name__ == '__main__':
    try:
        target = json.loads((INSTALL / 'target.json').read_text())
        if len(sys.argv) != 1 or os.geteuid() != 0 or socket.gethostname() != target['hostname']:
            raise RuntimeError('Dedicated server and root are required.')
        print(json.dumps(apply(sys.stdin.buffer.read(MAX_BUNDLE + 1))))
    except Exception as error:
        print('Deployment stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)
