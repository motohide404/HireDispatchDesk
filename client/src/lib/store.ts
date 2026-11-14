import { useCallback, useSyncExternalStore, type SetStateAction } from 'react';

type Workspace = Record<string, unknown>;
let data: Workspace = {};
let revision = 0;
let dirty = false;
let saving = false;
let blocked = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let message = '保存済み';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  if (!response.ok) {
    if (response.status === 409) throw new Error('別の画面で更新されました。未保存の内容を控えて再読み込みしてください。');
    if (response.status === 401) throw new Error('ログインの有効期限が切れました。未保存の内容を控えて再ログインしてください。');
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || '通信できません。接続を確認して保存を再試行してください。');
  }
  return response.json();
}

export async function initializeStore(seed: Workspace) {
  let result = await request('/api/workspace');
  if (!result.value) {
    try {
      result = await request('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 0, value: seed }) });
    } catch { /* Another tab may have initialized it first. */ }
    result = await request('/api/workspace');
  }
  if (!result.value) throw new Error('テストデータの準備に失敗しました。再試行してください。');
  data = result.value; revision = result.revision; dirty = false; blocked = false; message = '保存済み'; notify();
}

export async function flush() {
  if (saving || blocked || !dirty) return;
  saving = true; dirty = false; message = '保存中…'; notify();
  const snapshot = data;
  try {
    const result = await request('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, value: snapshot }) });
    revision = result.revision;
    message = dirty ? '保存待ち…' : '保存済み';
  } catch (error) {
    dirty = true; blocked = true;
    message = error instanceof Error ? error.message : '保存に失敗しました';
  } finally {
    saving = false; notify();
    if (dirty && !blocked) void flush();
  }
}

export function retrySave() { blocked = false; void flush(); }
export function hasUnsavedChanges() { return dirty || saving || blocked; }
export function useSaveStatus() { return useSyncExternalStore(subscribe, () => message); }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

function saveAndWait(): Promise<void> {
  return new Promise((resolve, reject) => {
    function check() {
      if (blocked) { listeners.delete(check); reject(new Error(message)); }
      else if (!dirty && !saving) { listeners.delete(check); resolve(); }
    }
    listeners.add(check);
    clearTimeout(timer);
    void flush();
    check();
  });
}

// Explicit batch registration waits for acknowledgement. Stable IDs make a
// retry after a failed response safe; unrelated stale work is never discarded.
export async function appendCollectionAndSave<T extends { id: string | number }>(key: string, items: T[]): Promise<void> {
  if (!items.length) return;
  const current = ['dutyLogs', 'staffMembers'].includes(key) ? data[key] ?? [] : data[key];
  if (!Array.isArray(current)) throw new Error('登録先のデータを読み込めません。再読み込みしてください。');
  const ids = items.map(item => String(item.id));
  if (new Set(ids).size !== ids.length) throw new Error('同じ登録IDが重複しています。');
  const additions = items.filter(item => {
    const existing = current.find(row => String(row.id) === String(item.id));
    if (existing && canonical(existing) !== canonical(item)) throw new Error('保存待ちの仕事と内容が変わっています。保存状態を確認してください。');
    return !existing;
  });
  if (blocked && additions.length) throw new Error(message);
  if (current.length + additions.length > 10000) throw new Error('登録件数の上限に達しています。');
  if (additions.length) {
    data = { ...data, [key]: [...current, ...additions] };
    dirty = true; message = '保存待ち…'; notify();
  }
  blocked = false;
  try {
    await saveAndWait();
  } catch (error) {
    // A server may have committed before its response was lost. Confirm these
    // exact IDs and values without overwriting another editor's workspace.
    try {
      const remote = await request('/api/workspace');
      const collection = remote.value?.[key];
      if (Array.isArray(collection) && items.every(item => collection.some(row => String(row.id) === String(item.id) && canonical(row) === canonical(item)))) {
        if (canonical(remote.value) === canonical(data)) {
          data = remote.value; revision = remote.revision; dirty = false; blocked = false; message = '保存済み'; notify();
        }
        return;
      }
    } catch { /* Keep the original save error and all local work. */ }
    throw error;
  }
}

// Staff metadata may change; duty records retain their original name/role snapshots.
export async function saveStaffMember<T extends { id: string }>(item: T, original?: T): Promise<void> {
  const current = data.staffMembers ?? [];
  if (!Array.isArray(current)) throw new Error('職員台帳を読み込めません。');
  const found = current.find(row => row.id === item.id);
  const same = found && canonical(found) === canonical(item);
  if (!same) {
    if (blocked) throw new Error(message);
    if ((original && canonical(found) !== canonical(original)) || (!original && found)) throw new Error('職員情報が更新されています。最新の情報を開き直してください。');
    if (!found && current.length >= 10000) throw new Error('職員登録の上限に達しています。');
    data = { ...data, staffMembers: found ? current.map(row => row.id === item.id ? item : row) : [...current, item] };
    dirty = true; message = '保存待ち…'; notify();
  }
  blocked = false;
  try { await saveAndWait(); }
  catch (error) {
    try {
      const remote = await request('/api/workspace');
      if (remote.value?.staffMembers?.some((row: T) => row.id === item.id && canonical(row) === canonical(item))) {
        if (canonical(remote.value) === canonical(data)) { data = remote.value; revision = remote.revision; dirty = false; blocked = false; message = '保存済み'; notify(); }
        return;
      }
    } catch { /* Preserve the original save failure and input. */ }
    throw error;
  }
}

export function usePersistentState<T>(key: string, fallback: T): [T, (action: SetStateAction<T>) => void] {
  const value = useSyncExternalStore(subscribe, () => (data[key] ?? fallback) as T);
  const setValue = useCallback((action: SetStateAction<T>) => {
    if (blocked) { alert(message); return; }
    const old = data[key] as T;
    const next = typeof action === 'function' ? (action as (previous: T) => T)(old) : action;
    if (Object.is(next, old)) return;
    data = { ...data, [key]: next }; dirty = true; message = '保存待ち…'; notify();
    clearTimeout(timer); timer = setTimeout(() => void flush(), 350);
  }, [key]);
  return [value, setValue];
}

// Refresh only when this tab has no unsaved changes. A revision mismatch never overwrites local work.
setInterval(async () => {
  if (hasUnsavedChanges() || document.hidden || !revision) return;
  const atStart = revision;
  try {
    const result = await request('/api/workspace');
    if (!hasUnsavedChanges() && revision === atStart && result.revision !== revision) {
      data = result.value; revision = result.revision; notify();
    }
  } catch { /* Save failures are shown when the user makes a change. */ }
}, 5000);
window.addEventListener('beforeunload', event => { if (hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; } });
