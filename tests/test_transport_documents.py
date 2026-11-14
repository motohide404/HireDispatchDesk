import copy
import unittest
from test_validation import app, sample
from test_staff_validation import member


def workspace():
    value = sample()
    value['staffMembers'] = [member()]
    value['drivers'][0].update(name='確認用運転者', status='active')
    value['vehicles'][0]['plateNo'] = '確認用番号'
    value['bookings'][0].update(title='確認用予約', start='2030-01-01T09:00:00+09:00', end='2030-01-01T10:00:00+09:00')
    return value


def document(kind='acceptance'):
    values = {key: '' for key in app.TRANSPORT_FIELDS}
    values.update(issuerName='正式名称確認用株式会社', officeName='確認用営業所', issuerAddress='確認用住所',
                  issuerPhone='連絡先確認用', emergencyContact='緊急連絡先確認用', serviceArea='確認用営業区域',
                  applicantName='確認用申込者', applicantContact='test@example.com',
                  operationStartPlace='出庫地', operationStartAt='2030-01-01T08:00:00+09:00',
                  boardingPlace='乗車地', boardingAt='2030-01-01T09:00:00+09:00',
                  alightingPlace='降車地', alightingAt='2030-01-01T10:00:00+09:00',
                  operationEndPlace='帰庫地', operationEndAt='2030-01-01T11:00:00+09:00',
                  fare='11000', charge='0', applicationMethod='phone', priceStatus='fixed', timeStatus='planned',
                  safetyInstructions='経路と注意箇所を確認して安全運行')
    row = dict(id='document-1', documentId='document-1', number='TEST-001', reason='', voided=False,
               kind=kind, createdAt='2026-11-13T00:00:00Z', issuerStaffId='staff-1', issuerStaffName='テスト運行管理者',
               source=dict(collection='bookings', id='1', title='確認用予約', start='2030-01-01T09:00:00+09:00', end='2030-01-01T10:00:00+09:00'), values=values)
    if kind == 'instruction': row.update(driverId=1, driverName='確認用運転者', vehicleId=1, vehiclePlate='確認用番号')
    return row


class TransportDocumentTests(unittest.TestCase):
    def test_both_documents_and_future_operation_times(self):
        for kind in ('acceptance', 'instruction'):
            app.validate_transport_document(document(kind), workspace())

    def test_statutory_fields_and_split_deadhead_passenger_times_are_required(self):
        for field in ('issuerName', 'issuerAddress', 'emergencyContact', 'serviceArea', 'applicantContact', 'operationStartPlace', 'operationEndAt', 'boardingPlace', 'alightingAt', 'fare', 'charge'):
            row = document(); row['values'][field] = ''
            with self.subTest(field=field), self.assertRaises(ValueError): app.validate_transport_document(row, workspace())
        row = document(); row['values']['operationStartAt'] = '2030-01-01T09:30:00+09:00'
        with self.assertRaises(ValueError): app.validate_transport_document(row, workspace())

    def test_application_names_estimate_basis_and_yen_amount_validation(self):
        for patch in ({'applicationMethod': 'app'}, {'applicationMethod': 'other'}, {'priceStatus': 'estimate'}, {'fare': '-1'}, {'fare': '100.5'}, {'charge': 'not a number'}):
            row = document(); row['values'].update(patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError): app.validate_transport_document(row, workspace())
        row = document(); row['values'].update(applicationMethod='web', methodDetail='確認用サイト', priceStatus='estimate', priceBasis='距離と届出済み運賃に基づく概算')
        app.validate_transport_document(row, workspace())

    def test_instruction_uses_manager_and_assigned_driver_vehicle(self):
        for patch in ({'driverId': 2}, {'driverName': '別人'}, {'vehiclePlate': '別車両'}):
            with self.subTest(patch=patch), self.assertRaises(ValueError): app.validate_transport_document({**document('instruction'), **patch}, workspace())
        for role in ('office', 'assistant'):
            value = workspace(); value['staffMembers'][0]['role'] = role
            app.validate_transport_document(document(), value)
            with self.assertRaises(ValueError): app.validate_transport_document(document('instruction'), value)
        row = document('instruction'); row['values']['safetyInstructions'] = ''
        with self.assertRaises(ValueError): app.validate_transport_document(row, workspace())

    def test_stale_or_removed_source_cannot_issue_new_document(self):
        value = workspace(); value['bookings'][0]['title'] = '変更後'
        with self.assertRaises(ValueError): app.validate_transport_document(document(), value)
        value['bookings'] = []
        with self.assertRaises(ValueError): app.validate_transport_document(document(), value)

    def test_correction_retains_identity_after_booking_removed_and_driver_renamed(self):
        original = document('instruction'); value = workspace(); value['bookings'] = []; value['drivers'][0]['name'] = '改名後'
        corrected = {**copy.deepcopy(original), 'id': 'v2', 'supersedes': original['id'], 'reason': '終了予定時刻を訂正', 'createdAt': '2026-11-14T00:00:00Z'}
        corrected['values']['operationEndAt'] = '2030-01-01T12:00:00+09:00'
        app.validate_transport_document(corrected, value, original)
        for patch in ({'reason': ''}, {'number': '別番号'}, {'driverName': '新しい名前'}, {'documentId': '別の帳票'}):
            with self.subTest(patch=patch), self.assertRaises(ValueError): app.validate_transport_document({**corrected, **patch}, value, original)

    def test_cancellation_is_append_only_and_requires_original(self):
        original = document(); cancellation = {**original, 'id': 'voided', 'supersedes': original['id'], 'reason': '予約取消', 'voided': True}
        app.validate_transport_document(cancellation, workspace(), original)
        with self.assertRaises(ValueError): app.validate_transport_document(cancellation, workspace())
        with self.assertRaises(ValueError): app.validate_transport_document({**original, 'voided': True}, workspace())

    def test_retention_three_years_clamps_leap_day(self):
        self.assertEqual(str(app.transport_retention('2028-02-29T11:00:00+09:00')), '2031-02-28')

    def test_delivery_and_instruction_events_require_actual_details_and_valid_time(self):
        for kind in ('acceptance', 'instruction'):
            row = document(kind)
            event = dict(id='event-1', recordId=row['id'], kind='delivery' if kind == 'acceptance' else 'instruction',
                         at='2026-11-13T10:00:00+09:00', staffId='staff-1', staffName='テスト運行管理者', recipient='確認用相手', method='手渡し', note='交付又は指示と携行を確認')
            app.validate_transport_event(event, row, workspace())
            for patch in ({'at': '2099-01-01T10:00:00+09:00'}, {'at': '2020-01-01T10:00:00+09:00'}, {'method': ''}, {'recipient': ''}, {'note': ''}, {'recordId': 'missing'}):
                with self.subTest(patch=patch), self.assertRaises(ValueError): app.validate_transport_event({**event, **patch}, row, workspace())
            with self.assertRaises(ValueError): app.validate_transport_event(event, {**row, 'voided': True}, workspace())
