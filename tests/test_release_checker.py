import copy
import importlib.util
from pathlib import Path
import unittest
from test_validation import app, sample
from test_duty_validation import duty

spec = importlib.util.spec_from_file_location('release_checker', Path(__file__).resolve().parents[1] / 'deploy/releases/20261114-ledgers/verify_server.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class ReleaseCheckerTests(unittest.TestCase):
    def test_future_assigned_and_unassigned_reservations_are_accepted(self):
        value = sample()
        value['bookings'][0].update(start='2030-01-01T09:00:00+09:00', end='2030-01-01T10:00:00+09:00')
        value['jobPool'].append(dict(id='future-unassigned', title='未来日の予約',
                                     start='2031-01-01T09:00:00+09:00', end='2031-01-01T10:00:00+09:00',
                                     vehicleId=None, driverId=None,
                                     client={'type': '個人', 'name': '検証用', 'source': 'manual', 'email': 'test@example.com'}))
        app.validate(value)

    def test_open_real_duty_does_not_overlap_isolated_test_driver(self):
        before = sample()
        before['drivers'][0].update(name='既存運転者', code='EXISTING', status='active', documents=[{'id': 'existing-doc'}])
        before['dutyLogs'] = [{**duty(), 'clockOut': None}]
        changed = copy.deepcopy(before)
        original_driver = copy.deepcopy(changed['drivers'][0])
        driver = checker.add_exercise_driver(changed, 'unique')
        shift = {**duty(), 'id': 'test-record', 'dutyId': 'test-duty', 'driverId': driver['id'],
                 'driverName': driver['name'], 'driverCode': driver['code'], 'dutyDate': '2000-01-01',
                 'clockIn': '2000-01-01T22:00:00+09:00', 'clockOut': None, 'before': None, 'after': None}
        changed['dutyLogs'].append(shift)
        app.validate(changed)
        self.assertNotIn(driver['id'], [row['id'] for row in before['drivers']])
        self.assertEqual(changed['drivers'][0], original_driver)
        driver['documents'].append({'id': 'new-doc'})
        self.assertEqual(changed['drivers'][0], original_driver)
        self.assertEqual(changed['dutyLogs'][0], before['dutyLogs'][0])
