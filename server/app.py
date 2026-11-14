"""Small internal test service. PostgreSQL stores the workspace and attachments.

Run behind a TLS reverse proxy, bound to localhost. No cloud/SMTP/payment integration.
"""
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import time
from datetime import date, datetime
from decimal import Decimal
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

import psycopg2
from psycopg2.extras import Json
from psycopg2.pool import ThreadedConnectionPool

ROOT = Path(os.environ.get('STATIC_ROOT', Path(__file__).resolve().parents[1] / 'client/dist')).resolve()
POOL = None
ALLOWED = {'drivers', 'vehicles', 'partners', 'offices', 'contacts', 'officeOrder', 'bookings', 'appDuties', 'jobPool'}


def connection():
    return POOL.getconn()


def initialize():
    global POOL
    POOL = ThreadedConnectionPool(1, 4, os.environ.get('DATABASE_URL', 'dbname=hiredispatch'))
    conn = connection()
    try:
        with conn, conn.cursor() as cur:
            cur.execute('''CREATE TABLE IF NOT EXISTS workspace (
                id integer PRIMARY KEY CHECK (id=1), revision bigint NOT NULL,
                value jsonb, updated_at timestamptz NOT NULL DEFAULT now());
                INSERT INTO workspace(id,revision,value) VALUES(1,0,NULL) ON CONFLICT DO NOTHING;
                CREATE TABLE IF NOT EXISTS sessions (
                    token text PRIMARY KEY, expires_at timestamptz NOT NULL);
                CREATE TABLE IF NOT EXISTS attachments (
                    id text PRIMARY KEY, name text NOT NULL, mime text NOT NULL,
                    content bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
                CREATE TABLE IF NOT EXISTS login_attempts (
                    address text PRIMARY KEY, attempts integer NOT NULL, started_at timestamptz NOT NULL DEFAULT now());
                CREATE TABLE IF NOT EXISTS workspace_history (
                    revision bigint PRIMARY KEY, value jsonb NOT NULL, saved_at timestamptz NOT NULL DEFAULT now());''')
    finally:
        POOL.putconn(conn)


def interval(item):
    start, end = (datetime.fromisoformat(item[field]) for field in ('start', 'end'))
    if start.tzinfo is None or end.tzinfo is None or end <= start:
        raise ValueError('開始・終了日時を確認してください。')
    return start, end


def overlaps(a, b):
    a0, a1 = interval(a)
    b0, b1 = interval(b)
    return a0 < b1 and b0 < a1


def ledger_date(value):
    if value is None or value == '':
        return None
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise ValueError('日付は年月日で入力してください。')
    return date.fromisoformat(value)


def ledger_text(value, maximum, label, required=False):
    if value is None and not required:
        return
    if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()):
        raise ValueError(label + 'を確認してください。')


def ledger_money(value, percent=False):
    if type(value) not in (int, float):
        raise ValueError('金額・率は数値で入力してください。')
    number = Decimal(str(value))
    limit = Decimal(100 if percent else 9999999999)
    if not number.is_finite() or number < 0 or number > limit:
        raise ValueError('金額・率の範囲を確認してください。')
    scaled = number * (100 if percent else 1)
    if scaled != scaled.to_integral_value():
        raise ValueError('金額は円単位、率は小数2桁までで入力してください。')


def ledger_adjustment(value):
    if not isinstance(value, dict) or value.get('kind') not in ('none', 'yen', 'percent'):
        raise ValueError('値引き・キックバックの単位を確認してください。')
    ledger_money(value.get('value'), value['kind'] == 'percent')
    if value['kind'] == 'none' and value['value'] != 0:
        raise ValueError('条件なしの場合は金額を0にしてください。')


def ledger_records(value, label):
    if not isinstance(value, list) or len(value) > 1000:
        raise ValueError(label + 'の件数・形式を確認してください。')
    ids = set()
    for row in value:
        if not isinstance(row, dict) or not isinstance(row.get('id'), str) or not row['id'] or row['id'] in ids:
            raise ValueError(label + 'のIDが不正または重複しています。')
        ids.add(row['id'])
    return value


def validate_ledgers(value):
    for driver in value['drivers']:
        photo = driver.get('facePhoto')
        if photo is not None:
            if not isinstance(photo, dict) or not isinstance(photo.get('uri'), str) or not re.fullmatch(r'/api/files/[a-f0-9]{32}\?inline=1', photo['uri']):
                raise ValueError('顔写真の保存先を確認してください。')
        for record in ledger_records(driver.get('aptitudeRecords', []), '適性診断'):
            ledger_text(record.get('type'), 80, '診断区分', required=True)
            assessed = ledger_date(record.get('assessedAt'))
            due = ledger_date(record.get('nextDueAt'))
            if assessed is None or (due is not None and due < assessed):
                raise ValueError('受診日・次回予定日を確認してください。')
            ledger_text(record.get('institution'), 200, '受診機関')
            ledger_text(record.get('notes'), 20000, '診断メモ')
    for vehicle in value['vehicles']:
        if 'class' in vehicle:
            ledger_text(vehicle['class'], 80, '車両区分', required=True)
    for partner in value['partners']:
        for tariff in ledger_records(partner.get('tariffs', []), 'タリフ'):
            ledger_text(tariff.get('name'), 200, 'タリフ名', required=True)
            ledger_text(tariff.get('vehicleClass'), 80, '車両区分')
            ledger_text(tariff.get('route'), 200, '区間・サービス')
            ledger_text(tariff.get('conditions'), 20000, '取引条件')
            if tariff.get('baseFare') is not None:
                ledger_money(tariff['baseFare'])
            if tariff.get('taxTreatment') not in ('included', 'excluded', 'unspecified'):
                raise ValueError('タリフの税区分を確認してください。')
            ledger_adjustment(tariff.get('discount'))
            ledger_adjustment(tariff.get('kickback'))
            start, end = ledger_date(tariff.get('validFrom')), ledger_date(tariff.get('validUntil'))
            if start and end and start > end:
                raise ValueError('タリフの適用期間を確認してください。')


def validate_job_customer(client, workspace):
    if client is None:
        return
    if not isinstance(client, dict):
        raise ValueError('お客様の情報を確認してください。')
    # Earlier reservations only stored name/type. Keep them usable without
    # requiring contact information to be backfilled during unrelated edits.
    if not any(key in client for key in ('source', 'partnerId', 'officeId', 'contactId', 'phone', 'email', 'contactName')):
        return
    ledger_text(client.get('name'), 200, 'お客様名', required=True)
    ledger_text(client.get('type'), 80, '顧客区分', required=True)
    for key, maximum in (('phone', 40), ('email', 254), ('contactName', 120), ('officeName', 200)):
        ledger_text(client.get(key), maximum, 'お客様の連絡先')
    phone, email = client.get('phone') or '', client.get('email') or ''
    if phone and (not re.fullmatch(r'\+?[0-9\s().-]+', phone) or not 6 <= len(re.sub(r'[^0-9]', '', phone)) <= 20):
        raise ValueError('お客様の電話番号を確認してください。')
    if email and not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
        raise ValueError('お客様のメールアドレスを確認してください。')
    source = client.get('source')
    if source is not None and source not in ('ledger', 'manual'):
        raise ValueError('お客様の登録区分を確認してください。')
    if source and not (phone.strip() or email.strip()):
        raise ValueError('連絡が取れる電話番号かメールアドレスを入力してください。')
    for key in ('partnerId', 'officeId', 'contactId'):
        if key in client:
            ledger_text(client[key], 200, 'お客様の台帳参照', required=True)
    partner_id = client.get('partnerId')
    office_id = client.get('officeId')
    contact_id = client.get('contactId')
    if source == 'ledger' and not partner_id:
        raise ValueError('取引先台帳からお客様を選択してください。')
    if source == 'manual' and any((partner_id, office_id, contact_id)):
        raise ValueError('お客様の登録区分と台帳参照を確認してください。')
    if (office_id or contact_id) and not partner_id:
        raise ValueError('取引先台帳からお客様を選択してください。')
    if partner_id and not any(item['id'] == partner_id for item in workspace['partners']):
        raise ValueError('選択した取引先が見つかりません。')
    if office_id and not any(item['id'] == office_id and item.get('partnerId') == partner_id for item in workspace['offices']):
        raise ValueError('選択した拠点が取引先と一致しません。')
    if contact_id and not any(item['id'] == contact_id and item.get('partnerId') == partner_id
                              and item.get('affiliationType') == ('office' if office_id else 'partner')
                              and item.get('affiliationId') == (office_id or partner_id) for item in workspace['contacts']):
        raise ValueError('選択した担当者が取引先・拠点と一致しません。')


def inline_image_type(content):
    # Only raster formats may be displayed inline. HTML/SVG attachments keep
    # their existing download behavior, regardless of their supplied MIME type.
    if content.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if content.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if len(content) >= 12 and content[:4] == b'RIFF' and content[8:12] == b'WEBP':
        return 'image/webp'
    return None


def duty_timestamp(value, label, japan=True):
    if not isinstance(value, str) or len(value) > 40 or (japan and not value.endswith('+09:00')):
        raise ValueError(label + 'は日本時間の日時で入力してください。')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError(label + 'のタイムゾーンを確認してください。')
    return parsed


def validate_staff_members(value):
    codes = set()
    for member in value.get('staffMembers', []):
        for key, label in (('id', '職員ID'), ('code', '職員コード'), ('name', '職員氏名'), ('officeName', '所属営業所')):
            ledger_text(member.get(key), 200, label, required=True)
        if member['code'].strip() in codes:
            raise ValueError('職員コードが重複しています。')
        codes.add(member['code'].strip())
        if member.get('role') not in ('manager', 'assistant', 'office') or type(member.get('active')) is not bool:
            raise ValueError('職員の役割・在籍区分を確認してください。')
        appointed = ledger_date(member.get('appointmentDate'))
        if member['role'] != 'office' and appointed is None:
            raise ValueError('点呼担当者の選任日を入力してください。')
        ledger_text(member.get('qualification'), 200, '資格・講習の確認メモ')


def validate_duty_logs(value):
    records = value.get('dutyLogs', [])
    drivers = {row['id'] for row in value['drivers']}
    vehicles = {row['id'] for row in value['vehicles']}
    seen, latest = {}, {}
    for record in records:
        for key in ('id', 'dutyId'):
            ledger_text(record.get(key), 100, '勤務記録ID', required=True)
        ledger_text(record.get('recorder'), 200, '記録者', required=True)
        ledger_text(record.get('recorderStaffId'), 200, '記録担当職員ID')
        ledger_text(record.get('driverName'), 200, '運転者名', required=True)
        ledger_text(record.get('driverCode'), 200, '運転者コード', required=True)
        ledger_text(record.get('reason'), 2000, '追記訂正理由')
        ledger_text(record.get('note'), 2000, '勤務メモ')
        if type(record.get('driverId')) is not int or record['driverId'] not in drivers or type(record.get('voided')) is not bool:
            raise ValueError('勤務の運転者・取消区分を確認してください。')
        duty_timestamp(record.get('recordedAt'), '記録日時', japan=False)
        start = duty_timestamp(record.get('clockIn'), '出勤日時')
        day = ledger_date(record.get('dutyDate'))
        if day is None or start.date() != day:
            raise ValueError('勤務日と出勤日時が一致しません。')
        end = duty_timestamp(record['clockOut'], '退勤日時') if record.get('clockOut') else None
        if end is not None and end < start:
            raise ValueError('退勤日時は出勤以降にしてください。')
        previous = record.get('supersedes')
        if previous:
            ledger_text(previous, 100, '訂正元ID', required=True)
            old = seen.get(previous)
            if old is None or old['dutyId'] != record['dutyId'] or latest.get(record['dutyId']) != previous or old['driverId'] != record['driverId'] or old['dutyDate'] != record['dutyDate']:
                raise ValueError('勤務記録の追記・訂正元が最新の記録ではありません。')
            ledger_text(record.get('reason'), 2000, '追記訂正理由', required=True)
        elif record['dutyId'] in latest or record['voided']:
            raise ValueError('勤務IDが重複、または新規記録が取消になっています。')
        seen[record['id']] = record
        latest[record['dutyId']] = record['id']
        for phase in ('before', 'after'):
            call = record.get(phase)
            if call is None:
                continue
            if not isinstance(call, dict):
                raise ValueError('点呼の記録形式を確認してください。')
            version = call.get('schemaVersion')
            if version is not None and (type(version) is not int or version != 2):
                raise ValueError('点呼記録の版を確認してください。')
            at = duty_timestamp(call.get('at'), '点呼日時')
            if at < start or (end is not None and at > end):
                raise ValueError('点呼日時は出勤から退勤の間にしてください。')
            if phase == 'after' and record.get('before') and at < duty_timestamp(record['before']['at'], '乗務前点呼日時'):
                raise ValueError('乗務後点呼は乗務前点呼以降にしてください。')
            if type(call.get('vehicleId')) is not int or call['vehicleId'] not in vehicles:
                raise ValueError('点呼の車両を確認してください。')
            for key, label in (('executor', '点呼執行者'), ('vehicleLabel', '車両表示')):
                ledger_text(call.get(key), 200, label, required=True)
            for key in ('methodDetail', 'instructions', 'report', 'handover', 'response'):
                ledger_text(call.get(key), 2000, '点呼の記録内容')
            for key, options in {'method': ('face', 'phone', 'other'), 'alcohol': ('none', 'detected'),
                                 'detectorUsed': ('yes', 'no')}.items():
                if call.get(key) not in options:
                    raise ValueError('点呼の確認項目をすべて選択してください。')
            if phase == 'before' or version != 2:
                for key, options in {'health': ('good', 'concern'), 'fatigue': ('none', 'concern'), 'sleep': ('enough', 'insufficient')}.items():
                    if call.get(key) not in options:
                        raise ValueError('疾病・疲労・睡眠不足の状況を選択してください。')
            if phase == 'before' and call.get('inspection') not in (('ok', 'concern', 'not_done') if version == 2 else ('ok', 'concern')):
                raise ValueError('日常点検の状況を選択してください。')
            if version == 2:
                for key, label in (('executorStaffId', '点呼担当職員ID'), ('executorOffice', '点呼担当の営業所'), ('location', '点呼場所')):
                    ledger_text(call.get(key), 200, label, required=True)
                if call.get('executorRole') not in ('manager', 'assistant'):
                    raise ValueError('点呼は運行管理者または選任された補助者を指定してください。')
                for key in ('vehicleReport', 'roadReport', 'operationReport', 'otherNotes'):
                    ledger_text(call.get(key), 2000, '点呼報告・その他事項', required=phase == 'after' and key != 'otherNotes')
                if call.get('visualCheck') not in ('yes', 'no') or call.get('detectorCondition') not in ('ok', 'fault', 'unchecked'):
                    raise ValueError('目視・応答等の確認と検知器の状態を記録してください。')
                if phase == 'before':
                    ledger_text(call.get('instructions'), 2000, '指示事項', required=True)
                else:
                    if call.get('handoverStatus') not in ('none', 'done', 'not_done'):
                        raise ValueError('交替運転者への通告状況を選択してください。')
                    if call['handoverStatus'] != 'none':
                        ledger_text(call.get('handover'), 2000, '通告内容・未通告の理由', required=True)
            if call['method'] != 'face':
                ledger_text(call.get('methodDetail'), 2000, '対面以外の具体的方法・理由', required=True)
            amount = call.get('alcoholValue')
            if amount is not None:
                if type(amount) not in (int, float):
                    raise ValueError('アルコール測定値は数値で入力してください。')
                number = Decimal(str(amount))
                if not number.is_finite() or number < 0 or number > 10 or number * 1000 != (number * 1000).to_integral_value():
                    raise ValueError('アルコール測定値は0〜10 mg/L、小数3桁以内で入力してください。')
            attention = call['alcohol'] == 'detected' or (amount is not None and amount > 0) or call['detectorUsed'] == 'no' or call.get('health') == 'concern' or call.get('fatigue') == 'concern' or call.get('sleep') == 'insufficient' or call.get('inspection') in ('concern', 'not_done') or call.get('visualCheck') == 'no' or call.get('detectorCondition') in ('fault', 'unchecked') or call.get('handoverStatus') == 'not_done'
            if attention:
                ledger_text(call.get('response'), 2000, '確認事項への対応内容', required=True)
    active = [seen[identifier] for identifier in latest.values() if not seen[identifier]['voided']]
    by_driver = {}
    for record in active:
        by_driver.setdefault(record['driverId'], []).append(record)
    for shifts in by_driver.values():
        shifts.sort(key=lambda record: record['clockIn'])
        for previous, current in zip(shifts, shifts[1:]):
            if not previous.get('clockOut') or duty_timestamp(previous['clockOut'], '退勤日時') > duty_timestamp(current['clockIn'], '出勤日時'):
                raise ValueError('同じ運転者の勤務時間が重複しています。未退勤の勤務を確認してください。')


def preserve_duty_logs(previous, current):
    # The complete ordered history is immutable. Corrections append a new version.
    old = (previous or {}).get('dutyLogs', [])
    new = current.get('dutyLogs', [])
    if new[:len(old)] != old:
        raise ValueError('保存済みの点呼・出勤記録は変更・削除できません。理由を付けて追記・訂正してください。')
    previous_ids = {row['id'] for row in old}
    old_by_id = {row['id']: row for row in old}
    staff = {row['id']: row for row in current.get('staffMembers', [])}
    for row in new:
        references = [row.get('recorderStaffId')] + [(row.get(phase) or {}).get('executorStaffId') for phase in ('before', 'after')]
        if any(identifier and identifier not in staff for identifier in references):
            raise ValueError('記録に使われた職員は削除できません。在籍・利用状態を変更してください。')
    now = time.time() + 300
    for row in new:
        if row['id'] in previous_ids:
            continue
        recorder = staff.get(row.get('recorderStaffId'))
        if not recorder or not recorder['active'] or row['recorder'] != recorder['name']:
            raise ValueError('職員台帳から記録担当者を選択してください。旧画面は再読み込みしてください。')
        original = old_by_id.get(row.get('supersedes'), {})
        for phase in ('before', 'after'):
            call = row.get(phase)
            if original.get(phase) and not call:
                raise ValueError('保存済みの点呼は消去できません。訂正または勤務の取消として記録してください。')
            if not call or call == original.get(phase):
                continue
            executor = staff.get(call.get('executorStaffId'))
            if call.get('schemaVersion') != 2 or not executor or not executor['active'] or executor['role'] not in ('manager', 'assistant'):
                raise ValueError('点呼執行者を職員台帳の運行管理者・補助者から選択してください。')
            if executor['name'] != call['executor'] or executor['role'] != call.get('executorRole') or executor['officeName'] != call.get('executorOffice'):
                raise ValueError('点呼執行者の情報が職員台帳と一致しません。選択し直してください。')
            if ledger_date(executor['appointmentDate']) > duty_timestamp(call['at'], '点呼日時').date():
                raise ValueError('点呼執行者の選任日より前の点呼は記録できません。')
        for value in (row['clockIn'], row.get('clockOut'), (row.get('before') or {}).get('at'), (row.get('after') or {}).get('at'), row['recordedAt']):
            if value and duty_timestamp(value, '実績日時', japan=False).timestamp() > now:
                raise ValueError('実際に実施した日時を入力してください。未来の実績は保存できません。')


def validate(value):
    if not isinstance(value, dict) or not ALLOWED.issubset(value) or set(value) - ALLOWED - {'dutyLogs', 'staffMembers'}:
        raise ValueError('保存データの形式が正しくありません。')
    for key in set(value) - {'officeOrder'}:
        if not isinstance(value[key], list) or len(value[key]) > 10000:
            raise ValueError('データ件数または形式を確認してください。')
        ids = []
        for row in value[key]:
            if not isinstance(row, dict) or not isinstance(row.get('id'), (str, int)):
                raise ValueError('データのIDが正しくありません。')
            ids.append(str(row['id']))
        if len(set(ids)) != len(ids):
            raise ValueError('同じIDが重複しています。')
    if not isinstance(value['officeOrder'], dict):
        raise ValueError('拠点の並び順が正しくありません。')
    validate_ledgers(value)
    validate_staff_members(value)
    validate_duty_logs(value)
    vehicles = {row['id'] for row in value['vehicles']}
    drivers = {row['id'] for row in value['drivers']}
    scheduled = value['bookings'] + value['appDuties']
    for row in scheduled + value['jobPool']:
        interval(row)
        validate_job_customer(row.get('client'), value)
        if row.get('driverId') is not None and row['driverId'] not in drivers:
            raise ValueError('運転者が見つかりません。')
        if row.get('vehicleId') is not None and row['vehicleId'] not in vehicles:
            raise ValueError('車両が見つかりません。')
    for index, row in enumerate(scheduled):
        if row.get('vehicleId') not in vehicles:
            raise ValueError('配車する車両を指定してください。')
        for other in scheduled[index + 1:]:
            if not overlaps(row, other):
                continue
            if row['vehicleId'] == other['vehicleId']:
                raise ValueError('同じ車両に時間が重複する配車があります。')
            if row.get('driverId') is not None and row.get('driverId') == other.get('driverId'):
                raise ValueError('同じ運転者に時間が重複する配車があります。')


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        # Never log request bodies, passwords, cookies or attachment contents.
        print('%s %s' % (self.command, self.path.split('?')[0]), flush=True)

    def send(self, status, body, content_type='application/json; charset=utf-8', headers=None):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        # Rejected requests can leave an unread body. Do not reuse that connection.
        self.close_connection = True
        self.send_header('Connection', 'close')
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")
        for key, item in (headers or {}).items():
            self.send_header(key, item)
        self.end_headers()
        self.wfile.write(body)

    def body(self, limit=2 * 1024 * 1024):
        size = int(self.headers.get('Content-Length', '0'))
        if size < 1 or size > limit:
            raise ValueError('データが空、またはサイズが大きすぎます。')
        return self.rfile.read(size)

    def csrf_ok(self):
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            return False
        return self.headers.get('Sec-Fetch-Site') not in ('cross-site',)

    def authenticated(self, cur):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            token = cookie['hire_session'].value
        except (KeyError, ValueError):
            return False
        cur.execute('SELECT 1 FROM sessions WHERE token=%s AND expires_at>now()', (hashlib.sha256(token.encode()).hexdigest(),))
        return cur.fetchone() is not None

    def do_GET(self):
        self.handle_request('GET')

    def do_POST(self):
        self.handle_request('POST')

    def do_PUT(self):
        self.handle_request('PUT')

    def handle_request(self, method):
        path = urlsplit(self.path).path
        if method != 'GET' and not self.csrf_ok():
            self.send(403, {'error': '別サイトからの操作は許可されていません。'})
            return
        conn = connection()
        try:
            with conn, conn.cursor() as cur:
                if path == '/api/health' and method == 'GET':
                    cur.execute('SELECT 1')
                    self.send(200, {'status': 'ok', 'environment': 'test'})
                    return
                if path == '/api/login' and method == 'POST':
                    self.login(cur)
                    return
                if path.startswith('/api/'):
                    if not self.authenticated(cur):
                        self.send(401, {'error': 'ログインが必要です。'})
                        return
                    if path == '/api/logout' and method == 'POST':
                        cookie = SimpleCookie(self.headers.get('Cookie', ''))
                        token = cookie['hire_session'].value
                        cur.execute('DELETE FROM sessions WHERE token=%s', (hashlib.sha256(token.encode()).hexdigest(),))
                        conn.commit()
                        self.send(200, {'ok': True}, headers={'Set-Cookie': 'hire_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'})
                    elif path == '/api/workspace' and method == 'GET':
                        cur.execute('SELECT revision,value FROM workspace WHERE id=1')
                        row = cur.fetchone()
                        self.send(200, {'revision': row[0], 'value': row[1]})
                    elif path == '/api/workspace' and method == 'PUT':
                        payload = json.loads(self.body())
                        validate(payload['value'])
                        cur.execute('SELECT revision,value FROM workspace WHERE id=1 FOR UPDATE')
                        current, old_value = cur.fetchone()
                        if type(payload.get('revision')) is not int or current != payload['revision']:
                            self.send(409, {'error': 'ほかの画面から更新されています。再読み込みしてください。'})
                            return
                        preserve_duty_logs(old_value, payload['value'])
                        if old_value:
                            cur.execute('INSERT INTO workspace_history(revision,value) VALUES(%s,%s) ON CONFLICT DO NOTHING', (current, Json(old_value)))
                        cur.execute('UPDATE workspace SET revision=revision+1,value=%s,updated_at=now() WHERE id=1', (Json(payload['value']),))
                        conn.commit()
                        self.send(200, {'revision': current + 1})
                    elif path == '/api/files' and method == 'POST':
                        content = self.body(5 * 1024 * 1024)
                        name = unquote(self.headers.get('X-Filename', 'attachment'))[:200].replace('\r', '').replace('\n', '')
                        file_id = secrets.token_hex(16)
                        cur.execute('INSERT INTO attachments(id,name,mime,content) VALUES(%s,%s,%s,%s)', (file_id, name, self.headers.get('Content-Type', 'application/octet-stream')[:100], psycopg2.Binary(content)))
                        conn.commit()
                        self.send(201, {'id': file_id, 'name': name, 'type': self.headers.get('Content-Type'), 'size': len(content), 'url': '/api/files/' + file_id, 'addedAt': datetime.now().astimezone().isoformat()})
                    elif path.startswith('/api/files/') and method == 'GET':
                        cur.execute('SELECT name,content FROM attachments WHERE id=%s', (path.rsplit('/', 1)[-1],))
                        row = cur.fetchone()
                        if not row:
                            self.send(404, {'error': '資料が見つかりません。'})
                        else:
                            from urllib.parse import quote
                            content = bytes(row[1])
                            if parse_qs(urlsplit(self.path).query).get('inline') == ['1']:
                                mime = inline_image_type(content)
                                if not mime:
                                    self.send(400, {'error': 'この資料は顔写真として表示できません。'})
                                else:
                                    self.send(200, content, mime, {'Content-Disposition': "inline; filename*=UTF-8''" + quote(row[0])})
                            else:
                                self.send(200, content, 'application/octet-stream', {'Content-Disposition': "attachment; filename*=UTF-8''" + quote(row[0])})
                    else:
                        self.send(404, {'error': '見つかりません。'})
                    return
                if method != 'GET':
                    self.send(405, {'error': '許可されていない操作です。'})
                    return
                file = (ROOT / unquote(path).lstrip('/')).resolve()
                if not file.is_relative_to(ROOT):
                    self.send(404, {'error': '見つかりません。'})
                    return
                if not file.is_file():
                    if '.' in Path(path).name:
                        self.send(404, {'error': '見つかりません。'})
                        return
                    file = ROOT / 'index.html'
                self.send(200, file.read_bytes(), mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        except (ValueError, TypeError, KeyError) as error:
            conn.rollback()
            self.send(400, {'error': str(error) if isinstance(error, ValueError) else '入力データを確認してください。'})
        except Exception as error:
            conn.rollback()
            print(type(error).__name__, flush=True)
            self.send(500, {'error': 'サーバーで処理できませんでした。再試行してください。'})
        finally:
            POOL.putconn(conn)

    def login(self, cur):
        address = self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[0].strip()[:100]
        cur.execute("DELETE FROM login_attempts WHERE started_at<now()-interval '15 minutes'")
        cur.execute('SELECT attempts FROM login_attempts WHERE address=%s', (address,))
        attempts = cur.fetchone()
        if attempts and attempts[0] >= 10:
            self.send(429, {'error': '時間をおいてお試しください。'})
            return
        payload = json.loads(self.body(4096))
        password = payload.get('password', '')
        if not isinstance(password, str) or len(password) > 256:
            raise ValueError('パスワードを確認してください。')
        salt = os.environ.get('AUTH_SALT', '')
        expected = os.environ.get('AUTH_HASH', '')
        actual = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
        if not expected or not hmac.compare_digest(actual, expected):
            cur.execute('INSERT INTO login_attempts(address,attempts) VALUES(%s,1) ON CONFLICT(address) DO UPDATE SET attempts=login_attempts.attempts+1', (address,))
            cur.connection.commit()
            self.send(401, {'error': 'パスワードが正しくありません。'})
            return
        cur.execute('DELETE FROM login_attempts WHERE address=%s', (address,))
        cur.execute('DELETE FROM sessions WHERE expires_at<=now()')
        token = secrets.token_urlsafe(32)
        cur.execute("INSERT INTO sessions(token,expires_at) VALUES(%s,now()+interval '12 hours')", (hashlib.sha256(token.encode()).hexdigest(),))
        cur.connection.commit()
        self.send(200, {'ok': True}, headers={'Set-Cookie': f'hire_session={token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200'})


if __name__ == '__main__':
    initialize()
    server = ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('PORT', '8000'))), Handler)
    server.daemon_threads = True
    server.serve_forever()
