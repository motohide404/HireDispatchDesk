const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('../client/node_modules/typescript');
const transpile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const vehiclesModule = { exports: {} };
vm.runInNewContext(transpile('client/src/data/vehicles.ts'), vehiclesModule);
const customersModule = { exports: {} };
vm.runInNewContext(transpile('client/src/lib/jobCustomers.ts'), customersModule);
const context = { exports: {}, crypto: { randomUUID: () => crypto.randomUUID() }, require: name => name.endsWith('jobCustomers') ? customersModule.exports : vehiclesModule.exports };
vm.runInNewContext(transpile('client/src/lib/jobEntry.ts'), context);
const { JOB_COLUMNS, createJobRow, hasJobInput, validateJobRows, parseSpreadsheet, pasteJobCells, amountValue, dateValue, timeValue } = context.exports;
const drivers = [{ id: 1, name: 'テスト乗務員', code: 'TEST-001', status: 'active' }, { id: 2, name: '退職テスト', code: 'TEST-002', status: 'archived' }];
const vehicles = [{ id: 11, name: 'テスト車両', vehiclesId: 'TEST-VH-001', plateNo: 'テスト123', class: 'sedan' }];
function row(values = {}) { const result = createJobRow('2026-11-14'); result.values = { ...result.values, title: 'テスト送迎', clientName: 'テスト利用者', startTime: '9:00', endTime: '10:00', phone: '090-0000-0000', ...values }; return result; }

const customers = {
  partners: [{ id: 'p1', internalId: 'TEST-C001', displayName: '見本ホテル', officialName: '株式会社見本ホテル', category: '法人', phone: '03-0000-0001', email: 'hq@example.com' },
    { id: 'p2', internalId: 'TEST-C002', displayName: '見本旅行', category: '旅行会社', phone: '03-0000-0002', email: 'travel@example.com' }],
  offices: [{ id: 'o1', partnerId: 'p1', displayName: '予約支店', phone: '03-0000-0011', email: 'office@example.com' }],
  contacts: [{ id: 'c1', partnerId: 'p1', affiliationType: 'office', affiliationId: 'o1', name: '見本窓口', phone: '03-0000-0111', email: 'contact@example.com' }]
};
const check = (input, ledger = customers) => validateJobRows([input], drivers, vehicles, JOB_COLUMNS, ledger)[0];

test('existing customer matching uses stable ledger IDs and new customers require at least one usable contact channel', () => {
  const matched = check(row({ clientName: '株式会社見本ホテル', phone: '' }));
  assert.equal(matched.job.client.partnerId, 'p1');
  assert.equal(matched.job.client.name, '見本ホテル');
  assert.equal(matched.job.client.phone, '03-0000-0001');
  assert.equal(matched.job.client.source, 'ledger');
  assert.equal(check(row({ clientName: 'TEST-C002', phone: '+81 (90) 0000-1234' })).job.client.phone, '+81 (90) 0000-1234');
  const emailOnly = check(row({ phone: '', email: 'demo@example.com' })).job.client;
  assert.equal(emailOnly.source, 'manual'); assert.equal(emailOnly.email, 'demo@example.com');
  assert.equal(check(row({ phone: '', email: '' })).job, undefined);
  for (const values of [{ phone: '000' }, { phone: '電話ください' }, { email: 'bad@' }, { email: 'a@b.example\nBcc:x@y.example' }, { phone: '0'.repeat(41) }]) assert.equal(check(row(values)).job, undefined);
  const duplicateLedger = { ...customers, partners: [...customers.partners, { ...customers.partners[0], id: 'p3', internalId: 'TEST-C003' }] };
  assert.match(check(row({ clientName: '見本ホテル' }), duplicateLedger).errors.clientName, /同じ名前/);
  assert.equal(check(row({ clientName: 'TEST-C001' }), duplicateLedger).job.client.partnerId, 'p1');
});

test('office and person selection follows the right ledger records, refreshes drafts and preserves job-specific overrides', () => {
  const { selectJobCustomer, resolveJobCustomer } = customersModule.exports;
  const selected = selectJobCustomer(row(), { partnerId: 'p1', officeId: 'o1', contactId: 'c1' }, customers);
  assert.equal(selected.values.phone, '03-0000-0111');
  assert.equal(check(selected).job.client.officeName, '予約支店');
  assert.equal(check(selected).job.client.contactId, 'c1');
  selected.values.phone = '090-0000-9999';
  const updated = JSON.parse(JSON.stringify(customers));
  updated.contacts[0].phone = '03-9999-9999'; updated.contacts[0].email = 'updated@example.com';
  const refreshed = resolveJobCustomer(selected, updated).row;
  assert.equal(refreshed.values.phone, '090-0000-9999');
  assert.equal(refreshed.values.email, 'updated@example.com');
  assert.equal(customers.contacts[0].phone, '03-0000-0111');
  const wrong = { ...selected, customer: { partnerId: 'p2', officeId: 'o1', contactId: 'c1' } };
  assert.match(check(wrong).errors.clientName, /選び直して/);
});

test('pasting another customer over a linked row clears the previous contact and preserves the job fields', () => {
  const { selectJobCustomer, resolveJobCustomer, unlinkJobCustomer } = customersModule.exports;
  const selected = selectJobCustomer(row(), { partnerId: 'p1', officeId: 'o1', contactId: 'c1' }, customers);
  const pasted = pasteJobCells([selected], 0, 1, '見本旅行\t旅行会社', '2026-11-14')[0];
  const changed = resolveJobCustomer(pasted, customers).row;
  assert.equal(changed.customer.partnerId, 'p2');
  assert.equal(changed.values.phone, '03-0000-0002');
  assert.equal(changed.values.contactName, '');
  assert.equal(changed.values.title, 'テスト送迎');
  const cleared = unlinkJobCustomer(selected);
  assert.equal(cleared.customer, undefined); assert.equal(cleared.values.phone, ''); assert.equal(cleared.values.email, '');
  assert.equal(check(cleared).job, undefined);
});

test('spreadsheet rows normalize Japan dates/times, keep zero separate from unset, and resolve named assignments', () => {
  const input = row({ startDate: '２０２６／１１／１４', amount: '￥25,000', driver: 'テスト乗務員（TEST-001）', vehicle: 'TEST-VH-001', preferClass: 'セダン', note: ' 集合場所の連絡 ' });
  const result = validateJobRows([input], drivers, vehicles)[0];
  assert.equal(Object.keys(result.errors).length, 0);
  assert.equal(result.job.start, '2026-11-14T09:00:00+09:00');
  assert.equal(result.job.end, '2026-11-14T10:00:00+09:00');
  assert.equal(result.job.driverId, 1); assert.equal(result.job.vehicleId, 11);
  assert.equal(result.job.amount, 25000); assert.equal(result.job.preferClass, 'sedan');
  assert.equal(result.job.note, '集合場所の連絡');
  assert.equal(validateJobRows([row({ amount: '0' })], drivers, vehicles)[0].job.amount, 0);
  assert.equal('amount' in validateJobRows([row({ amount: '' })], drivers, vehicles)[0].job, false);
  assert.equal(hasJobInput(createJobRow('2026-11-14')), false);
});

test('invalid dates, ambiguous or archived staff, malformed money and incomplete rows are not registered', () => {
  for (const [key, value] of [['startDate', '2026-02-30'], ['startTime', '24:00'], ['endTime', '8:00'], ['title', ''], ['clientName', ''], ['amount', '12,34'], ['amount', '-1'], ['amount', '1.5'], ['amount', '10000000000'], ['driver', 'TEST-002'], ['vehicle', 'missing']]) {
    const result = validateJobRows([row({ [key]: value })], drivers, vehicles)[0];
    assert.equal(result.job, undefined, `${key}=${value}`);
    assert.ok(Object.keys(result.errors).length);
  }
  const duplicates = [...drivers, { ...drivers[0], id: 3, code: 'TEST-003' }];
  assert.ok(validateJobRows([row({ driver: 'テスト乗務員' })], duplicates, vehicles)[0].errors.driver);
  assert.equal(validateJobRows([row({ driver: 'TEST-003' })], duplicates, vehicles)[0].job.driverId, 3);
  assert.equal(dateValue('2028/2/29'), '2028-02-29');
  assert.equal(dateValue('2026/2/29'), undefined);
  assert.equal(timeValue('9:05:00'), '09:05');
  assert.equal(amountValue('0.1'), undefined);
});

test('overnight registration requires an explicit end date instead of guessing the next day', () => {
  const input = row({ startTime: '23:00', endTime: '01:00' });
  assert.ok(validateJobRows([input], drivers, vehicles)[0].errors.endTime);
  input.values.endDate = '2026/11/15';
  assert.equal(validateJobRows([input], drivers, vehicles)[0].job.end, '2026-11-15T01:00:00+09:00');
});

test('Excel TSV parsing preserves quoted tabs/newlines/quotes, trailing empty cells and CRLF rows', () => {
  const parsed = parseSpreadsheet('仕事A\t"メモ\tタブ\n二行目"\t\r\n仕事B\t"引用""あり"\t0\r\n');
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), [['仕事A', 'メモ\tタブ\n二行目', ''], ['仕事B', '引用"あり', '0']]);
  assert.throws(() => parseSpreadsheet('"閉じていない\t入力'), /引用符/);
});

test('multi-cell paste grows rows, uses column definitions, skips full headers and never truncates overflow', () => {
  const rows = [createJobRow('2026-11-14')];
  const header = JOB_COLUMNS.map(column => column.label).join('\t');
  const first = ['テストA', '取引先A', '法人', '2026/11/14', '9:00', '', '10:00', 'ワゴン', '', '', '0', 'メモ', '', '090-0000-0000', ''];
  const second = ['テストB', '取引先B', '個人', '2026/11/15', '11:00', '', '12:00', '', '', '', '', '', '', '', 'test@example.com'];
  const result = pasteJobCells(rows, 0, 0, header + '\r\n' + first.join('\t') + '\r\n' + second.join('\t') + '\r\n', '2026-11-14');
  assert.equal(result.length, 2); assert.equal(result[0].id, rows[0].id);
  assert.equal(result[1].values.startDate, '2026-11-15');
  assert.equal(validateJobRows(result, drivers, vehicles).filter(item => item.job).length, 2);
  assert.equal(rows[0].values.title, '');
  assert.throws(() => pasteJobCells(rows, 199, 0, 'a\nb', '2026-11-14'), /200行/);
  assert.throws(() => pasteJobCells(rows, 0, JOB_COLUMNS.length - 1, 'a\tb', '2026-11-14'), /列数/);
  assert.equal(rows[0].values.title, '');
});

test('a future optional column is stored as extra data without changing existing job fields or column order logic', () => {
  const columns = [...JOB_COLUMNS, { key: 'flight', label: '便名', kind: 'text', width: 120, extra: true }];
  const input = row({ flight: 'TEST123' });
  const result = validateJobRows([input], drivers, vehicles, columns)[0];
  assert.equal(result.job.extraFields['便名'], 'TEST123');
  const pasted = pasteJobCells([row()], 0, columns.length - 1, 'TEST456\n', '2026-11-14', columns);
  assert.equal(validateJobRows(pasted, drivers, vehicles, columns)[0].job.extraFields['便名'], 'TEST456');
  assert.equal(result.job.title, 'テスト送迎');
});
