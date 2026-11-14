const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const { JSDOM } = require('../client/node_modules/jsdom');
const ts = require('../client/node_modules/typescript');

// Real React components/events and store, simulated DOM and API. This verifies
// behavior without claiming browser layout, image decoding, or PostgreSQL QA.
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://test.invalid' });
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
Object.defineProperty(global, 'navigator', { configurable: true, value: dom.window.navigator });
global.IS_REACT_ACT_ENVIRONMENT = true;
global.ResizeObserver = class { observe() {} disconnect() {} };
global.createImageBitmap = async () => ({ close() {} });
global.requestAnimationFrame = callback => { queueMicrotask(() => callback(0)); return 1; };
let previewNumber = 0;
global.URL.createObjectURL = () => `blob:photo-preview-${++previewNumber}`;
global.URL.revokeObjectURL = () => {};
global.alert = message => { throw new Error(message); };
const originalInterval = global.setInterval;
global.setInterval = (...args) => { const timer = originalInterval(...args); timer.unref(); return timer; };
require.extensions['.css'] = () => {};
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
  }).outputText, filename);
}
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  if (request === 'react-beautiful-dnd') request = path.resolve('client/src/lib/reactBeautifulDnd.tsx');
  if (request.startsWith('.') && args[0]?.filename && !path.extname(request)) {
    const base = path.resolve(path.dirname(args[0].filename), request);
    const source = ['.ts', '.tsx'].map(extension => base + extension).find(filename => fs.existsSync(filename));
    if (source) request = source;
  }
  return resolveFilename.call(this, request, ...args);
};
const React = require('../client/node_modules/react');
const { createRoot } = require('../client/node_modules/react-dom/client');
const { act } = React;
const store = require('../client/src/lib/store.ts');
const { createSeed } = require('../client/src/data/seed.ts');
const App = require('../client/src/App.tsx').default;
let root;
let remote;
let uploadedPhotos;
let rejectPhotoUpload;
let rejectWorkspaceWrites;
let lastWorkspaceAttempt;

async function setup({ existingPhoto = false, configureWorkspace } = {}) {
  remote = { revision: 1, value: JSON.parse(JSON.stringify(createSeed())) };
  uploadedPhotos = 0;
  rejectPhotoUpload = false;
  rejectWorkspaceWrites = false;
  if (existingPhoto) remote.value.drivers[0].facePhoto = { id: 'c'.repeat(32), type: 'photo', name: 'old.png', uri: '/api/files/' + 'c'.repeat(32) + '?inline=1', uploadedAt: '2026-11-01' };
  if (configureWorkspace) configureWorkspace(remote.value);
  global.fetch = async (url, options = {}) => {
    if (url === '/api/files') {
      uploadedPhotos++;
      return rejectPhotoUpload ? { ok: false, json: async () => ({ error: 'テスト：保存できませんでした。' }) }
        : { ok: true, json: async () => ({ id: 'a'.repeat(32), name: 'portrait.png', url: '/api/files/' + 'a'.repeat(32), addedAt: '2026-11-14T00:00:00+09:00' }) };
    }
    if (options.method === 'PUT') {
      const payload = JSON.parse(options.body);
      lastWorkspaceAttempt = payload;
      if (rejectWorkspaceWrites) return { ok: false, status: 503, json: async () => ({ error: 'テスト：仕事を保存できませんでした。' }) };
      const result = spawnSync('python3', ['-c', "import sys,json;sys.path.insert(0,'tests');from test_validation import app;v=json.load(sys.stdin);app.validate(v['current']);app.preserve_duty_logs(v['previous'],v['current']);app.preserve_inspections(v['previous'],v['current'])"], { input: JSON.stringify({ previous: remote.value, current: payload.value }), encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(payload.revision, remote.revision);
      remote = { revision: remote.revision + 1, value: payload.value };
      return { ok: true, json: async () => ({ revision: remote.revision }) };
    }
    return { ok: true, json: async () => structuredClone(remote) };
  };
  await store.initializeStore(createSeed());
  await mount();
}
async function mount() { root = createRoot(document.getElementById('root')); await act(async () => root.render(React.createElement(App))); }
async function unmount() { if (root) { await act(async () => root.unmount()); root = null; } }
async function reload() { await unmount(); await store.initializeStore(createSeed()); await mount(); }
async function save() { await act(async () => store.flush()); assert.equal(store.hasUnsavedChanges(), false); }
function one(selector, scope = document) { const element = scope.querySelector(selector); assert.ok(element, `Missing ${selector}`); return element; }
function button(text, scope = document) {
  const element = [...scope.querySelectorAll('button')].find(el => typeof text === 'string' ? el.textContent.trim() === text : text.test(el.textContent));
  assert.ok(element, `Missing button ${text}`); return element;
}
async function click(text, scope = document) { await act(async () => button(text, scope).click()); }
function field(label, scope = document) {
  const element = [...scope.querySelectorAll('label')].find(el => {
    const copy = el.cloneNode(true);
    copy.querySelectorAll('input,textarea,select').forEach(control => control.remove());
    return copy.textContent.trim() === label;
  });
  assert.ok(element, `Missing label ${label}`); return one('input,textarea,select', element);
}
async function fill(element, value) {
  await act(async () => {
    const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
    element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function submit(form) { await act(async () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))); }
async function choosePhoto(type = 'image/png', size = 'png') {
  const input = one('input[type="file"]');
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: [new dom.window.File([size], 'portrait.png', { type })] });
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}
after(async () => { await unmount(); dom.window.close(); });

function jobCell(row, label) { return one(`[aria-label="${row}行目 ${label}"]`); }
async function pasteCells(control, text) {
  await act(async () => {
    const event = new dom.window.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
    control.dispatchEvent(event);
  });
}

test('spreadsheet jobs retain drafts across pages, confirm before saving, and persist together into the unassigned pool', async () => {
  await setup();
  try {
    const originalBookings = JSON.stringify(remote.value.bookings);
    const originalCount = remote.value.jobPool.length;
    await click('仕事登録');
    const { JOB_COLUMNS } = require('../client/src/lib/jobEntry.ts');
    const header = JOB_COLUMNS.map(column => column.label).join('\t');
    const first = ['表入力テストA', '見本ホテル', 'ホテル', '2026/11/14', '18:00', '', '19:00', 'セダン', 'VH-00011', 'DRV-001', '0', '集合場所のメモ', '見本窓口', '090-0000-0000', ''];
    const second = ['表入力テストB', '見本旅行', '法人', '2026/11/14', '23:00', '2026/11/15', '01:00', 'ジャンボハイヤー', '', '', '', '"メモ1行目\nメモ2行目"', '', '', 'demo@example.com'];
    await pasteCells(jobCell(1, '仕事名'), header + '\r\n' + first.join('\t') + '\r\n' + second.join('\t') + '\r\n');
    assert.equal(jobCell(1, '仕事名').value, '表入力テストA');
    assert.equal(jobCell(2, '終了日').value, '2026-11-15');
    assert.equal(remote.value.jobPool.length, originalCount);
    assert.equal(store.hasUnsavedChanges(), false);
    const leaving = new dom.window.Event('beforeunload', { cancelable: true });
    dom.window.dispatchEvent(leaving); assert.equal(leaving.defaultPrevented, true);
    await click('運転者台帳'); await click('仕事登録');
    assert.equal(jobCell(2, '仕事名').value, '表入力テストB');
    await click('登録内容を確認');
    assert.match(one('[aria-label="仕事の登録確認"]').textContent, /2件を未配車/);
    assert.match(one('[aria-label="仕事の登録確認"]').textContent, /0円（税抜）/);
    assert.equal(remote.value.jobPool.length, originalCount);
    await click('入力に戻る');
    assert.equal(jobCell(1, 'メモ').value, '集合場所のメモ');
    await click('登録内容を確認'); await click('この内容で登録する');
    assert.match(one('[aria-label="仕事登録画面"]').textContent, /2件の仕事を登録しました/);
    assert.equal(remote.value.jobPool.length, originalCount + 2);
    const [savedA, savedB] = remote.value.jobPool.slice(-2);
    assert.equal(savedA.amount, 0); assert.equal(savedA.vehicleId, 11); assert.equal(savedA.driverId, 1);
    assert.equal(savedA.preferClass, 'sedan'); assert.equal(savedB.preferClass, 'ジャンボハイヤー');
    assert.equal(savedB.amount, undefined); assert.equal(savedB.note, 'メモ1行目\nメモ2行目');
    assert.equal(savedB.end, '2026-11-15T01:00:00+09:00');
    assert.equal(JSON.stringify(remote.value.bookings), originalBookings);
    assert.equal(jobCell(1, '仕事名').value, '');
    assert.equal(store.hasUnsavedChanges(), false);
    const afterSave = new dom.window.Event('beforeunload', { cancelable: true });
    dom.window.dispatchEvent(afterSave); assert.equal(afterSave.defaultPrevented, false);
    await click('登録した仕事を確認');
    assert.match(document.body.textContent, /表入力テストA/);
    await reload();
    assert.equal(remote.value.jobPool.length, originalCount + 2);
    assert.match(document.body.textContent, /表入力テストB/);
  } finally { await unmount(); }
});

test('spreadsheet validation highlights the cells and an out-of-range paste leaves all input intact', async () => {
  await setup();
  try {
    const original = JSON.stringify(remote);
    await click('仕事登録');
    await fill(jobCell(1, '仕事名'), '入力不足テスト');
    await fill(jobCell(1, '取引先・お客様名'), '見本利用者');
    await click('登録内容を確認');
    assert.equal(jobCell(1, '開始').getAttribute('aria-invalid'), 'true');
    assert.equal(document.querySelector('[aria-label="仕事の登録確認"]'), null);
    assert.match(one('[aria-label="仕事登録画面"]').textContent, /1行に確認が必要/);
    await pasteCells(jobCell(1, 'メールアドレス'), '列超過\t上書き不可');
    assert.match(one('[aria-label="仕事登録画面"]').textContent, /列数が表の範囲を超え/);
    assert.equal(jobCell(1, '仕事名').value, '入力不足テスト');
    assert.equal(jobCell(1, 'メモ').value, '');
    await fill(jobCell(1, '開始'), '09:00'); await fill(jobCell(1, '終了'), '10:00');
    await fill(jobCell(1, '電話番号'), '090-0000-0000');
    const beforeRows = document.querySelectorAll('table[aria-label="仕事入力表"] tbody tr').length;
    await click('＋ 行を追加');
    assert.equal(document.querySelectorAll('table[aria-label="仕事入力表"] tbody tr').length, beforeRows + 1);
    await act(async () => jobCell(1, '仕事名').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    assert.equal(document.activeElement, jobCell(2, '仕事名'));
    assert.equal(JSON.stringify(remote), original);
  } finally { await unmount(); }
});

test('a failed spreadsheet save keeps the confirmation and retries the same job without a duplicate', async () => {
  await setup();
  try {
    const originalCount = remote.value.jobPool.length;
    await click('仕事登録');
    await pasteCells(jobCell(1, '仕事名'), ['再試行する仕事', '見本取引先', '法人', '2026/11/14', '18:00', '', '19:00'].join('\t'));
    await fill(jobCell(1, 'メールアドレス'), 'retry@example.com');
    await click('登録内容を確認');
    rejectWorkspaceWrites = true;
    await click('この内容で登録する');
    assert.match(one('[aria-label="仕事登録画面"]').textContent, /仕事を保存できませんでした/);
    assert.match(one('[aria-label="仕事の登録確認"]').textContent, /再試行する仕事/);
    assert.equal(remote.value.jobPool.length, originalCount);
    assert.equal(button('入力に戻る').disabled, true);
    rejectWorkspaceWrites = false;
    await click('保存を再試行');
    assert.match(one('[aria-label="仕事登録画面"]').textContent, /1件の仕事を登録しました/);
    assert.equal(remote.value.jobPool.length, originalCount + 1);
    assert.equal(remote.value.jobPool.filter(job => job.title === '再試行する仕事').length, 1);
    assert.equal(store.hasUnsavedChanges(), false);
  } finally { await unmount(); }
});

test('customer picker links the office and person, refreshes ledger defaults and keeps job-specific contact changes', async () => {
  await setup();
  try {
    await click('仕事登録');
    await pasteCells(jobCell(1, '仕事名'), ['台帳連動テスト', '', '法人', '2026/11/14', '18:00', '', '19:00'].join('\t'));
    await act(async () => one('[aria-label="1行目 台帳から選ぶ"]').click());
    const dialog = one('[role="dialog"][aria-labelledby="customer-picker-title"]');
    await fill(one('input[type="search"]', dialog), 'ryo.tanaka');
    assert.equal(dialog.querySelectorAll('[aria-label="取引先の候補"] button').length, 1);
    await act(async () => one('[aria-label="取引先の候補"] button', dialog).click());
    await fill(field('拠点', dialog), 'office-001');
    await fill(field('担当者', dialog), 'contact-002');
    await click('この窓口を選ぶ', dialog);
    assert.equal(jobCell(1, '取引先・お客様名').value, 'サンライズツアーズ');
    assert.equal(jobCell(1, '取引先・お客様名').readOnly, true);
    assert.equal(jobCell(1, '電話番号').value, '0476-22-2222');
    assert.equal(jobCell(1, '連絡担当者').value, '田中 亮');
    await fill(jobCell(1, '電話番号'), '090-0000-9999');
    await act(async () => {
      remote.value.contacts.find(item => item.id === 'contact-002').email = 'updated@example.com';
      await store.initializeStore(createSeed());
    });
    assert.equal(jobCell(1, 'メールアドレス').value, 'updated@example.com');
    assert.equal(jobCell(1, '電話番号').value, '090-0000-9999');
    await click('登録内容を確認');
    assert.match(one('[aria-label="仕事の登録確認"]').textContent, /成田空港営業所/);
    assert.match(one('[aria-label="仕事の登録確認"]').textContent, /090-0000-9999/);
    await click('この内容で登録する');
    const saved = remote.value.jobPool.find(job => job.title === '台帳連動テスト');
    assert.equal(saved.client.partnerId, 'partner-001'); assert.equal(saved.client.officeId, 'office-001'); assert.equal(saved.client.contactId, 'contact-002');
    assert.equal(saved.client.phone, '090-0000-9999'); assert.equal(saved.client.email, 'updated@example.com');
    assert.equal(remote.value.contacts.find(item => item.id === 'contact-002').phone, '0476-22-2222');
  } finally { await unmount(); }
});

test('new customer contact validation blocks missing or malformed channels, saves email-only contact and does not create a duplicate ledger record', async () => {
  await setup();
  try {
    const partnerCount = remote.value.partners.length, originalJobs = remote.value.jobPool.length;
    await click('仕事登録');
    await pasteCells(jobCell(1, '仕事名'), ['新規連絡先テスト', '初めてのお客様', '個人', '2026/11/14', '18:00', '', '19:00'].join('\t'));
    await click('登録内容を確認');
    assert.equal(jobCell(1, '電話番号').getAttribute('aria-invalid'), 'true');
    assert.equal(jobCell(1, 'メールアドレス').getAttribute('aria-invalid'), 'true');
    await fill(jobCell(1, 'メールアドレス'), 'invalid@'); await click('登録内容を確認');
    assert.equal(document.querySelector('[aria-label="仕事の登録確認"]'), null);
    assert.equal(remote.value.jobPool.length, originalJobs);
    await fill(jobCell(1, 'メールアドレス'), 'new@example.com');
    await fill(jobCell(1, '連絡担当者'), '見本のご担当者');
    await click('登録内容を確認'); await click('この内容で登録する');
    assert.equal(remote.value.partners.length, partnerCount);
    await reload();
    const saved = remote.value.jobPool.find(job => job.title === '新規連絡先テスト');
    assert.equal(saved.client.source, 'manual'); assert.equal(saved.client.email, 'new@example.com'); assert.equal(saved.client.contactName, '見本のご担当者');
    assert.equal(saved.client.partnerId, undefined);
  } finally { await unmount(); }
});

test('future extra job fields survive actual board assignment and return to the unassigned pool', async () => {
  const day = require('../client/src/lib/ledger.ts').todayInJapan();
  await setup({ configureWorkspace(value) {
    value.jobPool.push({ id: 'future-fields-job', title: '追加項目の配車テスト', client: { type: '法人', name: '見本取引先', source: 'ledger', partnerId: 'partner-001', officeId: 'office-001', contactId: 'contact-002', officeName: '成田空港営業所', contactName: '当日の窓口', phone: '090-0000-0000', email: 'job@example.com' },
      start: `${day}T18:00:00+09:00`, end: `${day}T19:00:00+09:00`, preferClass: 'sedan',
      vehicleId: null, driverId: 1, amount: 12000, note: '引き継ぎメモ', extraFields: { '便名': 'TEST123', '担当窓口': '見本窓口' } });
  } });
  try {
    const displayedDate = () => one('button[title="翌日へ"]').previousElementSibling.textContent.trim();
    assert.equal(displayedDate(), day);
    await act(async () => one('button[title="翌日へ"]').click());
    assert.equal(displayedDate(), new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10));
    await act(async () => one('button[title="前日へ"]').click());
    assert.equal(displayedDate(), day);
    await act(async () => {
      const event = new dom.window.Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', { value: { getData: type => type === 'text/x-job-id' ? 'future-fields-job' : '' } });
      one('[data-vehicle-id="11"]').dispatchEvent(event);
    });
    await save();
    const booking = remote.value.bookings.find(item => item.title === '追加項目の配車テスト');
    assert.ok(booking);
    assert.equal(booking.start, `${day}T18:00:00+09:00`);
    assert.equal(booking.end, `${day}T19:00:00+09:00`);
    assert.equal(booking.extraFields['便名'], 'TEST123');
    assert.equal(booking.amount, 12000); assert.equal(booking.note, '引き継ぎメモ');
    assert.equal(booking.client.contactId, 'contact-002'); assert.equal(booking.client.email, 'job@example.com');
    assert.equal(remote.value.jobPool.some(item => item.id === 'future-fields-job'), false);
    const bar = document.querySelector('[data-vehicle-id="11"] [title="追加項目の配車テスト"]');
    assert.ok(bar, 'Assigned booking bar exists');
    await act(async () => bar.click());
    assert.match(document.body.textContent, /担当窓口/);
    const details = one('[aria-label="お客様の連絡先"]');
    assert.match(details.textContent, /当日の窓口/);
    assert.equal(one('a[href="tel:09000000000"]', details).textContent, '090-0000-0000');
    assert.ok(details.querySelector('[aria-label="台帳の現在の連絡先"]'));
    await click('ジョブプールへ戻す'); await save();
    const returned = remote.value.jobPool.find(item => item.title === '追加項目の配車テスト');
    assert.equal(returned.extraFields['便名'], 'TEST123');
    assert.equal(returned.extraFields['担当窓口'], '見本窓口');
    assert.deepEqual(returned.client, booking.client);
  } finally { await unmount(); }
});

test('license summary cards filter matching drivers, combine with search, include archives only when requested, and clear without changing data', async () => {
  const { todayInJapan } = require('../client/src/lib/ledger.ts');
  const today = todayInJapan();
  const inDays = days => new Date(Date.parse(today + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  let active;
  let archived;
  await setup({ configureWorkspace(value) {
    value.drivers.forEach(driver => { delete driver.licenseExpiry; });
    active = value.drivers.filter(driver => driver.status === 'active');
    archived = value.drivers.filter(driver => driver.status === 'archived');
    [7, 45, 90, 0, -1, undefined, 60, 61].forEach((days, index) => {
      if (days !== undefined) active[index].licenseExpiry = inDays(days);
    });
    archived[0].licenseExpiry = inDays(3);
  } });
  try {
    const original = JSON.stringify(remote);
    await click('運転者台帳');
    const list = () => one('ul[aria-label="運転者リスト"]');
    const rows = () => [...list().querySelectorAll('li > button')];
    const card = period => one(`button[aria-label="免許期限${period}のドライバーを表示"]`);
    assert.match(card('60日以内').textContent, /4 名/);
    assert.match(card('1か月以内').textContent, /2 名/);
    assert.match(rows().find(row => row.textContent.includes(active[0].name)).textContent, /1か月以内・あと7日/);
    assert.match(rows().find(row => row.textContent.includes(active[4].name)).textContent, /期限切れ・1日超過/);
    await fill(one('input[type="search"]'), '該当しない検索語');
    assert.equal(rows().length, 0);
    await act(async () => card('60日以内').click());
    assert.equal(one('input[type="search"]').value, '');
    assert.equal(card('60日以内').getAttribute('aria-pressed'), 'true');
    assert.equal(rows().length, 4);
    assert.deepEqual(rows().map(row => row.querySelector('p').textContent), [active[0], active[1], active[3], active[6]].map(driver => driver.name));
    await act(async () => rows()[0].click());
    assert.match(one('[role="dialog"]').textContent, /1か月以内・あと7日/);
    await act(async () => one('button[aria-label="閉じる"]').click());
    await act(async () => card('1か月以内').click());
    assert.equal(rows().length, 2);
    assert.match(list().textContent, /本日期限/);
    assert.equal(card('60日以内').getAttribute('aria-pressed'), 'false');
    await fill(one('input[type="search"]'), active[0].code);
    assert.equal(rows().length, 1);
    await fill(one('input[type="search"]'), '');
    await act(async () => field('アーカイブも表示').click());
    assert.equal(rows().length, 3);
    assert.match(card('60日以内').textContent, /5 名/);
    assert.match(card('1か月以内').textContent, /3 名/);
    await fill(one('input[type="search"]'), active[0].code);
    await click('絞り込みを解除');
    assert.equal(rows().length, remote.value.drivers.length);
    assert.equal(one('input[type="search"]').value, '');
    assert.equal(field('アーカイブも表示').checked, true);
    assert.equal(card('1か月以内').getAttribute('aria-pressed'), 'false');
    assert.equal(store.hasUnsavedChanges(), false);
    assert.equal(JSON.stringify(remote), original);
  } finally { await unmount(); }
});

test('empty license filters can be cleared or toggled off and recover the list without a render loop', async () => {
  await setup({ configureWorkspace(value) { value.drivers.forEach(driver => { delete driver.licenseExpiry; }); } });
  try {
    await click('運転者台帳');
    const card = period => one(`button[aria-label="免許期限${period}のドライバーを表示"]`);
    const count = () => document.querySelectorAll('ul[aria-label="運転者リスト"] li > button').length;
    const expected = remote.value.drivers.filter(driver => driver.status === 'active').length;
    await act(async () => card('1か月以内').click());
    assert.equal(count(), 0);
    assert.match(document.body.textContent, /該当するドライバーが見つかりません/);
    assert.match(document.body.textContent, /0名を表示/);
    await click('絞り込みを解除');
    assert.equal(count(), expected);
    await act(async () => card('60日以内').click());
    assert.equal(count(), 0);
    await act(async () => card('60日以内').click());
    assert.equal(count(), expected);
    await fill(one('input[type="search"]'), '該当しない検索語');
    assert.equal(count(), 0);
    await click('絞り込みを解除');
    assert.equal(count(), expected);
    assert.equal(store.hasUnsavedChanges(), false);
  } finally { await unmount(); }
});

test('driver photo, diagnosis edits, and next date persist through remount and do not leak to other drivers', async () => {
  await setup();
  try {
    await click('運転者台帳'); await click(/田中 太郎/);
    await choosePhoto();
    assert.equal(uploadedPhotos, 0);
    await click('確認へ進む');
    assert.match(document.body.textContent, /この写真を登録しますか？/);
    await click('保存する');
    assert.match(one('img[alt="田中 太郎の顔写真"]').getAttribute('src'), /inline=1$/);
    assert.equal(one('img[alt="田中 太郎の顔写真（一覧）"]').getAttribute('src'), one('img[alt="田中 太郎の顔写真"]').getAttribute('src'));
    await fill(field('受診日'), '2026-01-10');
    await fill(field('次回予定日'), '2027-01-10');
    await fill(field('受診機関'), 'テスト診断センター');
    await fill(field('結果・所見・対応メモ'), '診断結果の記録');
    await submit(field('受診日').closest('form')); await save();
    assert.equal(remote.value.drivers[0].aptitudeRecords.length, 1);
    await reload(); await click('運転者台帳'); await click(/田中 太郎/);
    assert.ok(one('img[alt="田中 太郎の顔写真"]'));
    assert.match(document.body.textContent, /次回適性診断：2027-01-10/);
    await click('編集'); await fill(field('次回予定日'), '2027-02-10');
    await submit(field('受診日').closest('form')); await save();
    assert.equal(remote.value.drivers[0].aptitudeRecords.length, 1);
    assert.equal(remote.value.drivers[0].aptitudeRecords[0].nextDueAt, '2027-02-10');
    await act(async () => one('button[aria-label="閉じる"]').click());
    await click(/佐藤 花子/);
    assert.match(document.body.textContent, /写真未登録/);
    assert.match(document.body.textContent, /受診記録はまだありません/);
  } finally { await unmount(); }
});

test('photo replacements require confirmation, retain the old photo on return/cancel, and update only the selected driver', async () => {
  await setup({ existingPhoto: true });
  try {
    const original = structuredClone(remote.value.drivers[0].facePhoto);
    await click('運転者台帳');
    assert.equal(one('img[alt="田中 太郎の顔写真（一覧）"]').getAttribute('src'), original.uri);
    assert.ok(one('svg[aria-label="佐藤 花子の顔写真未登録"]'));
    await click(/田中 太郎/);
    await choosePhoto(); await click('確認へ進む');
    assert.match(document.body.textContent, /この変更を保存しますか？/);
    assert.equal(one('img[alt="変更前の顔写真"]').getAttribute('src'), original.uri);
    assert.equal(uploadedPhotos, 0);
    await click('戻る');
    assert.ok(one('img[alt="選択した顔写真のプレビュー"]'));
    await click('キャンセル');
    assert.equal(document.querySelector('img[alt="選択した顔写真のプレビュー"]'), null);
    assert.deepEqual(remote.value.drivers[0].facePhoto, original);
    assert.equal(uploadedPhotos, 0);
    assert.equal(store.hasUnsavedChanges(), false);
    await choosePhoto(); await click('確認へ進む'); await click('保存する'); await save();
    assert.equal(uploadedPhotos, 1);
    assert.notEqual(remote.value.drivers[0].facePhoto.uri, original.uri);
    assert.equal(remote.value.drivers[1].facePhoto, undefined);
    await reload(); await click('運転者台帳');
    assert.equal(one('img[alt="田中 太郎の顔写真（一覧）"]').getAttribute('src'), remote.value.drivers[0].facePhoto.uri);
    await click(/田中 太郎/); await choosePhoto();
    await act(async () => one('button[aria-label="閉じる"]').click());
    await click(/佐藤 花子/);
    assert.equal(document.querySelector('img[alt="選択した顔写真のプレビュー"]'), null);
    assert.equal(uploadedPhotos, 1);
  } finally { await unmount(); }
});

test('invalid photos never upload and a failed replacement keeps the current photo and permits retry', async () => {
  await setup({ existingPhoto: true });
  try {
    const original = structuredClone(remote.value.drivers[0].facePhoto);
    await click('運転者台帳'); await click(/田中 太郎/);
    await choosePhoto('text/plain');
    assert.match(one('[role="alert"]').textContent, /5MB以内/);
    assert.equal(uploadedPhotos, 0);
    await choosePhoto(); await click('確認へ進む');
    rejectPhotoUpload = true;
    await click('保存する');
    assert.match(one('[role="alert"]').textContent, /保存できませんでした/);
    assert.equal(one('img[alt="田中 太郎の顔写真"]').getAttribute('src'), original.uri);
    assert.equal(one('img[alt="田中 太郎の顔写真（一覧）"]').getAttribute('src'), original.uri);
    assert.deepEqual(remote.value.drivers[0].facePhoto, original);
    assert.equal(store.hasUnsavedChanges(), false);
    rejectPhotoUpload = false;
    await click('保存する'); await save();
    assert.equal(uploadedPhotos, 2);
    assert.notEqual(remote.value.drivers[0].facePhoto.uri, original.uri);
  } finally { await unmount(); }
});

test('vehicle class is free text on both existing and new vehicles and reaches dispatch after reload', async () => {
  await setup();
  try {
    await click('車両台帳');
    await act(async () => [...document.querySelectorAll('tbody tr')].find(row => row.textContent.includes('セダンA')).click());
    await fill(field('車両区分'), 'ジャンボハイヤー（9人乗り）');
    await submit(field('車両区分').closest('form')); await save(); await click('閉じる');
    await click(/車両を追加/);
    await fill(field('車両名'), 'テスト車両'); await fill(field('管理ID'), 'TEST-001');
    await fill(field('車両区分'), '特別仕様車'); await fill(field('乗車定員'), '6');
    await fill(field('ナンバー'), '品川300 あ 168');
    await submit(field('車両名').closest('form')); await save(); await reload();
    await click('車両台帳');
    assert.match(document.body.textContent, /ジャンボハイヤー（9人乗り）/);
    assert.match(document.body.textContent, /特別仕様車/);
    assert.equal(remote.value.vehicles.find(v => v.vehiclesId === 'TEST-001').plateNo, '品川300 あ 168');
    await click('配車ボード'); assert.match(document.body.textContent, /テスト車両/);
  } finally { await unmount(); }
});

test('partner tariffs retain distinct money units, support edits, and stay isolated by partner', async () => {
  await setup();
  try {
    await click('取引先'); await click('タリフを追加');
    await fill(field('タリフ名（必須）'), '空港送迎・冬季');
    await fill(field('基本料金（円・空欄は都度見積）'), '35000');
    await fill(one('select', field('基本料金の税区分').closest('label')), 'included');
    const [discount, kickback] = document.querySelectorAll('fieldset');
    await fill(one('select', discount), 'yen'); await fill(one('input', discount), '1500');
    await fill(one('select', kickback), 'percent'); await fill(one('input', kickback), '12.34');
    await fill(field('条件・計算基準の補足'), '高速代は対象外');
    await submit(one('form[aria-label="新規タリフ"]')); await save(); await reload(); await click('取引先');
    assert.match(document.body.textContent, /35,000円/); assert.match(document.body.textContent, /1,500円/); assert.match(document.body.textContent, /12.34%/);
    await click('編集'); await fill(field('基本料金（円・空欄は都度見積）'), '36000');
    await submit(one('form[aria-label="タリフを編集"]')); await save();
    assert.equal(remote.value.partners[0].tariffs.length, 1); assert.equal(remote.value.partners[0].tariffs[0].baseFare, 36000);
    await click(/グローブリンク/); assert.match(document.body.textContent, /タリフはまだ登録されていません/);
  } finally { await unmount(); }
});

const testManager = { id: 'test-manager', code: 'TEST-001', name: 'テスト運行管理者', role: 'manager', officeName: '東京営業所', active: true, appointmentDate: '2020-01-01', qualification: 'テスト用' };

test('passenger daily inspection saves explicit results, review and correction with immutable originals', async () => {
  await setup({ configureWorkspace: value => { value.staffMembers = [{ ...testManager, maintenanceManager: true, maintenanceAppointmentDate: '2020-01-01' }]; } });
  try {
    await click('日常点検');
    await fill(field('点検する車両'), '11');
    assert.equal(button('日常点検を記録').disabled, true);
    await click('車両の点検方法を設定');
    let form = one('form[aria-label="車両の点検方法"]');
    await fill(field('確認する整備管理者', form), 'test-manager');
    await fill(field('確認した資料・版・該当ページ', form), '確認用取扱説明書 2026版');
    await fill(field('車両固有の点検方法（駐車ブレーキ・原動機等）', form), '確認用車両の手順');
    await submit(form);
    assert.equal(remote.value.inspectionProfiles.length, 1);
    await click('日常点検を記録'); form = one('form[aria-label="日常点検の記録"]');
    assert.equal(form.querySelectorAll('input[type="radio"]').length, 34);
    assert.equal(form.querySelectorAll('input[type="radio"]:checked').length, 0);
    assert.doesNotMatch(form.textContent, /エアブレーキ|エアタンク|排気ブレーキ/);
    await fill(field('点検実施者', form), '1');
    await fill(field('点検日時', form), '2026-11-14T06:00');
    await fill(field('走行距離（km）', form), '123');
    await fill(field('前回異常の確認内容（報告がなければ「前回報告なし」）', form), '前回報告なし');
    await submit(form);
    assert.match(form.textContent, /すべての点検結果/);
    for (const radio of form.querySelectorAll('input[type="radio"][value="ok"]')) await act(async () => radio.click());
    await submit(form);
    assert.equal(remote.value.dailyInspections.length, 1);
    const original = structuredClone(remote.value.dailyInspections[0]);
    assert.match(document.body.textContent, /整備管理者の確認待ち/);
    await click('整備管理者の確認'); form = one('form[aria-label="整備管理者の確認"]');
    await fill(field('確認する整備管理者', form), 'test-manager');
    await act(async () => one('input[type="radio"]', form).click());
    await fill(field('確認内容・判断理由', form), '結果を確認して運行可');
    await submit(form);
    assert.equal(remote.value.inspectionReviews.length, 1);
    await click('理由を付けて訂正・再点検'); form = one('form[aria-label="日常点検の記録"]');
    await fill(field('走行距離（km）', form), '124');
    await fill(field('訂正・再点検の理由', form), '距離の訂正');
    await submit(form);
    assert.equal(remote.value.dailyInspections.length, 2);
    assert.deepEqual(remote.value.dailyInspections[0], original);
    assert.equal(remote.value.dailyInspections[1].supersedes, original.id);
    assert.match(document.body.textContent, /整備管理者の確認待ち/);
    await reload(); await click('日常点検');
    assert.match(document.body.textContent, /124 km/);
    await click('詳細・履歴');
    assert.match(one('[aria-label="日常点検の履歴"]').textContent, /距離の訂正/);
  } finally { await unmount(); }
});

test('daily inspection failed saves retain exact record for a single retry', async () => {
  await setup({ configureWorkspace: value => {
    value.staffMembers = [{ ...testManager, maintenanceManager: true, maintenanceAppointmentDate: '2020-01-01' }];
    value.inspectionProfiles = [{ id: 'profile-retry', vehicleId: 11, vehicleLabel: `${value.vehicles[0].name} / ${value.vehicles[0].plateNo}`, at: '2026-11-13T00:00:00Z', staffId: testManager.id, staffName: testManager.name, basis: '確認用資料', methods: '確認用手順', excluded: {} }];
  } });
  try {
    await click('日常点検'); await fill(field('点検する車両'), '11'); await click('日常点検を記録');
    const form = one('form[aria-label="日常点検の記録"]');
    await fill(field('点検実施者', form), '1'); await fill(field('点検日時', form), '2026-11-14T06:00'); await fill(field('走行距離（km）', form), '100');
    await fill(field('前回異常の確認内容（報告がなければ「前回報告なし」）', form), '前回報告なし');
    for (const radio of form.querySelectorAll('input[type="radio"][value="ok"]')) await act(async () => radio.click());
    rejectWorkspaceWrites = true; await submit(form);
    const attempted = lastWorkspaceAttempt.value.dailyInspections[0];
    assert.equal(field('走行距離（km）', form).value, '100');
    rejectWorkspaceWrites = false; await submit(form);
    assert.equal(remote.value.dailyInspections.length, 1);
    assert.deepEqual(remote.value.dailyInspections[0], attempted);
  } finally { await unmount(); }
});
async function chooseCheck(form, legend, value) {
  const group = [...form.querySelectorAll('fieldset')].find(element => element.querySelector(':scope > legend')?.textContent === legend);
  assert.ok(group, `Missing radio group ${legend}`);
  await act(async () => one(`input[type="radio"][value="${value}"]`, group).click());
}

// Attendance and roll calls share a duty ID, but never fabricate each other's times.
test('duty ledger saves overnight attendance, linked rollcalls, corrections and survives reload', async () => {
  await setup({ configureWorkspace: value => { value.staffMembers = [testManager]; } }); await click('点呼・出勤簿'); await click('出勤を記録');
  let form = one('form[aria-label="出退勤の記録"]');
  await fill(field('運転者', form), '1'); await fill(field('記録担当者', form), 'test-manager');
  await fill(field('出勤日時（日本時間）', form), '2026-11-12T22:00'); await fill(field('退勤日時（未退勤は空欄）', form), '2026-11-13T06:00');
  await submit(form); assert.equal(remote.value.dutyLogs.length, 1);
  const original = structuredClone(remote.value.dutyLogs[0]); assert.equal(original.clockIn, '2026-11-12T22:00:00+09:00'); assert.equal(original.before, undefined);
  await click('乗務前を記録'); form = one('form[aria-label="乗務前点呼の記録"]');
  await fill(field('点呼執行者（運行管理者・補助者）', form), 'test-manager'); await fill(field('点呼場所', form), '東京営業所');
  await fill(field('点呼日時（日本時間）', form), '2026-11-12T22:10'); await fill(field('車両', form), '11');
  await fill(field('点呼方法', form), 'face');
  assert.equal(one('input[inputmode="decimal"]', form).type, 'text');
  assert.equal(form.querySelectorAll('input[type="radio"]:checked').length, 0);
  for (const [label, value] of [['酒気帯びの有無', 'none'], ['アルコール検知器', 'yes'], ['疾病等の状況', 'good'], ['疲労', 'none'], ['睡眠不足', 'enough'], ['日常点検', 'ok'], ['目視・応答等の確認', 'yes'], ['検知器の状態', 'ok']]) await chooseCheck(form, label, value);
  await chooseCheck(form, '酒気帯びの有無', 'detected');
  await chooseCheck(form, '酒気帯びの有無', 'none');
  await fill(field('測定値（mg/L・任意）', form), '0.000');
  await fill(field('指示事項', form), '安全確認'); await fill(field('今回の追記・訂正・取消の理由', form), '乗務前点呼を追記');
  await submit(form); assert.equal(remote.value.dutyLogs.length, 2); assert.deepEqual(remote.value.dutyLogs[0], original);
  assert.equal(remote.value.dutyLogs[1].dutyId, original.dutyId); assert.equal(remote.value.dutyLogs[1].clockIn, original.clockIn);
  assert.equal(remote.value.dutyLogs[1].before.alcoholValue, 0);
  await reload(); await click('点呼・出勤簿'); await fill(field('勤務日（出勤日）'), '2026-11-12');
  await click('詳細・履歴'); assert.match(one('[aria-label="勤務の詳細・訂正履歴"]').textContent, /テスト運行管理者/);
  await click('閉じる', one('[aria-label="勤務の詳細・訂正履歴"]'));
  await click('出退勤・訂正'); form = one('form[aria-label="出退勤の記録"]');
  await fill(field('記録担当者', form), 'test-manager'); await fill(field('退勤日時（未退勤は空欄）', form), '2026-11-13T06:15');
  await fill(field('今回の追記・訂正・取消の理由', form), '退勤時刻の訂正'); await submit(form);
  assert.equal(remote.value.dutyLogs.length, 3); assert.deepEqual(remote.value.dutyLogs[0], original);
  assert.equal(remote.value.dutyLogs[2].before.executor, 'テスト運行管理者'); assert.equal(remote.value.dutyLogs[2].clockOut, '2026-11-13T06:15:00+09:00');
  await unmount();
});

test('failed attendance saves keep inputs and retry the same record without duplication', async () => {
  await setup({ configureWorkspace: value => { value.staffMembers = [testManager]; } }); await click('点呼・出勤簿'); await click('出勤を記録');
  const form = one('form[aria-label="出退勤の記録"]');
  await fill(field('運転者', form), '1'); await fill(field('記録担当者', form), 'test-manager');
  await fill(field('出勤日時（日本時間）', form), '2026-11-12T22:00');
  rejectWorkspaceWrites = true; await submit(form);
  assert.equal(remote.value.dutyLogs, undefined); assert.match(form.textContent, /再試行/);
  assert.equal(field('記録担当者', form).value, 'test-manager');
  const pendingId = lastWorkspaceAttempt.value.dutyLogs[0].id;
  rejectWorkspaceWrites = false; await submit(form);
  assert.equal(remote.value.dutyLogs.length, 1); assert.equal(remote.value.dutyLogs[0].id, pendingId);
  await unmount();
});

test('staff ledger registers managers, persists edits, and keeps office staff out of executor selection', async () => {
  await setup(); await click('職員台帳'); await click('職員を登録');
  let form = one('form[aria-label="職員の登録・編集"]');
  await fill(field('職員コード', form), 'M-1'); await fill(field('職員氏名', form), '登録テスト管理者');
  await fill(field('所属営業所', form), 'テスト営業所'); await fill(field('職員の役割', form), 'manager');
  await fill(field('選任日', form), '2020-01-01'); await submit(form);
  assert.equal(remote.value.staffMembers.length, 1); assert.equal(remote.value.staffMembers[0].role, 'manager');
  await reload(); await click('職員台帳'); assert.match(document.body.textContent, /登録テスト管理者/);
  await click('職員情報を編集'); form = one('form[aria-label="職員の登録・編集"]');
  await fill(field('職員氏名', form), '改名後の管理者'); await submit(form);
  assert.equal(remote.value.staffMembers[0].name, '改名後の管理者');
  await click('職員を登録'); form = one('form[aria-label="職員の登録・編集"]');
  await fill(field('職員コード', form), 'C-1'); await fill(field('職員氏名', form), 'テスト事務員'); await fill(field('所属営業所', form), 'テスト営業所'); await submit(form);
  await click('点呼・出勤簿'); await click('出勤を記録'); form = one('form[aria-label="出退勤の記録"]');
  assert.equal(field('記録担当者', form).options.length, 3);
  await click('閉じる', form); await unmount();
});
