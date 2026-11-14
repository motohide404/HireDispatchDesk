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


def add_exercise_driver(value, suffix):
    # A historical open test shift on an actual driver would overlap an existing
    # open duty, even if the test closes its own shift in a subsequent request.
    driver = copy.deepcopy(value['drivers'][0])
    driver.update(id=max(row['id'] for row in value['drivers']) + 1,
                  code='VERIFY-' + suffix, name='検証専用運転者', status='active')
    value['drivers'].append(driver)
    return driver


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
            archive_hash = hashlib.sha256()
            archive_counts = {}
            for table in ('transport_documents', 'transport_document_events'):
                cur.execute('SELECT to_regclass(%s)', (table,))
                present = cur.fetchone()[0]
                rows = []
                if present:
                    cur.execute('SELECT * FROM ' + table + ' ORDER BY id')
                    rows = cur.fetchall()
                archive_counts[table] = len(rows)
                archive_hash.update(json.dumps(rows, sort_keys=True, ensure_ascii=False, default=str).encode())
    result = {'revision': revision,
              'workspace_sha256': hashlib.sha256((json.dumps(original, sort_keys=True, ensure_ascii=False) + archive_hash.hexdigest()).encode()).hexdigest(),
              'transport_archive_sha256': archive_hash.hexdigest(), 'transport_archive_counts': archive_counts,
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
                try:
                    detail = json.loads(raw).get('error', '')
                except (ValueError, AttributeError):
                    detail = ''
                raise RuntimeError(f'API検証失敗: {path}: HTTP {response.status}, expected {expected}: {str(detail)[:500]}')
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
        future_job_ids = []
        for days in (1, 30, 365):
            job_id = 'release-future-' + secrets.token_hex(6)
            future_job_ids.append(job_id)
            day = (today + timedelta(days=days)).isoformat()
            changed['jobPool'].append({'id': job_id, 'title': '未来日予約の保存検証',
                                       'client': {'type': '個人', 'name': '検証用予約者', 'source': 'manual', 'email': 'test@example.com'},
                                       'start': day + 'T09:00:00+09:00', 'end': day + 'T10:00:00+09:00',
                                       'vehicleId': None, 'driverId': None, 'amount': 0, 'note': '複製DB内だけの検証'})
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
        saved_jobs = json.loads(raw)['value']['jobPool']
        assert all(any(job['id'] == identifier for job in saved_jobs) for identifier in future_job_ids)
        checks.append('future_jobs_tomorrow_next_month_next_year_persist_and_reload')
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
        staff = {'id': duty_id + '-staff', 'code': duty_id, 'name': '検証用運行管理者', 'officeName': '検証用営業所',
                 'role': 'manager', 'active': True, 'appointmentDate': '1999-01-01', 'qualification': '検証用'}
        changed.setdefault('staffMembers', []).append(staff)
        driver = add_exercise_driver(changed, duty_id)
        vehicle = original['vehicles'][0]
        shift = {'id': duty_id + '-1', 'dutyId': duty_id, 'recordedAt': '2000-01-02T00:00:00Z',
                 'recorder': staff['name'], 'recorderStaffId': staff['id'], 'reason': '', 'driverId': driver['id'],
                 'driverName': driver.get('name', '検証用'), 'driverCode': driver.get('code', 'TEST'),
                 'dutyDate': '2000-01-01', 'clockIn': '2000-01-01T22:00:00+09:00', 'note': '', 'voided': False}
        changed.setdefault('dutyLogs', []).append(shift)
        raw, _ = call('/api/workspace', {'revision': latest_revision, 'value': changed}, method='PUT')
        attendance_revision = json.loads(raw)['revision']
        rollcall = {'schemaVersion': 2, 'executorStaffId': staff['id'], 'executorRole': staff['role'], 'executorOffice': staff['officeName'],
                    'location': '検証用営業所', 'visualCheck': 'yes', 'detectorCondition': 'ok', 'otherNotes': '',
                    'at': '2000-01-01T22:10:00+09:00', 'executor': staff['name'], 'method': 'face',
                    'methodDetail': '', 'vehicleId': vehicle['id'], 'vehicleLabel': '検証用車両',
                    'alcohol': 'none', 'detectorUsed': 'yes', 'health': 'good', 'fatigue': 'none',
                    'sleep': 'enough', 'inspection': 'ok', 'instructions': '検証用', 'report': '', 'handover': '', 'response': ''}
        second = {**shift, 'id': duty_id + '-2', 'supersedes': shift['id'], 'reason': '乗務前点呼を追記', 'before': rollcall}
        changed['dutyLogs'].append(second)
        raw, _ = call('/api/workspace', {'revision': attendance_revision, 'value': changed}, method='PUT')
        rollcall_revision = json.loads(raw)['revision']
        third = {**second, 'id': duty_id + '-3', 'supersedes': second['id'], 'reason': '乗務後点呼と退勤を追記',
                 'clockOut': '2000-01-02T06:00:00+09:00', 'after': {**rollcall, 'at': '2000-01-02T05:50:00+09:00', 'vehicleReport': '異常なし', 'roadReport': '異常なし', 'operationReport': '異常なし', 'handoverStatus': 'none'}}
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
        tampered = copy.deepcopy(changed)
        invalid_fourth = {**copy.deepcopy(third), 'id': duty_id + '-4', 'supersedes': third['id'], 'reason': '執行者の不正差替え'}
        invalid_fourth['after']['executor'] = '職員台帳にない名前'
        tampered['dutyLogs'].append(invalid_fourth)
        call('/api/workspace', {'revision': final_revision, 'value': tampered}, method='PUT', expected=400)
        tampered = copy.deepcopy(changed)
        tampered['staffMembers'] = [row for row in tampered['staffMembers'] if row['id'] != staff['id']]
        call('/api/workspace', {'revision': final_revision, 'value': tampered}, method='PUT', expected=400)
        tampered = copy.deepcopy(changed)
        missing_report = {**copy.deepcopy(third), 'id': duty_id + '-5', 'supersedes': third['id'], 'reason': '報告の欠落'}
        missing_report['after']['roadReport'] = ''
        tampered['dutyLogs'].append(missing_report)
        call('/api/workspace', {'revision': final_revision, 'value': tampered}, method='PUT', expected=400)
        raw, _ = call('/api/workspace')
        assert json.loads(raw)['value'] == changed
        checks.append('registered_executor_identity_missing_reports_and_staff_deletion_rejected')
        # Daily-inspection writes are also restricted to the disposable clone.
        staff.update(maintenanceManager=True, maintenanceAppointmentDate='1999-01-01')
        profile = {'id': duty_id + '-profile', 'vehicleId': vehicle['id'],
                   'vehicleLabel': vehicle['name'] + ' / ' + vehicle['plateNo'],
                   'at': '2000-01-01T00:00:00Z', 'staffId': staff['id'], 'staffName': staff['name'],
                   'basis': '複製DB検証用の仮資料', 'methods': '複製DB検証用の点検方法', 'excluded': {}}
        changed.setdefault('inspectionProfiles', []).append(profile)
        inspection = {'id': duty_id + '-inspection', 'inspectionId': duty_id + '-inspection-series',
                      'reason': '', 'recordedAt': '2000-01-01T12:56:00Z', 'at': '2000-01-01T21:55:00+09:00',
                      'vehicleId': vehicle['id'], 'vehicleLabel': profile['vehicleLabel'],
                      'driverId': driver['id'], 'driverName': driver['name'], 'profileId': profile['id'],
                      'odometer': 100, 'results': {key: 'ok' for key in app.INSPECTION_KEYS},
                      'notes': '', 'previousIssues': '複製DB確認用：前回報告なし'}
        changed.setdefault('dailyInspections', []).append(inspection)
        review = {'id': duty_id + '-review', 'inspectionId': inspection['id'],
                  'at': '2000-01-01T13:00:00Z', 'staffId': staff['id'], 'staffName': staff['name'],
                  'decision': 'allow', 'note': '複製DB確認用の判断'}
        changed.setdefault('inspectionReviews', []).append(review)
        raw, _ = call('/api/workspace', {'revision': final_revision, 'value': changed}, method='PUT')
        final_revision = json.loads(raw)['revision']
        for key in app.INSPECTION_COLLECTIONS:
            tampered = copy.deepcopy(changed)
            tampered[key][-1]['id'] += '-overwritten'
            call('/api/workspace', {'revision': final_revision, 'value': tampered}, method='PUT', expected=400)
        tampered = copy.deepcopy(changed)
        defect = {**copy.deepcopy(inspection), 'id': duty_id + '-defect', 'inspectionId': duty_id + '-defect-series',
                  'notes': '検証用の異常'}
        defect['results']['TY01'] = 'defect'
        tampered['dailyInspections'].append(defect)
        tampered['inspectionReviews'].append({**review, 'id': duty_id + '-unsafe-review', 'inspectionId': defect['id']})
        call('/api/workspace', {'revision': final_revision, 'value': tampered}, method='PUT', expected=400)
        raw, _ = call('/api/workspace')
        assert json.loads(raw)['value'] == changed
        checks.append('daily_inspection_and_maintenance_review_persist_and_history_and_unsafe_allow_rejected')
        # Long-lived documents have separate append-only tables, outside the
        # shared workspace size limit. All write checks stay in this clone.
        source_job = next(row for row in changed['jobPool'] if row['id'] == future_job_ids[0])
        source_job.update(driverId=driver['id'], vehicleId=vehicle['id'])
        raw, _ = call('/api/workspace', {'revision': final_revision, 'value': changed}, method='PUT')
        final_revision = json.loads(raw)['revision']
        values = {key: '' for key in app.TRANSPORT_FIELDS}
        day = source_job['start'][:10]
        values.update(issuerName='検証専用事業者', officeName='検証用営業所', issuerAddress='検証用住所',
                      issuerPhone='検証用連絡先', emergencyContact='検証用緊急連絡先', serviceArea='検証用区域',
                      applicantName='検証用申込者', applicantContact='test@example.com',
                      operationStartPlace='車庫', operationStartAt=day + 'T08:00:00+09:00',
                      boardingPlace='乗車地', boardingAt=day + 'T09:00:00+09:00',
                      alightingPlace='降車地', alightingAt=day + 'T10:00:00+09:00',
                      operationEndPlace='車庫', operationEndAt=day + 'T11:00:00+09:00',
                      fare='11000', charge='0', applicationMethod='phone', priceStatus='fixed', timeStatus='planned',
                      safetyInstructions='検証用の安全指示')
        document_id = duty_id + '-acceptance'
        acceptance = {'id': document_id, 'documentId': document_id, 'number': document_id,
                      'reason': '', 'voided': False, 'kind': 'acceptance', 'createdAt': '2000-01-01T00:00:00Z',
                      'issuerStaffId': staff['id'], 'issuerStaffName': staff['name'], 'values': values,
                      'source': {'collection': 'jobPool', **{key: source_job[key] for key in ('id', 'title', 'start', 'end')}}}
        call('/api/transport-documents?date=' + day, authenticated=False, expected=401)
        call('/api/transport-documents', acceptance, method='POST', expected=201)
        call('/api/transport-documents', acceptance, method='POST')  # Exact retry is idempotent.
        modified = copy.deepcopy(acceptance); modified['values']['fare'] = '12000'
        call('/api/transport-documents', modified, method='POST', expected=400)
        raw, _ = call('/api/transport-documents?date=' + day)
        assert [row for row in json.loads(raw)['records'] if row['id'] == document_id] == [acceptance]
        event = {'id': duty_id + '-delivery', 'recordId': document_id, 'kind': 'delivery',
                 'at': '2000-01-01T10:00:00+09:00', 'staffId': staff['id'], 'staffName': staff['name'],
                 'recipient': '検証用申込者', 'method': '手渡し', 'note': '検証用の交付確認'}
        call('/api/transport-documents/events', event, method='POST', expected=201)
        call('/api/transport-documents/events', event, method='POST')
        corrected = {**copy.deepcopy(acceptance), 'id': document_id + '-v2', 'supersedes': document_id,
                     'reason': '確定額へ訂正', 'createdAt': '2000-01-02T00:00:00Z'}
        corrected['values']['fare'] = '12000'
        call('/api/transport-documents', corrected, method='POST', expected=201)
        call('/api/transport-documents', {**corrected, 'id': document_id + '-stale'}, method='POST', expected=400)
        call('/api/transport-documents/events', {**event, 'id': duty_id + '-stale-delivery'}, method='POST', expected=400)
        raw, _ = call('/api/transport-documents?documentId=' + document_id)
        saved = json.loads(raw)
        assert saved['records'] == [acceptance, corrected] and saved['events'] == [event]
        instruction_id = duty_id + '-instruction'
        instruction = {**copy.deepcopy(acceptance), 'id': instruction_id, 'documentId': instruction_id,
                       'number': instruction_id, 'kind': 'instruction', 'driverId': driver['id'],
                       'driverName': driver['name'], 'vehicleId': vehicle['id'], 'vehiclePlate': vehicle['plateNo']}
        call('/api/transport-documents', instruction, method='POST', expected=201)
        call('/api/transport-documents/events', {**event, 'id': duty_id + '-instruction-event',
                                               'recordId': instruction_id, 'kind': 'instruction',
                                               'recipient': driver['name'], 'note': '指示と携行方法の確認'}, method='POST', expected=201)
        cancelled = {**corrected, 'id': document_id + '-v3', 'supersedes': corrected['id'], 'voided': True, 'reason': '検証用の取消'}
        call('/api/transport-documents', cancelled, method='POST', expected=201)
        raw, _ = call('/api/workspace')
        assert json.loads(raw)['value'] == changed and json.loads(raw)['revision'] == final_revision
        checks.append('transport_documents_separate_storage_retry_immutable_history_corrections_cancellation_and_delivery')
        checks.append('operation_instruction_assigned_driver_vehicle_and_confirmation_persist')
        result['checks'] = checks
        print(json.dumps(result))
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        app.POOL.closeall()


if __name__ == '__main__':
    main()
