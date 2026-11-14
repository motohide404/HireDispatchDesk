"""Build the same tested application for upload and deployment; never reads secrets."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile

REPOSITORY = 'motohide404/HireDispatchDesk'


def sha(content):
    return hashlib.sha256(content).hexdigest()


def archive(files):
    output = io.BytesIO()
    with gzip.GzipFile(fileobj=output, mode='wb', filename='', mtime=0) as zipped:
        with tarfile.open(fileobj=zipped, mode='w') as tar:
            for name, content in sorted(files.items()):
                item = tarfile.TarInfo(name)
                item.size = len(content)
                item.mode = 0o644
                tar.addfile(item, io.BytesIO(content))
    return output.getvalue()


def build(root, commit, output):
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('A full source commit SHA is required.')
    dist = root / 'client/dist'
    if not (dist / 'index.html').is_file():
        raise ValueError('Build the client before packaging.')
    metadata = {'repository': REPOSITORY, 'source_commit': commit, 'release_id': 'github-' + commit}
    files = {path.relative_to(root).as_posix(): path.read_bytes()
             for path in sorted(dist.rglob('*')) if path.is_file() and not path.is_symlink()}
    files['client/dist/build.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
    files['server/app.py'] = (root / 'server/app.py').read_bytes()
    files['checks/verify_server.py'] = (root / 'deploy/releases/20261114-ledgers/verify_server.py').read_bytes()
    payload = archive(files)
    manifest = {**metadata, 'branch': 'main', 'archive_sha256': sha(payload),
                'files': {name: sha(content) for name, content in sorted(files.items())}}
    output.mkdir(parents=True, exist_ok=True)
    bundle = archive({'manifest.json': (json.dumps(manifest, indent=2) + '\n').encode(), 'payload.tgz': payload})
    (output / 'github-release.tgz').write_bytes(bundle)
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--commit', required=True)
    parser.add_argument('--output', type=Path, default=Path('.deployment-build'))
    args = parser.parse_args()
    result = build(Path(__file__).resolve().parents[2], args.commit, args.output)
    print('Prepared ' + result['release_id'])
