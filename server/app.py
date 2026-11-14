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
from datetime import date, datetime, timedelta, timezone
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
                    revision bigint PRIMARY KEY, value jsonb NOT NULL, saved_at timestamptz NOT NULL DEFAULT now());
                CREATE TABLE IF NOT EXISTS transport_documents (
                    id text PRIMARY KEY, document_id text NOT NULL,
                    supersedes text UNIQUE REFERENCES transport_documents(id),
                    service_date date NOT NULL, retain_until date NOT NULL,
                    value jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
                CREATE INDEX IF NOT EXISTS transport_documents_day ON transport_documents(service_date);
                CREATE INDEX IF NOT EXISTS transport_documents_history ON transport_documents(document_id);
                CREATE UNIQUE INDEX IF NOT EXISTS transport_documents_number ON transport_documents((value->>'number')) WHERE supersedes IS NULL;
                CREATE TABLE IF NOT EXISTS transport_document_events (
                    id text PRIMARY KEY, record_id text NOT NULL REFERENCES transport_documents(id),
                    value jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
                CREATE INDEX IF NOT EXISTS transport_document_events_record ON transport_document_events(record_id);''')
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
        if type(member.get('maintenanceManager', False)) is not bool:
            raise ValueError('整備管理者の選任区分を確認してください。')
        maintenance_date = ledger_date(member.get('maintenanceAppointmentDate'))
        if member.get('maintenanceManager') and maintenance_date is None:
            raise ValueError('整備管理者の選任日を入力してください。')


INSPECTION_KEYS = {'BR01', 'BR02', 'BR05', 'TY01', 'TY02', 'TY03', 'TY04', 'BA01',
                   'EN01', 'EN02', 'EN03', 'EN04', 'EN05', 'LI01', 'WW01', 'WW02', 'PR01'}
INSPECTION_COLLECTIONS = ('inspectionProfiles', 'dailyInspections', 'inspectionReviews')


def validate_inspections(value):
    vehicles = {row['id'] for row in value['vehicles']}
    drivers = {row['id'] for row in value['drivers']}
    profiles = {}
    for row in value.get('inspectionProfiles', []):
        if type(row.get('vehicleId')) is not int or row['vehicleId'] not in vehicles:
            raise ValueError('点検対象の車両を確認してください。')
        for key in ('id', 'vehicleLabel', 'staffId', 'staffName'):
            ledger_text(row.get(key), 200, '点検方法の登録情報', required=True)
        for key in ('basis', 'methods'):
            ledger_text(row.get(key), 2000, '車両資料・点検方法', required=True)
        duty_timestamp(row.get('at'), '点検方法の確認日時', japan=False)
        excluded = row.get('excluded')
        if not isinstance(excluded, dict) or set(excluded) - {'BA01', 'EN01', 'EN02', 'EN03'}:
            raise ValueError('対象外にできるのは構造上該当しない装置だけです。')
        for reason in excluded.values():
            ledger_text(reason, 200, '対象外の根拠', required=True)
        profiles[row['id']] = row
    records, latest = {}, {}
    for row in value.get('dailyInspections', []):
        for key in ('id', 'inspectionId', 'vehicleLabel', 'driverName', 'profileId'):
            ledger_text(row.get(key), 200, '日常点検の登録情報', required=True)
        if type(row.get('vehicleId')) is not int or row['vehicleId'] not in vehicles or type(row.get('driverId')) is not int or row['driverId'] not in drivers:
            raise ValueError('日常点検の車両・運転者を確認してください。')
        profile = profiles.get(row['profileId'])
        if not profile or profile['vehicleId'] != row['vehicleId']:
            raise ValueError('車両の点検方法を先に設定してください。')
        at = duty_timestamp(row.get('at'), '日常点検日時')
        saved = duty_timestamp(row.get('recordedAt'), '日常点検の記録日時', japan=False)
        if at > saved or type(row.get('odometer')) is not int or not 0 <= row['odometer'] <= 999999999:
            raise ValueError('点検日時・走行距離を確認してください。')
        results = row.get('results')
        if not isinstance(results, dict) or set(results) != INSPECTION_KEYS - set(profile['excluded']) or any(result not in ('ok', 'defect') for result in results.values()):
            raise ValueError('すべての点検結果を明示してください。未確認は正常として保存できません。')
        ledger_text(row.get('previousIssues'), 2000, '前回異常の確認内容', required=True)
        ledger_text(row.get('notes'), 2000, '異常・措置内容', required='defect' in results.values())
        previous = row.get('supersedes')
        ledger_text(row.get('reason'), 2000, '訂正・再点検の理由', required=bool(previous))
        if previous:
            original = records.get(previous)
            if not original or latest.get(row['inspectionId']) != previous or any(original[key] != row[key] for key in ('inspectionId', 'vehicleId', 'driverId', 'driverName', 'vehicleLabel', 'profileId')):
                raise ValueError('最新の日常点検記録に理由を付けて追記してください。')
            if saved < duty_timestamp(original['recordedAt'], '元記録日時', japan=False):
                raise ValueError('訂正の記録日時を確認してください。')
        elif row['inspectionId'] in latest:
            raise ValueError('点検IDが重複しています。')
        records[row['id']] = row
        latest[row['inspectionId']] = row['id']
    review_times = {}
    for row in value.get('inspectionReviews', []):
        if row.get('inspectionId') not in records or row.get('decision') not in ('allow', 'deny'):
            raise ValueError('整備管理者の確認対象・運行可否を指定してください。')
        for key in ('id', 'staffId', 'staffName'):
            ledger_text(row.get(key), 200, '整備管理者の確認情報', required=True)
        ledger_text(row.get('note'), 2000, '確認・判断理由', required=True)
        at = duty_timestamp(row.get('at'), '整備管理者の確認日時', japan=False)
        record = records[row['inspectionId']]
        if row['inspectionId'] in review_times and at < review_times[row['inspectionId']]:
            raise ValueError('確認履歴の日時は直前の確認以降にしてください。')
        review_times[row['inspectionId']] = at
        if at < duty_timestamp(record['recordedAt'], '点検の記録日時', japan=False):
            raise ValueError('点検記録後に整備管理者が確認してください。')
        if row['decision'] == 'allow' and 'defect' in record['results'].values():
            raise ValueError('異常が残る記録を運行可にはできません。是正後の再点検を追記してください。')


def preserve_inspections(previous, current):
    previous = previous or {}
    staff = {row['id']: row for row in current.get('staffMembers', [])}
    vehicles = {row['id']: row for row in current['vehicles']}
    drivers = {row['id']: row for row in current['drivers']}
    latest_profile = {row['vehicleId']: row['id'] for row in current.get('inspectionProfiles', [])}
    replaced = {row.get('supersedes') for row in current.get('dailyInspections', [])}
    now = time.time() + 300
    for key in INSPECTION_COLLECTIONS:
        old, new = previous.get(key, []), current.get(key, [])
        if new[:len(old)] != old:
            raise ValueError('保存済みの日常点検・設定・確認履歴は変更・削除できません。追記してください。')
        if key != 'dailyInspections' and any(row['staffId'] not in staff for row in new):
            raise ValueError('日常点検で使用した職員は削除できません。利用状態を変更してください。')
        for row in new[len(old):]:
            timestamp = duty_timestamp(row.get('recordedAt') if key == 'dailyInspections' else row.get('at'), '記録日時', japan=False)
            if timestamp.timestamp() > now:
                raise ValueError('未来の日常点検記録は保存できません。')
            if key == 'dailyInspections':
                if not row.get('supersedes'):
                    driver = drivers[row['driverId']]
                    vehicle = vehicles[row['vehicleId']]
                    if driver.get('status') != 'active' or driver.get('name') != row['driverName'] or row['vehicleLabel'] != vehicle.get('name', '') + ' / ' + vehicle.get('plateNo', ''):
                        raise ValueError('台帳から有効な実施者・車両を選択してください。')
                    if latest_profile.get(row['vehicleId']) != row['profileId']:
                        raise ValueError('最新の車両点検方法を使用してください。')
                continue
            if key == 'inspectionProfiles':
                vehicle = vehicles[row['vehicleId']]
                if row['vehicleLabel'] != vehicle.get('name', '') + ' / ' + vehicle.get('plateNo', ''):
                    raise ValueError('車両台帳から点検対象を選択してください。')
            member = staff.get(row['staffId'])
            if not member or not member['active'] or not member.get('maintenanceManager') or row['staffName'] != member['name']:
                raise ValueError('職員台帳で選任済みの整備管理者を選択してください。')
            appointed = ledger_date(member.get('maintenanceAppointmentDate'))
            if appointed is None or appointed > timestamp.astimezone(timezone(timedelta(hours=9))).date():
                raise ValueError('整備管理者の選任日を確認してください。')
            if key == 'inspectionReviews' and row['inspectionId'] in replaced:
                raise ValueError('訂正前の点検は判断できません。最新の点検を確認してください。')


def check_linked_inspection(call, duty, value):
    identifier = call.get('inspectionRecordId')
    if not identifier:
        return
    records = value.get('dailyInspections', [])
    record = next((row for row in records if row['id'] == identifier), None)
    reviews = [row for row in value.get('inspectionReviews', []) if row['inspectionId'] == identifier]
    if not record or any(row.get('supersedes') == identifier for row in records) or not reviews or reviews[-1]['decision'] != 'allow':
        raise ValueError('最新の日常点検で整備管理者が運行可と確認した記録を選択してください。')
    if record['vehicleId'] != call['vehicleId'] or record['at'][:10] != call['at'][:10] or call.get('inspection') != 'ok':
        raise ValueError('日常点検と点呼の車両・日付・点検状況を確認してください。')
    if duty_timestamp(reviews[-1]['at'], '整備管理者の確認日時', japan=False) > duty_timestamp(call['at'], '点呼日時'):
        raise ValueError('整備管理者の確認後に点呼を実施してください。')


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
            if phase == 'before':
                check_linked_inspection(call, row, current)
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


TRANSPORT_FIELDS = {
    'issuerName', 'officeName', 'issuerAddress', 'issuerPhone', 'emergencyContact', 'serviceArea',
    'applicantName', 'applicantContact', 'methodDetail', 'operationStartPlace', 'operationStartAt',
    'operationEndPlace', 'operationEndAt', 'boardingPlace', 'boardingAt', 'alightingPlace', 'alightingAt',
    'fare', 'charge', 'chargeDetails', 'priceBasis', 'route', 'safetyInstructions', 'notes',
    'applicationMethod', 'priceStatus', 'timeStatus'}
TRANSPORT_LONG_FIELDS = {'chargeDetails', 'priceBasis', 'route', 'safetyInstructions', 'notes'}
TRANSPORT_TIMES = ('operationStartAt', 'boardingAt', 'alightingAt', 'operationEndAt')


def transport_staff(identifier, name, kind, workspace, at):
    member = next((row for row in workspace.get('staffMembers', []) if row['id'] == identifier), None)
    if not member or not member['active'] or member['name'] != name:
        raise ValueError('職員台帳から有効な担当者を選択してください。')
    if kind == 'instruction':
        appointed = ledger_date(member.get('appointmentDate'))
        if member['role'] != 'manager' or appointed is None or appointed > at.astimezone(timezone(timedelta(hours=9))).date():
            raise ValueError('選任済みの運行管理者を指定してください。')


def transport_retention(end):
    day = duty_timestamp(end, '運行終了日時').date()
    try:
        return day.replace(year=day.year + 3)
    except ValueError:
        return day.replace(year=day.year + 3, day=28)


def validate_transport_document(row, workspace, original=None):
    if not isinstance(row, dict) or set(row) - {'id', 'documentId', 'number', 'supersedes', 'reason', 'voided', 'kind', 'createdAt', 'source', 'issuerStaffId', 'issuerStaffName', 'driverId', 'driverName', 'vehicleId', 'vehiclePlate', 'values'}:
        raise ValueError('帳票データの形式を確認してください。')
    for key in ('id', 'documentId', 'number', 'issuerStaffId', 'issuerStaffName'):
        ledger_text(row.get(key), 200, '帳票の登録情報', required=True)
    kind = row.get('kind')
    if kind not in ('acceptance', 'instruction') or type(row.get('voided')) is not bool:
        raise ValueError('帳票の種類・取消区分を確認してください。')
    created = duty_timestamp(row.get('createdAt'), '帳票作成日時', japan=False)
    if created.timestamp() > time.time() + 300:
        raise ValueError('未来の作成実績は記録できません。')
    transport_staff(row['issuerStaffId'], row['issuerStaffName'], kind, workspace, created)
    values = row.get('values')
    if not isinstance(values, dict) or set(values) != TRANSPORT_FIELDS:
        raise ValueError('帳票の記載項目をすべて指定してください。')
    required = {'issuerName', 'officeName', 'issuerPhone', 'applicantName', 'applicantContact',
                'operationStartPlace', 'operationEndPlace', 'boardingPlace', 'alightingPlace', *TRANSPORT_TIMES}
    required |= {'issuerAddress', 'emergencyContact', 'serviceArea', 'fare', 'charge'} if kind == 'acceptance' else {'safetyInstructions'}
    for key in TRANSPORT_FIELDS:
        ledger_text(values.get(key), 2000 if key in TRANSPORT_LONG_FIELDS else 200, '帳票の記載内容：' + key, required=key in required)
    times = [duty_timestamp(values[key], '運行・乗降日時') for key in TRANSPORT_TIMES]
    if times != sorted(times) or times[0] >= times[-1]:
        raise ValueError('運行開始→乗車→降車→運行終了の日時を確認してください。')
    transport_retention(values['operationEndAt'])
    if values['timeStatus'] not in ('planned', 'confirmed') or values['priceStatus'] not in ('fixed', 'estimate'):
        raise ValueError('予定・確定の区分を指定してください。')
    if kind == 'acceptance':
        method = values['applicationMethod']
        if method not in ('phone', 'visit', 'email', 'app', 'web', 'sns', 'other'):
            raise ValueError('申込方法を選択してください。')
        if method in ('app', 'web', 'sns', 'other'):
            ledger_text(values['methodDetail'], 200, '申込方法の名称・詳細', required=True)
        for key in ('fare', 'charge'):
            if not re.fullmatch(r'\d{1,10}', values[key]) or int(values[key]) > 9999999999:
                raise ValueError('運賃・料金は税込の円単位で入力してください。')
        if values['priceStatus'] == 'estimate':
            ledger_text(values['priceBasis'], 2000, '概算額の算出根拠', required=True)
    source = row.get('source')
    if not isinstance(source, dict) or set(source) != {'collection', 'id', 'title', 'start', 'end'} or source.get('collection') not in ('bookings', 'jobPool'):
        raise ValueError('元の予約を指定してください。')
    ledger_text(source.get('id'), 200, '予約ID', required=True)
    ledger_text(source.get('title'), 200, '予約名', required=True)
    interval(source)
    previous = row.get('supersedes')
    ledger_text(row.get('reason'), 2000, '訂正・取消の理由', required=bool(previous))
    if previous:
        if not original or previous != original['id'] or any(row.get(key) != original.get(key) for key in ('documentId', 'number', 'kind', 'source', 'driverId', 'driverName', 'vehicleId', 'vehiclePlate')):
            raise ValueError('最新の帳票を開き、理由を付けて訂正してください。')
        if created < duty_timestamp(original['createdAt'], '元の作成日時', japan=False):
            raise ValueError('訂正の作成日時を確認してください。')
    else:
        if row['documentId'] != row['id'] or row['voided']:
            raise ValueError('新規帳票の識別子・取消区分を確認してください。')
        job = next((item for item in workspace[source['collection']] if str(item['id']) == source['id']), None)
        if not job or any(source[key] != job.get(key) for key in ('title', 'start', 'end')):
            raise ValueError('予約が更新されています。最新の予約から作り直してください。')
        if kind == 'instruction':
            driver = next((item for item in workspace['drivers'] if item['id'] == job.get('driverId')), None)
            vehicle = next((item for item in workspace['vehicles'] if item['id'] == job.get('vehicleId')), None)
            if not driver or driver.get('status') != 'active' or not vehicle or not vehicle.get('plateNo') or row.get('driverId') != driver['id'] or row.get('driverName') != driver.get('name') or row.get('vehicleId') != vehicle['id'] or row.get('vehiclePlate') != vehicle.get('plateNo'):
                raise ValueError('予約に指定された有効な運転者・車両の情報を確認してください。')
    if kind == 'instruction':
        if type(row.get('driverId')) is not int or type(row.get('vehicleId')) is not int:
            raise ValueError('運転者・車両の識別子を確認してください。')
        for key in ('driverName', 'vehiclePlate'):
            ledger_text(row.get(key), 200, '運転者氏名・自動車登録番号', required=True)


def validate_transport_event(row, document, workspace):
    if not isinstance(row, dict) or set(row) != {'id', 'recordId', 'kind', 'at', 'staffId', 'staffName', 'recipient', 'method', 'note'}:
        raise ValueError('交付・指示記録の形式を確認してください。')
    for key in ('id', 'recordId', 'staffId', 'staffName', 'recipient', 'method', 'note'):
        ledger_text(row.get(key), 2000 if key == 'note' else 200, '交付・指示の記録内容', required=True)
    if row['recordId'] != document['id'] or row['kind'] != ('delivery' if document['kind'] == 'acceptance' else 'instruction') or document['voided']:
        raise ValueError('有効な最新の帳票に対して実施結果を記録してください。')
    at = duty_timestamp(row.get('at'), '実施日時')
    if at.timestamp() > time.time() + 300 or at < duty_timestamp(document['createdAt'], '帳票作成日時', japan=False):
        raise ValueError('実施日時は帳票作成後・現在以前で入力してください。')
    transport_staff(row['staffId'], row['staffName'], document['kind'], workspace, at)


def transport_api(handler, cur, conn, method, path):
    if method == 'GET' and path == '/api/transport-documents':
        query = parse_qs(urlsplit(handler.path).query)
        document_id = query.get('documentId', [''])[0]
        if document_id:
            ledger_text(document_id, 200, '帳票ID', required=True)
            cur.execute('SELECT value FROM transport_documents WHERE document_id=%s ORDER BY created_at,id LIMIT 501', (document_id,))
            records = [row[0] for row in cur.fetchall()]
            if len(records) > 500:
                raise ValueError('訂正履歴が多いため、管理担当へ帳票の抽出を依頼してください。')
            cur.execute('SELECT e.value FROM transport_document_events e JOIN transport_documents d ON d.id=e.record_id WHERE d.document_id=%s ORDER BY e.created_at,e.id', (document_id,))
            handler.send(200, {'records': records, 'events': [row[0] for row in cur.fetchall()]})
        else:
            day = ledger_date(query.get('date', [''])[0])
            offset = int(query.get('offset', ['0'])[0])
            if day is None or not 0 <= offset <= 10000000:
                raise ValueError('利用日と表示位置を確認してください。')
            cur.execute('''SELECT d.value FROM transport_documents d WHERE d.service_date=%s
                           AND NOT EXISTS(SELECT 1 FROM transport_documents n WHERE n.supersedes=d.id)
                           ORDER BY d.created_at DESC,d.id DESC LIMIT 51 OFFSET %s''', (day, offset))
            records = [row[0] for row in cur.fetchall()]
            handler.send(200, {'records': records[:50], 'hasMore': len(records) > 50})
        return
    if method != 'POST' or path not in ('/api/transport-documents', '/api/transport-documents/events'):
        handler.send(404, {'error': '見つかりません。'})
        return
    row = json.loads(handler.body(64 * 1024))
    if not isinstance(row, dict):
        raise ValueError('帳票の形式を確認してください。')
    ledger_text(row.get('id'), 200, '記録ID', required=True)
    is_event = path.endswith('/events')
    table = 'transport_document_events' if is_event else 'transport_documents'
    cur.execute('SELECT value FROM ' + table + ' WHERE id=%s', (row['id'],))
    existing = cur.fetchone()
    if existing:
        if existing[0] != row:
            raise ValueError('同じ記録IDで異なる内容は保存できません。')
        handler.send(200, {'event' if is_event else 'record': existing[0]})
        return
    reference = row.get('recordId') if is_event else row.get('supersedes')
    original = None
    if reference:
        ledger_text(reference, 200, '元の記録ID', required=True)
        cur.execute('SELECT value FROM transport_documents WHERE id=%s FOR UPDATE', (reference,))
        found = cur.fetchone()
        original = found[0] if found else None
        cur.execute('SELECT 1 FROM transport_documents WHERE supersedes=%s', (reference,))
        if not original or cur.fetchone():
            raise ValueError('帳票が更新されています。最新の版を開いてください。')
    cur.execute('SELECT value FROM workspace WHERE id=1 FOR SHARE')
    workspace = cur.fetchone()[0]
    if is_event:
        if original is None:
            raise ValueError('交付・指示の対象帳票を指定してください。')
        validate_transport_event(row, original, workspace)
        cur.execute('INSERT INTO transport_document_events(id,record_id,value) VALUES(%s,%s,%s) ON CONFLICT DO NOTHING RETURNING id', (row['id'], row['recordId'], Json(row)))
    else:
        validate_transport_document(row, workspace, original)
        cur.execute('''INSERT INTO transport_documents(id,document_id,supersedes,service_date,retain_until,value)
                       VALUES(%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING id''',
                    (row['id'], row['documentId'], row.get('supersedes'), ledger_date(row['values']['boardingAt'][:10]), transport_retention(row['values']['operationEndAt']), Json(row)))
    if not cur.fetchone():
        cur.execute('SELECT value FROM ' + table + ' WHERE id=%s', (row['id'],))
        concurrent = cur.fetchone()
        if not concurrent or concurrent[0] != row:
            raise ValueError('同じ帳票番号・訂正元の記録が既にあります。最新の版を確認してください。')
    conn.commit()
    handler.send(201, {'event' if is_event else 'record': row})


def validate(value):
    if not isinstance(value, dict) or not ALLOWED.issubset(value) or set(value) - ALLOWED - {'dutyLogs', 'staffMembers', *INSPECTION_COLLECTIONS}:
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
    validate_inspections(value)
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
                    elif path.startswith('/api/transport-documents'):
                        transport_api(self, cur, conn, method, path)
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
                        preserve_inspections(old_value, payload['value'])
                        staff_ids = [row['id'] for row in payload['value'].get('staffMembers', [])]
                        cur.execute("SELECT 1 FROM transport_documents WHERE NOT ((value->>'issuerStaffId')=ANY(%s)) UNION ALL SELECT 1 FROM transport_document_events WHERE NOT ((value->>'staffId')=ANY(%s)) LIMIT 1", (staff_ids, staff_ids))
                        if cur.fetchone():
                            raise ValueError('帳票で使用した職員は削除できません。利用状態を変更してください。')
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
