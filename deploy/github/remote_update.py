"""Guarded deployment to the existing dedicated test server."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tarfile
import time
import urllib.request
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = Path('/opt/hiredispatch')


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def health():
    for attempt in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2) as response:
                if json.load(response) == {'status': 'ok', 'environment': 'test'}:
                    return
        except (OSError, ValueError):
            pass
        time.sleep(0.5)
    raise RuntimeError('サービスの正常応答を確認できません。')


def main():
    package_dir = Path(__file__).resolve().parent
    manifest = json.loads((package_dir / 'release.json').read_text())
    assert re.fullmatch(r'github-[0-9a-f]{40}', manifest['release_id']), '更新識別子が不正です。'
    assert os.geteuid() == 0, 'rootで実行する必要があります。'
    target = json.loads(Path('/usr/local/lib/hiredispatch-github/target.json').read_text())
    assert socket.gethostname() == target['hostname'], '対象サーバーが異なります。'
    assert ROOT.resolve() == ROOT and (ROOT / 'server/app.py').is_file()
    assert digest(package_dir / 'payload.tgz') == manifest['archive_sha256'], '更新ファイルの照合に失敗しました。'
    assert digest(__file__) == manifest['remote_update_sha256'], '更新処理の照合に失敗しました。'
    lock = open('/var/lock/hiredispatch-release.lock', 'a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    run(['systemctl', 'is-active', '--quiet', 'hiredispatch'])
    release = ROOT / 'releases' / manifest['release_id']
    old_server = digest(ROOT / 'server/app.py')
    old_index = digest(ROOT / 'client/dist/index.html')
    if old_server == manifest['files']['server/app.py'] and old_index == manifest['files']['client/dist/index.html']:
        receipt = release / 'receipt.json'
        assert receipt.is_file(), '更新済みコードの完了記録がありません。確認が必要です。'
        health()
        print('RECEIPT=' + json.dumps(json.loads(receipt.read_text()), ensure_ascii=False), flush=True)
        return
    assert old_server == manifest['expected_server_sha256'], '稼働中のコードが事前確認時と異なります。上書きせず停止します。'
    assert old_index == manifest['expected_index_sha256'], '稼働中の画面が事前確認時と異なります。上書きせず停止します。'
    release.mkdir(parents=True, exist_ok=True)
    staging = release / ('payload-' + uuid.uuid4().hex[:8])
    staging.mkdir(mode=0o755)
    with tarfile.open(package_dir / 'payload.tgz', 'r:gz') as archive:
        members = archive.getmembers()
        assert len(members) == len(manifest['files'])
        assert {member.name for member in members} == set(manifest['files'])
        for member in members:
            assert member.isfile() and not Path(member.name).is_absolute() and '..' not in Path(member.name).parts
            target = staging / member.name
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            target.write_bytes(archive.extractfile(member).read())
            target.chmod(0o644)
            assert digest(target) == manifest['files'][member.name]
    checker = staging / 'checks/verify_server.py'
    app = staging / 'server/app.py'

    def validate(database='hiredispatch', exercise=False):
        args = ['runuser', '-u', 'hiredispatch', '--', '/usr/bin/python3', str(checker), '--app', str(app), '--database', database]
        if exercise:
            args.append('--exercise')
        result = subprocess.run(args, capture_output=True, text=True, timeout=120, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
        if result.returncode:
            raise RuntimeError('保存データ・API検査に失敗しました。\n' + result.stderr[-1500:])
        return json.loads(result.stdout)

    before = validate()
    print('1/4 既存コード・保存データの照合が完了しました。', flush=True)
    backup = release / ('backup-' + datetime.now(ZoneInfo('Asia/Tokyo')).strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6])
    backup.mkdir(mode=0o700)
    database_backup = backup / 'hiredispatch.dump'
    with database_backup.open('xb') as output:
        database_backup.chmod(0o600)
        run(['runuser', '-u', 'hiredispatch', '--', 'pg_dump', '-Fc', 'hiredispatch'], stdout=output)
        output.flush()
        os.fsync(output.fileno())
    run(['pg_restore', '--list', str(database_backup)], stdout=subprocess.DEVNULL)
    shutil.copy2(ROOT / 'server/app.py', backup / 'app.py')
    print('2/4 データベースとプログラムをバックアップしました。', flush=True)
    clone = 'hiredispatch_verify_' + uuid.uuid4().hex[:12]
    clone_created = False
    try:
        run(['runuser', '-u', 'postgres', '--', 'createdb', '--owner=hiredispatch', clone])
        clone_created = True
        with database_backup.open('rb') as source:
            run(['runuser', '-u', 'postgres', '--', 'pg_restore', '--exit-on-error', '--no-owner', '--no-privileges', '--role=hiredispatch', '--dbname=' + clone], stdin=source)
        smoke = validate(clone, exercise=True)
    finally:
        if clone_created:
            run(['runuser', '-u', 'postgres', '--', 'dropdb', '--if-exists', clone])
    print('3/4 複製DBで既存の台帳データと写真の保存を検証しました。', flush=True)
    next_dist = ROOT / 'client' / ('.dist-next-' + uuid.uuid4().hex[:8])
    shutil.copytree(staging / 'client/dist', next_dist)
    old_dist = backup / 'dist'
    moved_dist = False
    server_changed = False
    stopped = False
    try:
        run(['systemctl', 'stop', 'hiredispatch'])
        stopped = True
        stopped_value = validate()
        os.replace(ROOT / 'client/dist', old_dist)
        moved_dist = True
        os.replace(next_dist, ROOT / 'client/dist')
        server_temp = ROOT / 'server' / ('.app-next-' + uuid.uuid4().hex[:8])
        shutil.copy2(app, server_temp)
        os.replace(server_temp, ROOT / 'server/app.py')
        server_changed = True
        assert validate()['workspace_sha256'] == stopped_value['workspace_sha256']
        run(['systemctl', 'start', 'hiredispatch'])
        stopped = False
        health()
        for name, expected in manifest['files'].items():
            if name.startswith('client/dist/') or name == 'server/app.py':
                assert digest(ROOT / name) == expected
        with urllib.request.urlopen('http://127.0.0.1:8000/', timeout=5) as response:
            assert hashlib.sha256(response.read()).hexdigest() == manifest['files']['client/dist/index.html']
        current = validate()
    except BaseException:
        print('更新後の検査に失敗したため、前のプログラムへ戻します。', flush=True)
        run(['systemctl', 'stop', 'hiredispatch'])
        if server_changed:
            shutil.copy2(backup / 'app.py', ROOT / 'server/app.py')
        if moved_dist:
            if (ROOT / 'client/dist').exists():
                os.replace(ROOT / 'client/dist', release / ('failed-dist-' + uuid.uuid4().hex[:8]))
            os.replace(old_dist, ROOT / 'client/dist')
        run(['systemctl', 'start', 'hiredispatch'])
        stopped = False
        health()
        raise
    finally:
        if stopped:
            run(['systemctl', 'start', 'hiredispatch'])
    receipt = {'status': 'deployed', 'release_id': manifest['release_id'],
               'completed_at': datetime.now(ZoneInfo('Asia/Tokyo')).isoformat(),
               'backup': str(backup), 'database_backup': str(database_backup),
               'before': before, 'after': current, 'isolated_api_checks': smoke['checks'],
               'deployment_preserves_workspace': True}
    (release / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    print('4/4 更新とサービス再起動・稼働確認が完了しました。', flush=True)
    print('RECEIPT=' + json.dumps(receipt, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('停止: ' + str(error), file=sys.stderr, flush=True)
        sys.exit(1)
