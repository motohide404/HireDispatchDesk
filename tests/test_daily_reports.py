import copy
import json
import unittest
from unittest.mock import MagicMock
from test_validation import app, sample


def workspace():
    value=sample()
    value['drivers'][0].update(name='見本乗務員',status='active')
    value['vehicles'][0]['plateNo']='見本車両'
    return value


def report():
    return dict(id='version-1',reportId='daily-1',version=1,date='2030-01-01',driverId=1,driverName='見本乗務員',vehicleId=1,vehiclePlate='見本車両',office='見本営業所',status='submitted',reason='',savedAt='2026-11-15T00:00:00Z',startAt='2030-01-01T23:30',startPlace='車庫',startOdometer='12990',dutyStart='2030-01-01T23:20',dutyEnd='2030-01-02T01:30',notes='',rows=[dict(id='row-1',kind='passenger',startAt='2030-01-01T23:40',endAt='2030-01-02T01:00',**{'from':'乗車地','to':'降車地'},meter='025',rollover=True,passengers='2',note='',instructionId='',jobLabel='空港送迎',plannedStart='',plannedEnd='')])


class DailyReportTests(unittest.TestCase):
    def test_overnight_rollover_and_incomplete_draft(self):
        app.validate_daily_report(report(),workspace())
        row=report();row.update(status='draft',startAt='',startOdometer='',rows=[],dutyStart='',dutyEnd='')
        app.validate_daily_report(row,workspace())
        row['status']='submitted'
        with self.assertRaises(ValueError):app.validate_daily_report(row,workspace())

    def test_no_missing_meter_or_unconfirmed_rollover_on_submission(self):
        for patch in ({'meter':''},{'meter':'1000'},{'meter':'-1'},{'meter':'25.0'},{'rollover':False},{'passengers':''},{'passengers':'0'},{'startAt':'2030-01-01T23:00'},{'endAt':'2030-01-01T22:00'},{'from':''}):
            row=report();row['rows'][0].update(patch)
            with self.subTest(patch=patch),self.assertRaises(ValueError):app.validate_daily_report(row,workspace())

    def test_keep_identity_and_require_reason_after_submission(self):
        old=report();row=copy.deepcopy(old);row.update(id='version-2',version=2,reason='実時刻を訂正')
        row['rows'][0]['endAt']='2030-01-02T01:10'
        app.validate_daily_report(row,workspace(),old)
        for patch in ({'reason':''},{'status':'draft'},{'vehicleId':2},{'driverId':2},{'version':1},{'date':'2030-01-02'}):
            with self.subTest(patch=patch),self.assertRaises(ValueError):app.validate_daily_report({**row,**patch},workspace(),old)
        self.assertEqual(old['rows'][0]['endAt'],'2030-01-02T01:00')

    def test_many_rows_are_allowed_and_duplicate_row_ids_rejected(self):
        row=report();row['status']='draft';row['rows']=[{**row['rows'][0],'id':str(i),'startAt':'','endAt':''} for i in range(40)]
        app.validate_daily_report(row,workspace())
        row['rows'][1]['id']='0'
        with self.assertRaises(ValueError):app.validate_daily_report(row,workspace())

    def test_changed_driver_name_does_not_rewrite_historical_snapshot(self):
        old=report();value=workspace();value['drivers'][0]['name']='改名後'
        row={**old,'id':'v2','version':2,'reason':'補足訂正'}
        app.validate_daily_report(row,value,old)
        with self.assertRaises(ValueError):app.validate_daily_report(old,value)

    def test_idempotent_retry_returns_saved_record_without_inserting(self):
        row=report();cur=MagicMock();cur.fetchone.return_value=(row,)
        handler=MagicMock();handler.path='/api/daily-reports';handler.body.return_value=json.dumps(row)
        app.daily_report_api(handler,cur,MagicMock(),'POST','/api/daily-reports')
        handler.send.assert_called_once_with(200,{'record':row})
        self.assertFalse(any('INSERT INTO daily_reports' in str(call) for call in cur.execute.call_args_list))

    def test_stale_version_rejected_before_any_write(self):
        row=report();cur=MagicMock();cur.fetchone.side_effect=[None,(row,)]
        handler=MagicMock();handler.path='/api/daily-reports';handler.body.return_value=json.dumps(row)
        app.daily_report_api(handler,cur,MagicMock(),'POST','/api/daily-reports')
        self.assertEqual(handler.send.call_args.args[0],409)
        self.assertFalse(any('INSERT INTO daily_reports' in str(call) for call in cur.execute.call_args_list))

    def test_new_report_inserts_outside_workspace_and_validates_instruction_owner(self):
        row=report();cur=MagicMock();cur.fetchone.side_effect=[None,None,(workspace(),)]
        handler=MagicMock();handler.path='/api/daily-reports';handler.body.return_value=json.dumps(row)
        app.daily_report_api(handler,cur,MagicMock(),'POST','/api/daily-reports')
        self.assertEqual(handler.send.call_args.args[0],201)
        self.assertTrue(any('INSERT INTO daily_reports' in str(call) for call in cur.execute.call_args_list))
        row['rows'][0].update(instructionId='wrong',plannedStart='x',plannedEnd='y')
        cur=MagicMock();cur.fetchone.side_effect=[None,None,(workspace(),),({'kind':'instruction','voided':False,'driverId':2,'vehicleId':1},)]
        handler.body.return_value=json.dumps(row)
        with self.assertRaisesRegex(ValueError,'乗務員・車両'):app.daily_report_api(handler,cur,MagicMock(),'POST','/api/daily-reports')

    def test_no_delete_or_put_endpoint(self):
        for method in ('DELETE','PUT'):
            handler=MagicMock();handler.path='/api/daily-reports'
            app.daily_report_api(handler,MagicMock(),MagicMock(),method,'/api/daily-reports')
            self.assertEqual(handler.send.call_args.args[0],404)
