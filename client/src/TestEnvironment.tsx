import { useEffect, useState, type FormEvent } from 'react';
import App from './App';
import { createSeed } from './data/seed';
import { hasUnsavedChanges, initializeStore, retrySave, useSaveStatus } from './lib/store';

export default function TestEnvironment() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const status = useSaveStatus();
  async function load() { await initializeStore(createSeed()); setReady(true); }
  useEffect(() => { load().catch(() => {}).finally(() => setBusy(false)); }, []);
  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      if (!response.ok) throw new Error('ログインできません。パスワードを確認してください。');
      setPassword(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '接続できません'); }
    finally { setBusy(false); }
  }
  async function logout() {
    if (hasUnsavedChanges()) { alert('保存が完了してからログアウトしてください。'); return; }
    await fetch('/api/logout', { method: 'POST' }); location.reload();
  }
  if (!ready) return <main className="min-h-screen flex items-center justify-center bg-slate-100 p-6"><form onSubmit={login} className="w-full max-w-md rounded-2xl bg-white shadow p-8 space-y-5"><p className="text-sm font-bold text-amber-700">社内テスト環境</p><h1 className="text-2xl font-bold">ハイヤーディスパッチデスク</h1><p className="text-sm text-slate-600">動作確認用です。実際のお客様の個人情報は入力しないでください。</p><label className="block">テスト用パスワード<input className="mt-2 w-full border rounded-lg p-3" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></label>{error && <p role="alert" className="text-red-700">{error}</p>}<button disabled={busy} className="w-full bg-slate-900 text-white rounded-lg p-3 disabled:opacity-50">{busy ? '接続中…' : 'ログイン'}</button></form></main>;
  return <><div className="sticky top-0 z-40 bg-amber-100 border-b border-amber-300 px-4 py-2 text-sm flex flex-wrap justify-between gap-2"><span><strong>社内テスト環境</strong> ｜ サンプルデータ・実個人情報の入力不可</span><div className="flex gap-3"><span role="status" className={status === '保存済み' ? 'text-emerald-800' : 'text-red-800'}>{status}</span>{status !== '保存済み' && <button className="underline" onClick={retrySave}>保存を再試行</button>}<button className="underline" onClick={logout}>ログアウト</button></div></div><App /></>;
}
