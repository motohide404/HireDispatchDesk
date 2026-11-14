import copy
import unittest
from test_validation import app, sample
from test_duty_validation import duty, call


def member(**patch):
    return {**dict(id='staff-1', code='M-1', name='テスト運行管理者', officeName='東京営業所', role='manager', active=True, appointmentDate='2020-01-01', qualification='確認済み'), **patch}


def v2call(**patch):
    return {**call(), 'schemaVersion': 2, 'executorStaffId': 'staff-1', 'executor': 'テスト運行管理者', 'executorRole': 'manager', 'executorOffice': '東京営業所', 'location': '東京営業所', 'visualCheck': 'yes', 'detectorCondition': 'ok', 'instructions': '安全運行の指示', 'otherNotes': '', **patch}


def workspace(record=None, staff=None):
    value = sample()
    value['staffMembers'] = [member()] if staff is None else staff
    value['dutyLogs'] = [record or {**duty(), 'recorder': 'テスト運行管理者', 'recorderStaffId': 'staff-1', 'before': v2call()}]
    return value


class StaffRollCallTests(unittest.TestCase):
    def test_registered_executor_and_manual_zero_with_separate_post_reports(self):
        value = workspace()
        value['dutyLogs'][0]['before']['alcoholValue'] = 0
        value['dutyLogs'][0]['after'] = v2call(at='2026-11-14T05:55:00+09:00', health=None, fatigue=None, sleep=None, inspection=None, vehicleReport='異常なし', roadReport='渋滞あり', operationReport='遅延なし', handoverStatus='none')
        app.validate(value)
        app.preserve_duty_logs(sample(), value)

    def test_new_records_cannot_spoof_or_use_office_staff_inactive_or_unappointed_executors(self):
        for patch in ({'active': False}, {'role': 'office'}, {'appointmentDate': '2026-11-14'}):
            value = workspace(staff=[member(**patch)])
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                app.preserve_duty_logs(sample(), value)
        for patch in ({'executor': '別人'}, {'executorRole': 'assistant'}, {'executorOffice': '別営業所'}, {'executorStaffId': 'missing'}):
            value = workspace(); value['dutyLogs'][0]['before'].update(patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                app.preserve_duty_logs(sample(), value)

    def test_registered_metadata_changes_never_rewrite_existing_snapshots(self):
        before = workspace(); after = copy.deepcopy(before)
        after['staffMembers'][0].update(name='改名後', role='office', active=False)
        app.validate(after); app.preserve_duty_logs(before, after)
        self.assertEqual(after['dutyLogs'][0]['before']['executor'], 'テスト運行管理者')
        after['staffMembers'] = []
        with self.assertRaises(ValueError): app.preserve_duty_logs(before, after)

    def test_required_reports_visual_checks_and_missing_handover_cannot_be_omitted(self):
        for patch in ({'location': ''}, {'visualCheck': ''}, {'detectorCondition': ''}, {'instructions': ''}, {'visualCheck': 'no'}, {'detectorCondition': 'fault'}, {'inspection': 'not_done'}):
            value = workspace(); value['dutyLogs'][0]['before'].update(patch)
            with self.subTest(patch=patch), self.assertRaises(ValueError): app.validate(value)
        post = v2call(at='2026-11-14T05:55:00+09:00', vehicleReport='異常なし', roadReport='異常なし', operationReport='異常なし', handoverStatus='none')
        for patch in ({'vehicleReport': ''}, {'roadReport': ''}, {'operationReport': ''}, {'handoverStatus': ''}, {'handoverStatus': 'done', 'handover': ''}):
            value = workspace(); value['dutyLogs'][0]['after'] = {**post, **patch}
            with self.subTest(patch=patch), self.assertRaises(ValueError): app.validate(value)

    def test_staff_registry_rejects_duplicate_codes_invalid_roles_and_missing_appointments(self):
        for staff in ([member(), member(id='other')], [member(role='invalid')], [member(appointmentDate='')], [member(active=1)]):
            value = sample(); value['staffMembers'] = staff
            with self.subTest(staff=staff), self.assertRaises(ValueError): app.validate(value)

    def test_pointcall_history_cannot_be_removed_by_appending_a_new_version(self):
        before = workspace(); after = copy.deepcopy(before)
        updated = {**after['dutyLogs'][0], 'id': 'r2', 'supersedes': 'r1', 'reason': '訂正'}
        del updated['before']; after['dutyLogs'].append(updated)
        with self.assertRaisesRegex(ValueError, '消去'): app.preserve_duty_logs(before, after)
