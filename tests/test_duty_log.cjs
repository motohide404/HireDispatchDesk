const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../client/node_modules/typescript');
const context = { exports: {}, Intl, Date, Set };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('client/src/lib/dutyLog.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
const { latestDuties, dutyError, dutyCsv, localTime, needsAttention } = context.exports;
const duty = (patch = {}) => ({ id: 'r1', dutyId: 'shift1', recordedAt: '2026-11-13T13:00:00Z', recorder: '記録担当', reason: '', driverId: 1, driverName: 'テスト運転者', driverCode: 'D1', dutyDate: '2026-11-13', clockIn: '2026-11-13T22:00:00+09:00', clockOut: '2026-11-14T06:00:00+09:00', note: '', voided: false, ...patch });
const call = (patch = {}) => ({ at: '2026-11-13T22:10:00+09:00', executor: '点呼担当', vehicleId: 11, vehicleLabel: 'テスト車両', method: 'face', methodDetail: '', alcohol: 'none', detectorUsed: 'yes', health: 'good', fatigue: 'none', sleep: 'enough', inspection: 'ok', instructions: '', report: '', handover: '', response: '', ...patch });
const now = Date.parse('2026-11-14T10:00:00+09:00');
test('overnight attendance is independent of rollcall times and corrections keep original records', () => {
 const first = duty(); const next = duty({ id: 'r2', supersedes: 'r1', reason: '乗務前追記', before: call() });
 assert.equal(dutyError(next, [first], now), ''); assert.equal(first.before, undefined);
 assert.deepEqual(Array.from(latestDuties([first, next]), x => x.id), ['r2']);
 assert.equal(localTime('2026-11-13T15:30:00Z'), '2026-11-14T00:30');
 assert.match(dutyError(duty({ before: call({ at: '2026-11-13T21:59:00+09:00' }) }), [], now), /点呼日時/);
 assert.match(dutyError(duty({ before: call(), after: call({ at: '2026-11-13T22:09:00+09:00' }) }), [], now), /乗務後/);
});
test('open shifts prevent duplicate attendance, adjacent and cancelled shifts allow new work', () => {
 const old = duty({ clockOut: undefined }); const fresh = duty({ id: 'r2', dutyId: 's2', dutyDate: '2026-11-14', clockIn: '2026-11-14T06:00:00+09:00', clockOut: undefined });
 assert.match(dutyError(fresh, [old], now), /重複/);
 assert.equal(dutyError(fresh, [duty()], now), '');
 assert.equal(dutyError(fresh, [duty({ voided: true })], now), '');
 assert.match(dutyError(duty({ clockOut: 'broken' }), [], now), /退勤日時/);
 assert.match(dutyError(duty({ supersedes: 'r0' }), [], now), /理由/);
});
test('positive measurements and concerns require recorded followup without fabricating zero readings', () => {
 assert.equal(needsAttention(call()), false); assert.equal(call().alcoholValue, undefined);
 assert.equal(needsAttention(call({ alcohol: 'detected' })), true);
 assert.match(dutyError(duty({ before: call({ health: 'concern' }) }), [], now), /対応/);
 assert.equal(dutyError(duty({ before: call({ health: 'concern', response: '確認し担当者へ報告' }) }), [], now), '');
 assert.match(dutyError(duty({ before: call({ method: 'phone' }) }), [], now), /具体的/);
 assert.match(dutyError(duty({ before: call({ alcoholValue: NaN }) }), [], now), /測定値/);
});
test('CSV has BOM, prevents formulas, exports latest attendance once and preserves revision details', () => {
 const first = duty({ note: '=HYPERLINK("test")' }); const second = duty({ id: 'r2', supersedes: 'r1', reason: '追記', before: call(), note: '行1\n行2' });
 const csv = dutyCsv([first, second], 'attendance');
 assert.equal(csv.charCodeAt(0), 0xfeff); assert.match(csv, /行1\n行2/); assert.equal(csv.split('テスト運転者').length - 1, 1);
 assert.match(dutyCsv([first], 'attendance'), /'=HYPERLINK/);
 const log = dutyCsv([first, second], 'rollcall'); assert.match(log, /乗務前/); assert.match(log, /22:10/); assert.match(log, /22:00/);
 const history = dutyCsv([first, second], 'history'); assert.match(history, /r1/); assert.match(history, /r2/);
 assert.equal(dutyCsv([duty({ voided: true })], 'attendance').split('テスト運転者').length - 1, 0);
});
