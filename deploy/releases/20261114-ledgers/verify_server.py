"""Read-only active validation; write tests are restricted to disposable DBs."""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import secrets
import struct
import threading
from datetime import date, timedelta
from http.server import ThreadingHTTPServer
import urllib.error
import urllib.request
import zlib


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--app', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--exercise', action='store_true')
    args = parser.parse_args()
    if args.exercise and not args.database.startswith('hiredispatch_verify_'):
        raise RuntimeError('書き込み検証は一時DBに限定します。')
    os.environ['DATABASE_URL'] = 'dbname=' + args.database
    os.environ['STATIC_ROOT'] = str(Path(args.app).resolve().parents[1] / 'client/dist')
    spec = importlib.util.spec_from_file_location('release_app', args.app)
    app = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(app)
    with app.psycopg2.connect(dbname=args.database) as conn:
        conn.set_session(readonly=True)
        with conn.cursor() as cur:
            cur.execute('SELECT revision,value FROM workspace WHERE id=1')
            revision, original = cur.fetchone()
            app.validate(original)
    result = {'revision': revision,
              'workspace_sha256': hashlib.sha256(json.dumps(original, sort_keys=True, ensure_ascii=False).encode()).hexdigest(),
              'counts': {key: len(original[key]) for key in ('drivers', 'vehicles', 'partners')}}
    if not args.exercise:
        print(json.dumps(result))
        return
    app.initialize()
    app.Handler.log_message = lambda *args: None
    token = secrets.token_urlsafe(32)
    conn = app.connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute("INSERT INTO sessions(token,expires_at) VALUES(%s,now()+interval '5 minutes')", (hashlib.sha256(token.encode()).hexdigest(),))
    finally:
        app.POOL.putconn(conn)
    server = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = 'http://127.0.0.1:' + str(server.server_port)

    def call(path, payload=None, method=None, expected=200, authenticated=True, content=None, headers=None):
        body = json.dumps(payload).encode() if payload is not None else content
        request_headers = {'Content-Type': 'application/json', 'Origin': base, **(headers or {})}
        if authenticated:
            request_headers['Cookie'] = 'hire_session=' + token
        request = urllib.request.Request(base + path, data=body, method=method, headers=request_headers)
        try:
            response = urllib.request.urlopen(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read()
            if response.status != expected:
                raise RuntimeError(f'API検証失敗: {path}: HTTP {response.status}, expected {expected}')
            return raw, response.headers

    checks = []
    try:
        call('/api/workspace', authenticated=False, expected=401)
        checks.append('unauthenticated_access_rejected')
        html, _ = call('/')
        assert html == (app.ROOT / 'index.html').read_bytes()
        for asset in (app.ROOT / 'assets').iterdir():
            raw, _ = call('/assets/' + asset.name)
            assert raw == asset.read_bytes()
        checks.append('new_frontend_assets_served')

        def chunk(kind, data):
            return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
        png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 1, 1, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\0\x40\x80\xc0')) + chunk(b'IEND', b'')
        raw, _ = call('/api/files', content=png, method='POST', expected=201,
                      headers={'Content-Type': 'image/png', 'X-Filename': 'release-test.png'})
        photo = json.loads(raw)
        raw, headers = call(photo['url'] + '?inline=1')
        assert raw == png and headers.get_content_type() == 'image/png'
        call(photo['url'] + '?inline=1', authenticated=False, expected=401)
        raw, headers = call(photo['url'])
        assert raw == png and headers['Content-Disposition'].startswith('attachment')
        checks.append('photo_upload_inline_download_and_authentication')
        changed = copy.deepcopy(original)
        assert changed['drivers'] and changed['vehicles'] and changed['partners']
        today = date.today()
        assessment = {'id': 'release-test-' + secrets.token_hex(6), 'type': '一般診断',
                      'assessedAt': today.isoformat(), 'institution': 'リリース検証用',
                      'nextDueAt': (today + timedelta(days=365)).isoformat()}
        changed['drivers'][0]['facePhoto'] = {'id': photo['id'], 'type': 'photo', 'name': photo['name'], 'uri': photo['url'] + '?inline=1', 'uploadedAt': photo['addedAt']}
        changed['drivers'][0].setdefault('aptitudeRecords', []).append(assessment)
        tariff = {'id': 'release-test-' + secrets.token_hex(6), 'name': 'リリース検証用タリフ',
                  'baseFare': 35000, 'taxTreatment': 'included',
                  'discount': {'kind': 'yen', 'value': 1500}, 'kickback': {'kind': 'percent', 'value': 12.34}}
        changed['partners'][0].setdefault('tariffs', []).append(tariff)
        changed['vehicles'][0]['class'] = '自由入力区分・リリース検証'
        raw, _ = call('/api/workspace', {'revision': revision, 'value': changed}, method='PUT')
        saved_revision = json.loads(raw)['revision']
        raw, _ = call('/api/workspace')
        assert json.loads(raw)['value'] == changed
        checks.append('all_three_ledger_features_persisted')
        tariff['baseFare'] = 36000
        assessment['nextDueAt'] = (today + timedelta(days=366)).isoformat()
        raw, _ = call('/api/workspace', {'revision': saved_revision, 'value': changed}, method='PUT')
        latest_revision = json.loads(raw)['revision']
        raw, _ = call('/api/workspace')
        assert json.loads(raw)['value'] == changed
        call('/api/workspace', {'revision': saved_revision, 'value': changed}, method='PUT', expected=409)
        invalid = copy.deepcopy(changed)
        invalid['partners'][0]['tariffs'][-1]['kickback']['value'] = 100.01
        call('/api/workspace', {'revision': latest_revision, 'value': invalid}, method='PUT', expected=400)
        raw, _ = call('/api/workspace')
        assert json.loads(raw)['revision'] == latest_revision
        checks.append('edits_persist_and_conflicts_and_invalid_money_rejected')
        assert changed['drivers'][1:] == original['drivers'][1:]
        assert changed['partners'][1:] == original['partners'][1:]
        checks.append('other_drivers_and_partners_unchanged')
        # Attendance/rollcall write checks are limited to this disposable clone.
        duty_id = 'release-duty-' + secrets.token_hex(6)
        driver = original['drivers'][0]
        vehicle = original['vehicles'][0]
        shift = {'id': duty_id + '-1', 'dutyId': duty_id, 'recordedAt': '2000-01-02T00:00:00Z',
                 'recorder': 'リリース検証用', 'reason': '', 'driverId': driver['id'],
                 'driverName': driver.get('name', '検証用'), 'driverCode': driver.get('code', 'TEST'),
                 'dutyDate': '2000-01-01', 'clockIn': '2000-01-01T22:00:00+09:00', 'note': '', 'voided': False}
        changed.setdefault('dutyLogs', []).append(shift)
        raw, _ = call('/api/workspace', {'revision': latest_revision, 'value': changed}, method='PUT')
        attendance_revision = json.loads(raw)['revision']
        rollcall = {'at': '2000-01-01T22:10:00+09:00', 'executor': '検証用点呼担当', 'method': 'face',
                    'methodDetail': '', 'vehicleId': vehicle['id'], 'vehicleLabel': '検証用車両',
                    'alcohol': 'none', 'detectorUsed': 'yes', 'health': 'good', 'fatigue': 'none',
                    'sleep': 'enough', 'inspection': 'ok', 'instructions': '検証用', 'report': '', 'handover': '', 'response': ''}
        second = {**shift, 'id': duty_id + '-2', 'supersedes': shift['id'], 'reason': '乗務前点呼を追記', 'before': rollcall}
        changed['dutyLogs'].append(second)
        raw, _ = call('/api/workspace', {'revision': attendance_revision, 'value': changed}, method='PUT')
        rollcall_revision = json.loads(raw)['revision']
        third = {**second, 'id': duty_id + '-3', 'supersedes': second['id'], 'reason': '乗務後点呼と退勤を追記',
                 'clockOut': '2000-01-02T06:00:00+09:00', 'after': {**rollcall, 'at': '2000-01-02T05:50:00+09:00'}}
        changed['dutyLogs'].append(third)
        raw, _ = call('/api/workspace', {'revision': rollcall_revision, 'value': changed}, method='PUT')
        final_revision = json.loads(raw)['revision']
        raw, _ = call('/api/workspace')
        assert json.loads(raw)['value'] == changed
        assert changed['dutyLogs'][-3]['clockIn'] == changed['dutyLogs'][-1]['clockIn']
        tampered = copy.deepcopy(changed)
        tampered['dutyLogs'][-3]['note'] = '既存記録の上書き'
        call('/api/workspace', {'revision': final_revision, 'value': tampered}, method='PUT', expected=400)
        tampered = copy.deepcopy(changed)
        del tampered['dutyLogs']
        call('/api/workspace', {'revision': final_revision, 'value': tampered}, method='PUT', expected=400)
        raw, _ = call('/api/workspace')
        assert json.loads(raw)['value'] == changed and json.loads(raw)['revision'] == final_revision
        checks.append('overnight_attendance_linked_rollcalls_and_append_only_corrections_persist')
        checks.append('existing_duty_history_changes_and_deletions_rejected')
        result['checks'] = checks
        print(json.dumps(result))
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        app.POOL.closeall()


if __name__ == '__main__':
    main()
