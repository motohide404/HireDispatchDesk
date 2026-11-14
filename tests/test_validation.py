"""Data-integrity checks runnable without a local database server."""
import copy
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch, MagicMock

try:
    import psycopg2
except ImportError:
    sys.modules['psycopg2'] = types.ModuleType('psycopg2')
    sys.modules['psycopg2.extras'] = types.SimpleNamespace(Json=lambda value: value)
    sys.modules['psycopg2.pool'] = types.SimpleNamespace(ThreadedConnectionPool=None)

spec = importlib.util.spec_from_file_location('app', Path(__file__).resolve().parents[1] / 'server/app.py')
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)


def sample():
    value = {key: [] for key in app.ALLOWED}
    value.update(officeOrder={}, vehicles=[{'id': 1}, {'id': 2}], drivers=[{'id': 1}, {'id': 2}])
    value['bookings'] = [{'id': 1, 'vehicleId': 1, 'driverId': 1, 'start': '2026-10-23T09:00:00+09:00', 'end': '2026-10-23T10:00:00+09:00'}]
    return value


class ValidationTests(unittest.TestCase):
    def customer_workspace(self):
        value = sample()
        value['partners'] = [{'id': 'p1'}, {'id': 'p2'}]
        value['offices'] = [{'id': 'o1', 'partnerId': 'p1'}]
        value['contacts'] = [{'id': 'c1', 'partnerId': 'p1', 'affiliationType': 'office', 'affiliationId': 'o1'}]
        value['bookings'][0]['client'] = {'name': '見本取引先', 'type': '法人', 'source': 'ledger', 'partnerId': 'p1', 'officeId': 'o1', 'contactId': 'c1', 'phone': '03-0000-0000', 'email': 'test@example.com'}
        return value

    def test_customer_contacts_and_ledger_relations_are_retained_with_legacy_jobs(self):
        value = self.customer_workspace()
        value['jobPool'] = [{'id': 'new', 'vehicleId': None, 'driverId': None, 'start': '2026-11-14T09:00:00+09:00', 'end': '2026-11-14T10:00:00+09:00', 'client': {'name': '新規のお客様', 'type': '個人', 'source': 'manual', 'email': 'new@example.com'}}]
        app.validate(value)
        value['jobPool'][0]['client'] = {'name': '過去の連絡先未記録', 'type': '個人'}
        app.validate(value)

    def test_customer_contacts_reject_invalid_channels_and_wrong_office_or_person(self):
        for change in [
            {'phone': '', 'email': ''}, {'phone': '000'}, {'email': 'broken@'}, {'email': 'a@b.example\nBcc:x@y.example'},
            {'phone': '0' * 41}, {'source': 'unexpected'}, {'source': 'manual'}, {'partnerId': 'p2'},
            {'officeId': 'missing'}, {'contactId': 'missing'}, {'officeId': None}, {'name': ''}
        ]:
            value = self.customer_workspace()
            value['bookings'][0]['client'].update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                app.validate(value)
        value = self.customer_workspace()
        del value['bookings'][0]['client']['officeId']
        with self.assertRaisesRegex(ValueError, '担当者'):
            app.validate(value)

    def test_valid_booking(self):
        app.validate(sample())

    def test_same_vehicle_overlap(self):
        value = sample()
        value['appDuties'] = [{**value['bookings'][0], 'id': 'duty', 'driverId': 2}]
        with self.assertRaisesRegex(ValueError, '車両'):
            app.validate(value)

    def test_same_driver_across_vehicles(self):
        value = sample()
        value['appDuties'] = [{**value['bookings'][0], 'id': 'duty', 'vehicleId': 2}]
        with self.assertRaisesRegex(ValueError, '運転者'):
            app.validate(value)

    def test_overnight_and_adjacent_booking(self):
        value = sample()
        value['bookings'][0].update(start='2026-10-23T23:00:00+09:00', end='2026-10-24T01:00:00+09:00')
        value['bookings'].append({**value['bookings'][0], 'id': 2, 'start': '2026-10-24T01:00:00+09:00', 'end': '2026-10-24T02:00:00+09:00'})
        app.validate(value)
        value['bookings'][1]['start'] = '2026-10-24T00:59:00+09:00'
        with self.assertRaises(ValueError):
            app.validate(value)

    def test_missing_vehicle_and_duplicate_ids(self):
        value = sample()
        value['bookings'][0]['vehicleId'] = 999
        with self.assertRaises(ValueError):
            app.validate(value)
        value = sample()
        value['drivers'].append({'id': 1})
        with self.assertRaises(ValueError):
            app.validate(value)

    def test_unassigned_job_can_wait(self):
        value = sample()
        value['jobPool'] = [{**value['bookings'][0], 'id': 'job', 'vehicleId': None, 'driverId': None}]
        app.validate(value)

    def test_new_ledger_fields_and_legacy_data_can_coexist(self):
        value = sample()
        value['drivers'][0].update(
            facePhoto={'uri': '/api/files/' + 'a' * 32 + '?inline=1'},
            aptitudeRecords=[{'id': 'exam', 'type': '一般診断', 'assessedAt': '2026-11-01', 'nextDueAt': '2027-11-01'}])
        value['vehicles'][0]['class'] = 'ジャンボハイヤー（9人乗り）'
        value['partners'] = [{'id': 'partner', 'tariffs': [{
            'id': 'tariff', 'name': '空港送迎', 'baseFare': 35000,
            'taxTreatment': 'included', 'discount': {'kind': 'yen', 'value': 1500},
            'kickback': {'kind': 'percent', 'value': 12.34},
            'validFrom': '2026-11-01', 'validUntil': '2027-03-31'}]}]
        app.validate(value)

    def test_invalid_assessment_dates_and_duplicate_history(self):
        for patch in [
            {'assessedAt': '2026-02-30'}, {'assessedAt': '20261101'},
            {'assessedAt': None}, {'nextDueAt': '2026-10-31'}, {'type': '   '}
        ]:
            with self.subTest(patch=patch):
                value = sample()
                value['drivers'][0]['aptitudeRecords'] = [{
                    'id': 'exam', 'type': '一般診断', 'assessedAt': '2026-11-01', **patch}]
                with self.assertRaises(ValueError):
                    app.validate(value)
        value = sample()
        value['drivers'][0]['aptitudeRecords'] = [{'id': 'same'}] * 2
        with self.assertRaises(ValueError):
            app.validate(value)

    def test_tariff_rejects_invalid_money_units_dates_and_duplicate_ids(self):
        valid = {'id': 't', 'name': '送迎', 'taxTreatment': 'unspecified',
                 'discount': {'kind': 'none', 'value': 0}, 'kickback': {'kind': 'percent', 'value': 10}}
        for patch in [
            {'baseFare': -1}, {'baseFare': 0.5}, {'baseFare': True}, {'baseFare': float('nan')},
            {'baseFare': float('inf')}, {'baseFare': 10000000000},
            {'discount': {'kind': 'none', 'value': 100}},
            {'discount': {'kind': 'percent', 'value': 100.01}},
            {'discount': {'kind': 'percent', 'value': 1.234}},
            {'kickback': {'kind': 'unknown', 'value': 1}},
            {'taxTreatment': 'unknown'}, {'name': ' '},
            {'validFrom': '2026-12-01', 'validUntil': '2026-11-30'}
        ]:
            with self.subTest(patch=patch):
                value = sample()
                value['partners'] = [{'id': 'p', 'tariffs': [{**valid, **patch}]}]
                with self.assertRaises(ValueError):
                    app.validate(value)
        value = sample()
        value['partners'] = [{'id': 'p', 'tariffs': [valid, valid]}]
        with self.assertRaises(ValueError):
            app.validate(value)

    def test_custom_vehicle_class_validation(self):
        for invalid in ['', '  ', 123, '車' * 81]:
            value = sample()
            value['vehicles'][0]['class'] = invalid
            with self.assertRaises(ValueError):
                app.validate(value)

    def test_face_photo_requires_internal_attachment_reference(self):
        for uri in ['https://example.com/photo.jpg', 'javascript:alert(1)', '/api/files/missing', None]:
            value = sample()
            value['drivers'][0]['facePhoto'] = {'uri': uri}
            with self.assertRaises(ValueError):
                app.validate(value)

    def test_only_raster_image_signatures_can_render_inline(self):
        self.assertEqual(app.inline_image_type(b'\x89PNG\r\n\x1a\nrest'), 'image/png')
        self.assertEqual(app.inline_image_type(b'\xff\xd8\xffrest'), 'image/jpeg')
        self.assertEqual(app.inline_image_type(b'RIFF1234WEBPrest'), 'image/webp')
        for content in [b'<svg onload="alert(1)"></svg>', b'<!DOCTYPE html>', b'RIFF1234WAVE', b'']:
            self.assertIsNone(app.inline_image_type(content))

    def test_file_route_preserves_downloads_and_serves_authenticated_inline_images(self):
        content = b'\x89PNG\r\n\x1a\nimage-bytes'
        for query, authenticated, payload, expected_status, expected_mime in [
            ('', True, content, 200, 'application/octet-stream'),
            ('?inline=1', True, content, 200, 'image/png'),
            ('?inline=1', True, b'<svg></svg>', 400, None),
            ('?inline=1', False, content, 401, None)
        ]:
            with self.subTest(query=query, authenticated=authenticated, payload=payload):
                handler = object.__new__(app.Handler)
                handler.path = '/api/files/' + 'a' * 32 + query
                handler.authenticated = lambda cur: authenticated
                handler.send = MagicMock()
                conn = MagicMock()
                conn.cursor.return_value.__enter__.return_value.fetchone.return_value = ('写真.png', payload)
                with patch.object(app, 'connection', return_value=conn), patch.object(app, 'POOL', MagicMock()):
                    handler.handle_request('GET')
                response = handler.send.call_args
                self.assertEqual(response.args[0], expected_status)
                if expected_mime:
                    self.assertEqual(response.args[2], expected_mime)
                    self.assertTrue(response.args[3]['Content-Disposition'].startswith('inline' if query else 'attachment'))


if __name__ == '__main__':
    unittest.main()
