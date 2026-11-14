import copy
import unittest
from test_validation import app, sample
from test_staff_validation import member


def workspace():
    value = sample()
    value['vehicles'][0].update(name='確認用乗用車', plateNo='確認用番号')
    value['drivers'][0].update(name='確認用運転者', status='active')
    value['staffMembers'] = [member(maintenanceManager=True, maintenanceAppointmentDate='2020-01-01')]
    value['inspectionProfiles'] = [dict(id='p1', vehicleId=1, vehicleLabel='確認用乗用車 / 確認用番号', at='2026-11-13T00:00:00Z', staffId='staff-1', staffName='テスト運行管理者', basis='取扱説明書の確認用参照', methods='車種別の手順', excluded={})]
    value['dailyInspections'] = [dict(id='i1', inspectionId='inspection-1', reason='', recordedAt='2026-11-14T00:01:00Z', at='2026-11-14T09:00:00+09:00', vehicleId=1, vehicleLabel='確認用乗用車 / 確認用番号', driverId=1, driverName='確認用運転者', profileId='p1', odometer=100, results={key: 'ok' for key in app.INSPECTION_KEYS}, notes='', previousIssues='前回報告なし')]
    value['inspectionReviews'] = [dict(id='review1', inspectionId='i1', at='2026-11-14T00:02:00Z', staffId='staff-1', staffName='テスト運行管理者', decision='allow', note='点検結果を確認')]
    return value


class DailyInspectionTests(unittest.TestCase):
    def test_complete_passenger_checklist_and_review(self):
        value = workspace()
        app.validate(value)
        app.preserve_inspections(sample(), value)
        self.assertEqual(len(app.INSPECTION_KEYS), 17)
        self.assertFalse({'BR03', 'BR04', 'AT01', 'TY05'} & app.INSPECTION_KEYS)

    def test_missing_extra_unselected_and_not_applicable_results_rejected(self):
        for kind in ('missing', 'extra', 'blank', 'skip'):
            value = workspace(); results = value['dailyInspections'][0]['results']
            if kind == 'missing': del results['BR01']
            elif kind == 'extra': results['AT01'] = 'ok'
            else: results['BR01'] = '' if kind == 'blank' else 'not_applicable'
            with self.subTest(kind=kind), self.assertRaises(ValueError): app.validate(value)

    def test_equipment_exclusion_requires_supported_item_and_reason(self):
        value = workspace()
        value['inspectionProfiles'][0]['excluded'] = {'EN03': 'EVのためエンジンなし'}
        del value['dailyInspections'][0]['results']['EN03']
        app.validate(value)
        for excluded in ({'BR01': '点検しない'}, {'EN03': ''}, {'AT01': '装置なし'}):
            value['inspectionProfiles'][0]['excluded'] = excluded
            with self.subTest(excluded=excluded), self.assertRaises(ValueError): app.validate(value)

    def test_history_cannot_be_edited_deleted_or_reordered(self):
        before = workspace()
        for key in app.INSPECTION_COLLECTIONS:
            for action in ('delete', 'edit'):
                after = copy.deepcopy(before)
                if action == 'delete': after[key] = []
                else: after[key][0]['id'] = 'overwritten'
                with self.subTest(key=key, action=action), self.assertRaises(ValueError): app.preserve_inspections(before, after)

    def test_defect_requires_details_and_prevents_allow(self):
        value = workspace(); value['dailyInspections'][0]['results']['TY01'] = 'defect'
        with self.assertRaises(ValueError): app.validate(value)
        value['dailyInspections'][0]['notes'] = '右前輪の空気圧低下、整備へ連絡'
        with self.assertRaisesRegex(ValueError, '異常'): app.validate(value)
        value['inspectionReviews'][0]['decision'] = 'deny'
        app.validate(value); app.preserve_inspections(sample(), value)

    def test_maintenance_role_name_active_and_appointment_are_checked(self):
        for patch in ({'maintenanceManager': False}, {'active': False}, {'name': '別名'}, {'maintenanceAppointmentDate': '2026-11-15'}):
            value = workspace(); value['staffMembers'][0].update(patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError): app.preserve_inspections(sample(), value)
        value = workspace(); value['staffMembers'][0]['maintenanceAppointmentDate'] = ''
        with self.assertRaises(ValueError): app.validate(value)

    def test_registered_driver_vehicle_profile_and_future_dates_checked(self):
        for patch in ({'driverName': '別人'}, {'vehicleLabel': '別車両'}, {'recordedAt': '2099-01-01T00:00:00Z'}):
            value = workspace(); value['dailyInspections'][0].update(patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError): app.preserve_inspections(sample(), value)
        for odometer in (-1, True, 1.5, 1000000000):
            value = workspace(); value['dailyInspections'][0]['odometer'] = odometer
            with self.subTest(odometer=odometer), self.assertRaises(ValueError): app.validate(value)

    def test_correction_retains_original_and_requires_new_review(self):
        before = workspace(); after = copy.deepcopy(before)
        correction = {**copy.deepcopy(after['dailyInspections'][0]), 'id': 'i2', 'supersedes': 'i1', 'reason': '走行距離の入力訂正', 'odometer': 101, 'recordedAt': '2026-11-14T00:03:00Z'}
        after['dailyInspections'].append(correction)
        app.validate(after); app.preserve_inspections(before, after)
        self.assertEqual(after['dailyInspections'][0]['odometer'], 100)
        self.assertFalse(any(row['inspectionId'] == 'i2' for row in after['inspectionReviews']))
        correction['reason'] = ''
        with self.assertRaises(ValueError): app.validate(after)

    def test_stale_branch_or_changed_identity_correction_rejected(self):
        value = workspace(); original = value['dailyInspections'][0]
        row = {**original, 'id': 'i2', 'supersedes': 'i1', 'reason': '再確認'}
        value['dailyInspections'].append(row)
        for patch in ({'driverId': 2}, {'profileId': 'missing'}):
            saved = copy.deepcopy(row); row.update(patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError): app.validate(value)
            row.clear(); row.update(saved)
        value['dailyInspections'].append({**row, 'id': 'i3'})
        with self.assertRaises(ValueError): app.validate(value)

    def test_old_snapshots_survive_rename_and_retirement_used_staff_cannot_be_deleted(self):
        before = workspace(); after = copy.deepcopy(before)
        after['staffMembers'][0].update(name='改名後', active=False, maintenanceManager=False)
        after['drivers'][0]['name'] = '改名後の運転者'
        app.validate(after); app.preserve_inspections(before, after)
        after['staffMembers'] = []
        with self.assertRaises(ValueError): app.preserve_inspections(before, after)

    def test_review_cannot_predate_record_or_target_superseded_version(self):
        before = workspace(); after = copy.deepcopy(before)
        after['inspectionReviews'].append({**after['inspectionReviews'][0], 'id': 'r2', 'at': '2026-11-13T00:00:00Z'})
        with self.assertRaises(ValueError): app.validate(after)
        after['inspectionReviews'][-1]['at'] = '2026-11-14T00:04:00Z'
        after['dailyInspections'].append({**after['dailyInspections'][0], 'id': 'i2', 'supersedes': 'i1', 'reason': '再点検'})
        with self.assertRaises(ValueError): app.preserve_inspections(before, after)

    def test_rollcall_link_checks_vehicle_date_decision_and_time(self):
        value = workspace(); call = dict(inspectionRecordId='i1', vehicleId=1, at='2026-11-14T09:03:00+09:00', inspection='ok')
        app.check_linked_inspection(call, {}, value)
        for patch in ({'vehicleId': 2}, {'at': '2026-11-15T09:03:00+09:00'}, {'at': '2026-11-14T09:01:00+09:00'}, {'inspection': 'concern'}, {'inspectionRecordId': 'missing'}):
            with self.subTest(patch=patch), self.assertRaises(ValueError): app.check_linked_inspection({**call, **patch}, {}, value)
        value['inspectionReviews'][0]['decision'] = 'deny'
        with self.assertRaises(ValueError): app.check_linked_inspection(call, {}, value)
