"""CI deployment with a dedicated key and a pre-verified server host key."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=Path, default=Path('.deployment-build'))
    args = parser.parse_args()
    manifest = json.loads((args.directory / 'manifest.json').read_text())
    settings = {name: os.environ.get(name, '').strip() for name in
                ('SAKURA_SSH_KEY', 'SAKURA_SSH_HOST', 'SAKURA_SSH_KNOWN_HOSTS', 'SAKURA_PUBLIC_URL')}
    missing = [name for name, value in settings.items() if not value]
    if missing:
        raise RuntimeError('Initial deployment setup is pending: ' + ', '.join(missing))
    base = settings['SAKURA_PUBLIC_URL'].rstrip('/')
    parsed = urlsplit(base)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('An HTTPS public URL without credentials is required.')
    with tempfile.TemporaryDirectory(prefix='hiredispatch-ci-') as temporary:
        key = Path(temporary) / 'key'
        key.write_text(settings['SAKURA_SSH_KEY'] + '\n')
        key.chmod(0o600)
        known = Path(temporary) / 'known_hosts'
        known.write_text(settings['SAKURA_SSH_KNOWN_HOSTS'] + '\n')
        known.chmod(0o600)
        command = ['ssh', '-i', str(key), '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes',
                   '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + str(known),
                   '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4',
                   'hiredispatch-deploy@' + settings['SAKURA_SSH_HOST'], 'update']
        result = subprocess.run(command, input=(args.directory / 'github-release.tgz').read_bytes(), capture_output=True, timeout=360)
        if result.returncode:
            raise RuntimeError(result.stderr.decode(errors='replace')[-2000:] or 'The server did not complete deployment.')
        receipt = json.loads(result.stdout)
        if receipt.get('release_id') != manifest['release_id'] or not receipt.get('deployment_preserves_workspace'):
            raise RuntimeError('Unexpected deployment receipt.')
    expected = {name: digest for name, digest in manifest['files'].items() if name.startswith('client/dist/')}
    for attempt in range(10):
        try:
            for name, digest in expected.items():
                path = '/' if name == 'client/dist/index.html' else '/' + name[len('client/dist/'):]
                with urllib.request.urlopen(base + path, timeout=15) as response:
                    if hashlib.sha256(response.read()).hexdigest() != digest:
                        raise RuntimeError('Public asset mismatch: ' + path)
            with urllib.request.urlopen(base + '/api/health', timeout=15) as response:
                if json.load(response) != {'status': 'ok', 'environment': 'test'}:
                    raise RuntimeError('Unexpected application health response.')
            print('Deployed and verified ' + manifest['release_id'])
            return
        except (OSError, ValueError, RuntimeError):
            if attempt == 9:
                raise
            time.sleep(2)


if __name__ == '__main__':
    main()
