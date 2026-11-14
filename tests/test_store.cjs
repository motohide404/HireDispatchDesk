const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../client/node_modules/typescript');

function setup(initial) {
  const remote = { revision: initial ? 1 : 0, value: initial || null, writes: 0 };
  const context = { exports: {}, document: { hidden: true }, window: { addEventListener() {} },
    require: () => ({ useCallback: fn => fn, useSyncExternalStore: (_, snapshot) => snapshot() }),
    alert() {}, setInterval() {}, setTimeout() {}, clearTimeout() {},
    fetch: async (_, options = {}) => {
      if (!options.method) return { ok: true, json: async () => structuredClone(remote) };
      const body = JSON.parse(options.body);
      if (body.revision !== remote.revision) return { ok: false, status: 409 };
      remote.value = structuredClone(body.value); remote.revision++; remote.writes++;
      return { ok: true, json: async () => ({ revision: remote.revision }) };
    }
  };
  const source = ts.transpileModule(fs.readFileSync('client/src/lib/store.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, context);
  return { store: context.exports, remote, context };
}

test('first login initializes the remote workspace and reload reads it', async () => {
  const { store, remote } = setup();
  await store.initializeStore({ drivers: [{ id: 1 }], bookings: [] });
  assert.equal(remote.revision, 1);
  assert.equal(store.usePersistentState('drivers', [])[0][0].id, 1);
  assert.equal(store.hasUnsavedChanges(), false);
});

test('rapid job-to-booking edits are committed together and survive remount', async () => {
  const { store, remote } = setup({ drivers: [], bookings: [], jobPool: [{ id: 'job1', amount: 12000 }] });
  await store.initializeStore({});
  const [, setBookings] = store.usePersistentState('bookings', []);
  const [, setJobs] = store.usePersistentState('jobPool', []);
  setBookings(previous => [...previous, { id: 10, amount: 12000 }]);
  setJobs([]);
  assert.equal(store.hasUnsavedChanges(), true);
  await store.flush();
  assert.equal(remote.writes, 1);
  assert.equal(remote.value.bookings[0].amount, 12000);
  assert.equal(remote.value.jobPool.length, 0);
  assert.equal(store.usePersistentState('bookings', [])[0][0].id, 10);
  assert.equal(store.useSaveStatus(), '保存済み');
});

test('a stale second editor cannot silently overwrite another save', async () => {
  const { store, remote } = setup({ bookings: [] });
  await store.initializeStore({});
  store.usePersistentState('bookings', [])[1]([{ id: 1 }]);
  remote.value = { bookings: [{ id: 99 }] }; remote.revision++;
  await store.flush();
  assert.equal(remote.value.bookings[0].id, 99);
  assert.equal(store.hasUnsavedChanges(), true);
  assert.match(store.useSaveStatus(), /別の画面で更新/);
  assert.equal(store.usePersistentState('bookings', [])[0][0].id, 1);
});

test('explicit collection registration waits for acknowledgement and repeated stable IDs do not duplicate records', async () => {
  const { store, remote, context } = setup({ jobPool: [], drivers: [{ id: 1 }] });
  await store.initializeStore({});
  const originalFetch = context.fetch;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  context.fetch = async (path, options = {}) => { if (options.method === 'PUT') await gate; return originalFetch(path, options); };
  let acknowledged = false;
  const jobs = [{ id: 'sheet-1', title: 'テスト仕事' }];
  const saving = store.appendCollectionAndSave('jobPool', jobs).then(() => { acknowledged = true; });
  await Promise.resolve();
  assert.equal(acknowledged, false); assert.equal(remote.writes, 0);
  release(); await saving;
  assert.equal(acknowledged, true); assert.equal(remote.value.jobPool.length, 1);
  await store.appendCollectionAndSave('jobPool', jobs);
  assert.equal(remote.value.jobPool.length, 1); assert.equal(remote.writes, 1);
});

test('failed registration retains pending jobs, retries them without duplication, and refuses changed data for the same ID', async () => {
  const { store, remote, context } = setup({ jobPool: [], drivers: [{ id: 1 }] });
  await store.initializeStore({});
  const originalFetch = context.fetch;
  context.fetch = async (path, options = {}) => options.method === 'PUT' ? { ok: false, status: 503, json: async () => ({ error: '接続テスト' }) } : originalFetch(path, options);
  const jobs = [{ id: 'sheet-2', title: '再試行テスト' }];
  await assert.rejects(store.appendCollectionAndSave('jobPool', jobs), /接続テスト/);
  assert.equal(remote.value.jobPool.length, 0); assert.equal(store.hasUnsavedChanges(), true);
  assert.equal(store.usePersistentState('jobPool', [])[0].length, 1);
  await assert.rejects(store.appendCollectionAndSave('jobPool', [{ ...jobs[0], title: '別内容' }]), /内容が変わって/);
  context.fetch = originalFetch;
  await store.appendCollectionAndSave('jobPool', jobs);
  assert.equal(remote.value.jobPool.length, 1); assert.equal(store.hasUnsavedChanges(), false);
});

test('a lost save response is reconciled by reading the exact saved batch without a second write', async () => {
  const { store, remote, context } = setup({ jobPool: [], drivers: [] });
  await store.initializeStore({});
  const originalFetch = context.fetch;
  context.fetch = async (path, options = {}) => {
    const result = await originalFetch(path, options);
    if (options.method === 'PUT') throw new Error('response lost');
    return result;
  };
  const jobs = [{ id: 'sheet-3', title: '応答消失テスト', client: { name: '見本', type: '個人' } }];
  await store.appendCollectionAndSave('jobPool', jobs);
  assert.equal(remote.writes, 1); assert.equal(remote.value.jobPool.length, 1);
  assert.equal(store.hasUnsavedChanges(), false);
  await store.appendCollectionAndSave('jobPool', jobs);
  assert.equal(remote.writes, 1);
});

test('a conflicting batch never overwrites another editor and keeps local work available', async () => {
  const { store, remote } = setup({ jobPool: [], drivers: [] });
  await store.initializeStore({});
  remote.value = { jobPool: [{ id: 'other-editor', title: '別画面の仕事' }], drivers: [] }; remote.revision++;
  await assert.rejects(store.appendCollectionAndSave('jobPool', [{ id: 'sheet-4', title: '入力した仕事' }]), /別の画面で更新/);
  assert.equal(remote.value.jobPool[0].id, 'other-editor');
  assert.equal(store.usePersistentState('jobPool', [])[0][0].id, 'sheet-4');
  assert.equal(store.hasUnsavedChanges(), true);
});

test('staff registration initializes legacy workspaces and edits preserve record snapshots', async () => {
  const { store, remote } = setup({ drivers: [], dutyLogs: [{ id: 'old', recorder: '旧氏名' }] });
  await store.initializeStore({});
  const member = { id: 'staff', name: '登録氏名', code: 'M1', active: true };
  await store.saveStaffMember(member); assert.equal(remote.value.staffMembers.length, 1);
  await store.saveStaffMember({ ...member, name: '改名後' }, member);
  assert.equal(remote.value.staffMembers[0].name, '改名後'); assert.equal(remote.value.dutyLogs[0].recorder, '旧氏名');
  await assert.rejects(store.saveStaffMember({ ...member, name: '古い画面の編集' }, member), /最新/);
});

test('staff save retry reconciles a lost response and does not create a duplicate member', async () => {
  const { store, remote, context } = setup({ drivers: [] }); await store.initializeStore({});
  const originalFetch = context.fetch;
  context.fetch = async (path, options = {}) => { const response = await originalFetch(path, options); if (options.method === 'PUT') throw new Error('response lost'); return response; };
  const member = { id: 'staff', name: 'テスト', code: 'M1', active: true };
  await store.saveStaffMember(member); assert.equal(remote.value.staffMembers.length, 1); assert.equal(remote.writes, 1);
  assert.equal(store.hasUnsavedChanges(), false);
});
