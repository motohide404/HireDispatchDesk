import copy
import unittest
from test_validation import app, sample


def duty(**patch):
    return dict(id='r1', dutyId='shift1', recordedAt='2026-11-13T13:00:00Z', recorder='記録担当', reason='', driverId=1, driverName='テスト運転者', driverCode='D1', dutyDate='2026-11-13', clockIn='2026-11-13T22:00:00+09:00', clockOut='2026-11-14T06:00:00+09:00', note='', voided=False, **patch)


def call():
    return dict(at='2026-11-13T22:10:00+09:00', executor='点呼担当', vehicleId=1, vehicleLabel='テスト車両', method='face', methodDetail='', alcohol='none', detectorUsed='yes', health='good', fatigue='none', sleep='enough', inspection='ok', instructions='', report='', handover='', response='')


class DutyValidationTests(unittest.TestCase):
    def workspace(self, records):
        value = sample()
        value['dutyLogs'] = records
        return value

    def test_legacy_empty_overnight_and_append_only_corrections(self):
        app.validate(sample())
        app.validate(self.workspace([]))
        first = duty()
        second = {**first, 'id': 'r2', 'supersedes': 'r1', 'reason': '乗務前点呼を追記', 'before': call()}
        before, after = self.workspace([first]), self.workspace([first, second])
        app.validate(after)
        # Existing v1 data remain readable and unchanged; new entries require a registered executor.
        app.preserve_duty_logs(before, before)
        with self.assertRaisesRegex(ValueError, '職員台帳'):
            app.preserve_duty_logs(before, after)
        self.assertNotIn('before', first)
        for replacement in ([], [{**first, 'note': '上書き'}], [second]):
            with self.subTest(replacement=replacement), self.assertRaises(ValueError):
                app.preserve_duty_logs(before, self.workspace(replacement))

    def test_branching_corrections_empty_reason_and_reassigned_identity_are_rejected(self):
        first = duty()
        second = {**first, 'id': 'r2', 'supersedes': 'r1', 'reason': '追記'}
        for patch in ({'reason': ''}, {'supersedes': 'unknown'}, {'driverId': 2}, {'dutyId': 'elsewhere'}, {'dutyDate': '2026-11-14', 'clockIn': '2026-11-14T00:00:00+09:00'}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                app.validate(self.workspace([first, {**second, **patch}]))
        with self.assertRaises(ValueError):
            app.validate(self.workspace([first, second, {**second, 'id': 'r3'}]))

    def test_real_checks_are_required_and_unsafe_inputs_cannot_silently_pass(self):
        for patch in ({'executor': ''}, {'vehicleId': 999}, {'method': ''}, {'method': 'phone'}, {'alcohol': ''}, {'inspection': ''}, {'health': 'concern'}, {'detectorUsed': 'no'}, {'alcoholValue': True}, {'alcoholValue': -1}, {'alcoholValue': 0.0001}, {'alcoholValue': float('nan')}, {'at': '2026-11-13T21:59:00+09:00'}):
            row = duty(before={**call(), **patch})
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                app.validate(self.workspace([row]))
        row = duty(before={**call(), 'health': 'concern', 'response': '確認して報告'})
        app.validate(self.workspace([row]))

    def test_overlap_future_dates_timezone_and_cancelled_shifts(self):
        first = duty()
        second = {**first, 'id': 'r2', 'dutyId': 'shift2', 'dutyDate': '2026-11-14', 'clockIn': '2026-11-14T06:00:00+09:00', 'clockOut': '2026-11-14T07:00:00+09:00'}
        app.validate(self.workspace([first, second]))
        with self.assertRaises(ValueError):
            app.validate(self.workspace([{**first, 'clockOut': None}, second]))
        for patch in ({'clockIn': '2026-11-13T22:00:00'}, {'clockOut': '2026-11-13T21:00:00+09:00'}, {'dutyDate': 'bad'}):
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                app.validate(self.workspace([{**first, **patch}]))
        cancel = {**first, 'id': 'cancel', 'supersedes': 'r1', 'reason': '誤登録の取消', 'voided': True}
        app.validate(self.workspace([first, cancel, {**second, 'clockIn': first['clockIn'], 'dutyDate': first['dutyDate']}]))
        future = {**first, 'dutyDate': '2099-01-01', 'clockIn': '2099-01-01T10:00:00+09:00', 'clockOut': None}
        with self.assertRaises(ValueError):
            app.preserve_duty_logs(sample(), self.workspace([future]))
