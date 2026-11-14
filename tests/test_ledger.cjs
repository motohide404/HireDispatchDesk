const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../client/node_modules/typescript');

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('client/src/lib/ledger.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, context);
const { latestAptitude, aptitudeDueStatus, todayInJapan, licenseExpiryStatus, validAdjustment } = context.exports;

test('license deadlines include today and day 60, distinguish expired dates, and ignore missing or impossible dates', () => {
  const status = date => licenseExpiryStatus(date, '2026-11-14');
  assert.equal(status('2026-11-14').days, 0);
  assert.equal(status('2026-11-14').label, '本日期限');
  assert.equal(status('2026-11-14').within60Days, true);
  assert.equal(status('2026-11-14').withinMonth, true);
  assert.equal(status('2027-01-13').days, 60);
  assert.equal(status('2027-01-13').within60Days, true);
  assert.equal(status('2027-01-14').within60Days, false);
  assert.equal(status('2026-11-13').label, '期限切れ・1日超過');
  assert.equal(status('2026-11-13').within60Days, false);
  assert.equal(status('2026-11-13').withinMonth, false);
  for (const value of [undefined, '', '2026-02-29', '2026-11-31', '2026/12/01', 'not-a-date']) {
    assert.equal(status(value).date, undefined);
    assert.equal(status(value).within60Days, false);
    assert.equal(status(value).withinMonth, false);
  }
});

test('one calendar month includes its last day and handles short months, leap years, and year boundaries', () => {
  for (const [today, lastIncluded, firstExcluded] of [
    ['2026-11-14', '2026-12-14', '2026-12-15'],
    ['2026-01-31', '2026-02-28', '2026-03-01'],
    ['2028-01-31', '2028-02-29', '2028-03-01'],
    ['2028-02-29', '2028-03-29', '2028-03-30'],
    ['2026-12-31', '2027-01-31', '2027-02-01']
  ]) {
    assert.equal(licenseExpiryStatus(lastIncluded, today).withinMonth, true, `${today} to ${lastIncluded}`);
    assert.equal(licenseExpiryStatus(firstExcluded, today).withinMonth, false, `${today} to ${firstExcluded}`);
  }
  assert.equal(licenseExpiryStatus('2026-12-14', '2026-11-14').tone, 'urgent');
  assert.equal(licenseExpiryStatus('2026-12-15', '2026-11-14').tone, 'soon');
});

test('license dates follow the Japan calendar across the UTC midnight boundary', () => {
  assert.equal(licenseExpiryStatus('2026-11-14', todayInJapan(new Date('2026-11-14T14:59:59Z'))).withinMonth, true);
  assert.equal(licenseExpiryStatus('2026-11-14', todayInJapan(new Date('2026-11-14T15:00:00Z'))).withinMonth, false);
  assert.equal(licenseExpiryStatus('2026-11-14', todayInJapan(new Date('2026-11-14T15:00:00Z'))).label, '期限切れ・1日超過');
});

test('backdated assessments do not replace the latest next-due date; same-day corrections win', () => {
  const records = [
    { id: 'new', assessedAt: '2026-10-01', nextDueAt: '2027-10-01' },
    { id: 'old', assessedAt: '2025-01-01', nextDueAt: '2026-01-01' }
  ];
  assert.equal(latestAptitude(records).id, 'new');
  assert.equal(aptitudeDueStatus(records, '2026-11-14').date, '2027-10-01');
  records.push({ id: 'correction', assessedAt: '2026-10-01', nextDueAt: '2027-04-01' });
  assert.equal(latestAptitude(records).id, 'correction');
});

test('next dates distinguish past, today, and 60-day boundary without timezone drift', () => {
  const due = date => aptitudeDueStatus([{ id: 'one', assessedAt: '2026-01-01', nextDueAt: date }], '2026-11-14');
  assert.equal(due('2026-11-13').tone, 'overdue');
  assert.equal(due('2026-11-14').label, '本日予定');
  assert.equal(due('2027-01-13').label, 'あと60日');
  assert.equal(due('2027-01-14').tone, 'neutral');
  assert.equal(todayInJapan(new Date('2026-11-13T15:00:00Z')), '2026-11-14');
  assert.equal(todayInJapan(new Date('2026-11-13T14:59:59Z')), '2026-11-13');
});

test('a new assessment without a next date does not reuse a stale schedule', () => {
  assert.equal(aptitudeDueStatus().date, undefined);
  assert.equal(aptitudeDueStatus([
    { id: 'old', assessedAt: '2025-01-01', nextDueAt: '2026-01-01' },
    { id: 'new', assessedAt: '2026-01-01' }
  ]).date, undefined);
});

test('money conditions reject fractional yen, out-of-range rates, and nonfinite values', () => {
  for (const value of [0, 1200, 9999999999]) assert.equal(validAdjustment({ kind: 'yen', value }), true);
  for (const value of [-1, 0.5, 10000000000, Infinity, NaN]) assert.equal(validAdjustment({ kind: 'yen', value }), false);
  for (const value of [0, 10, 12.34, 100]) assert.equal(validAdjustment({ kind: 'percent', value }), true);
  for (const value of [-1, 100.01, 12.345, 1e-11, Infinity]) assert.equal(validAdjustment({ kind: 'percent', value }), false);
  assert.equal(validAdjustment({ kind: 'none', value: 0 }), true);
  assert.equal(validAdjustment({ kind: 'none', value: 1 }), false);
});
