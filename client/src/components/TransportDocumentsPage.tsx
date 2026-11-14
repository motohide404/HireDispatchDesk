import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import type { DriverLedgerEntry } from '../data/drivers';
import type { VehicleLedgerVehicle } from '../data/vehicles';
import { usePersistentState } from '../lib/store';
import { emptyStaff, type StaffMember } from '../lib/staff';
import { displayTime, isoTime, localTime } from '../lib/dutyLog';
import { todayInJapan } from '../lib/ledger';
import { applicationMethods, documentError, documentNames, documentRequest, editableValues, newDocumentValues, relevantFields, savedValues, type DocumentEvent, type DocumentJob, type DocumentKind, type DocumentValues, type TransportDocument } from '../lib/transportDocuments';
import './TransportDocumentsPage.css';

type StoredJob = Omit<DocumentJob, 'collection' | 'id'> & { id: string | number };
const emptyJobs: StoredJob[] = [];
const control = 'mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base';
const button = 'min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50';
type Draft = { kind: DocumentKind; job: DocumentJob; values: DocumentValues; staffId: string; original?: TransportDocument; reason: string; voided: boolean };
const eventNow = () => { const now = new Date(); return localTime(now.toISOString()) + ':' + String(now.getUTCSeconds()).padStart(2, '0') + '.' + String(now.getUTCMilliseconds()).padStart(3, '0'); };
const sourceKey = (job: Pick<DocumentJob, 'collection' | 'id'>) => `${job.collection}:${job.id}`;

export default function TransportDocumentsPage({ drivers, vehicles }: { drivers: DriverLedgerEntry[]; vehicles: VehicleLedgerVehicle[] }) {
  const [bookings] = usePersistentState<StoredJob[]>('bookings', emptyJobs);
  const [pool] = usePersistentState<StoredJob[]>('jobPool', emptyJobs);
  const [staff] = usePersistentState<StaffMember[]>('staffMembers', emptyStaff);
  const [date, setDate] = useState(todayInJapan);
  const [source, setSource] = useState('');
  const [rows, setRows] = useState<TransportDocument[]>([]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [detail, setDetail] = useState<TransportDocument | null>(null);
  const [history, setHistory] = useState<TransportDocument[]>([]);
  const [events, setEvents] = useState<DocumentEvent[]>([]);
  const [eventDraft, setEventDraft] = useState<{ staffId: string; recipient: string; at: string; method: string; note: string } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ path: string; value: TransportDocument | DocumentEvent } | null>(null);
  const [retry, setRetry] = useState(false);
  const lock = useRef(false);
  const jobs: DocumentJob[] = [...bookings.map(job => ({ ...job, collection: 'bookings' as const, id: String(job.id) })), ...pool.map(job => ({ ...job, collection: 'jobPool' as const, id: String(job.id) }))].filter(job => job.client?.name && job.start.startsWith(date));
  const selected = jobs.find(job => sourceKey(job) === source);
  useEffect(() => { let alive = true; setLoading(true); setError(''); documentRequest(`?date=${date}&offset=${offset}`).then(result => { if (alive) { setRows(result.records); setMore(result.hasMore); } }).catch(cause => { if (alive) setError(String(cause.message)); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [date, offset]);
  useEffect(() => {
    if (!draft && !eventDraft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [draft, eventDraft]);
  function reset() { setError(''); setNotice(''); pending.current = null; setRetry(false); }
  function open(kind: DocumentKind, original?: TransportDocument) {
    const job = original ? { ...original.source, client: { name: original.values.applicantName }, driverId: original.driverId, vehicleId: original.vehicleId } : selected;
    if (!job) return;
    if (kind === 'instruction' && (!job.driverId || !job.vehicleId)) { setError('運行指示書は、先に予約へ運転者と車両を指定してから作成してください。'); return; }
    reset(); setDetail(null);
    setDraft({ kind, job, values: original ? editableValues(original.values) : newDocumentValues(job, rows[0]), staffId: '', original, reason: '', voided: original?.voided ?? false });
  }
  async function show(record: TransportDocument) {
    setError('');
    try { const result = await documentRequest(`?documentId=${encodeURIComponent(record.documentId)}`); setHistory(result.records); setEvents(result.events); setDetail(result.records.find((row: TransportDocument) => row.id === record.id) ?? record); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '帳票を表示できません。'); }
  }
  async function persist(path: string, value: TransportDocument | DocumentEvent) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); pending.current ??= { path, value }; setRetry(true);
    try {
      const result = await documentRequest(pending.current.path, pending.current.value);
      pending.current = null; setRetry(false); setDraft(null); setEventDraft(null); setNotice('サーバーへ保存しました。');
      if (result.record) { const record = result.record as TransportDocument; setDate(record.values.boardingAt.slice(0, 10)); setOffset(0); await show(record); }
      else if (detail) await show(detail);
      const list = await documentRequest(`?date=${result.record?.values.boardingAt.slice(0, 10) ?? date}&offset=0`); setRows(list.records); setMore(list.hasMore);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存結果を確認できません。'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function saveDocument(event: FormEvent) {
    event.preventDefault(); if (!draft) return;
    if (pending.current) { await persist('', pending.current.value); return; }
    const member = staff.find(row => row.id === draft.staffId && row.active && (draft.kind === 'acceptance' || row.role === 'manager'));
    const problem = documentError(draft.kind, draft.values);
    if (problem || !member || (draft.original && !draft.reason.trim())) { setError(problem || '有効な作成担当者と、訂正時は理由を入力してください。'); return; }
    if (draft.kind === 'instruction' && member.appointmentDate > todayInJapan()) { setError('運行管理者の選任日を確認してください。'); return; }
    const identifier = crypto.randomUUID(); const driver = drivers.find(row => row.id === draft.job.driverId); const vehicle = vehicles.find(row => row.id === draft.job.vehicleId);
    const original = draft.original;
    if (draft.kind === 'instruction' && !original && (!driver || driver.status !== 'active' || !vehicle?.plateNo)) { setError('有効な運転者・登録番号のある車両を指定してください。'); return; }
    const record: TransportDocument = { id: identifier, documentId: original?.documentId ?? identifier, number: original?.number ?? `${draft.kind === 'acceptance' ? 'HK' : 'SI'}-${todayInJapan().replace(/-/g, '')}-${identifier.slice(0, 8).toUpperCase()}`, supersedes: original?.id, reason: draft.reason.trim(), voided: draft.voided, kind: draft.kind, createdAt: new Date().toISOString(), source: { collection: draft.job.collection, id: draft.job.id, title: draft.job.title, start: draft.job.start, end: draft.job.end }, issuerStaffId: member.id, issuerStaffName: member.name, values: savedValues(draft.values), ...(draft.kind === 'instruction' ? { driverId: original?.driverId ?? driver?.id, driverName: original?.driverName ?? driver?.name, vehicleId: original?.vehicleId ?? vehicle?.id, vehiclePlate: original?.vehiclePlate ?? vehicle?.plateNo } : {}) };
    await persist('', record);
  }
  async function saveEvent(event: FormEvent) {
    event.preventDefault(); if (!detail || !eventDraft) return;
    if (pending.current) { await persist('', pending.current.value); return; }
    const member = staff.find(row => row.id === eventDraft.staffId && row.active && (detail.kind === 'acceptance' || row.role === 'manager'));
    if (!member || !eventDraft.recipient.trim() || !eventDraft.method.trim() || !eventDraft.note.trim() || Date.parse(isoTime(eventDraft.at)) > Date.now() + 300000 || Date.parse(isoTime(eventDraft.at)) < Date.parse(detail.createdAt)) { setError('担当者、実施日時、相手、実施方法と確認内容を入力してください。実施日時は帳票作成後・現在以前です。'); return; }
    await persist('/events', { id: crypto.randomUUID(), recordId: detail.id, kind: detail.kind === 'acceptance' ? 'delivery' : 'instruction', at: isoTime(eventDraft.at), staffId: member.id, staffName: member.name, recipient: eventDraft.recipient.trim(), method: eventDraft.method.trim(), note: eventDraft.note.trim() });
  }
  const memberSelect = (kind: DocumentKind, value: string, change: (value: string) => void) => <label className="block text-sm">{kind === 'acceptance' ? '作成・交付担当者' : '指示する運行管理者'}<select className={control} required value={value} onChange={e => change(e.target.value)}><option value="">選択してください</option>{staff.filter(row => row.active && (kind === 'acceptance' || row.role === 'manager')).map(row => <option key={row.id} value={row.id}>{row.name} ／ {row.officeName}</option>)}</select></label>;
  const actions = <><p role="alert" className="text-sm text-rose-800">{error}</p><div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={() => { setDraft(null); setEventDraft(null); reset(); }}>閉じる</button><button className={button} disabled={busy}>{busy ? '保存中…' : retry ? '同じ内容で再試行' : '内容を確定して保存'}</button></div></>;
  return <section className="mx-auto max-w-6xl space-y-5 px-4 py-6"><h2 className="text-xl font-bold">受書・運行指示書</h2><p className="text-sm text-slate-600">予約を選んで作成し、発行時の内容を保存します。印刷画面からPDFにも保存できます。担当者の選択は本人認証ではありません。</p>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">利用日<input className={control} type="date" value={date} onChange={e => { setDate(e.target.value); setOffset(0); setSource(''); }} /></label><label className="text-sm">帳票を作る予約<select className={control} value={source} onChange={e => setSource(e.target.value)}><option value="">選択してください</option>{jobs.map(job => <option key={sourceKey(job)} value={sourceKey(job)}>{job.title} ／ {job.client.name} ／ {displayTime(job.start)}</option>)}</select></label></div>
    <div className="flex flex-wrap gap-2"><button className={button} disabled={!selected} onClick={() => open('acceptance')}>受書を作成</button><button className={button} disabled={!selected} onClick={() => open('instruction')}>運行指示書を作成</button></div>
    {!staff.some(row => row.active) && <p className="text-sm text-amber-900">先に職員台帳へ作成担当者と運行管理者を登録してください。</p>}
    {notice && <p role="status" className="text-emerald-800">{notice}</p>}{error && !draft && !eventDraft && <p role="alert" className="text-rose-800">{error}</p>}
    <div className="grid gap-3 md:grid-cols-2">{rows.map(row => <article key={row.id} className="space-y-2 rounded-xl border bg-white p-4"><h3 className="font-bold">{documentNames[row.kind]} {row.voided && '【取消】'}</h3><p className="break-all text-sm">{row.number} ／ {row.values.applicantName}</p><p className="text-sm">{row.source.title} ／ {displayTime(row.values.boardingAt)}</p><button className={button} onClick={() => void show(row)}>帳票を表示</button></article>)}</div>
    {!loading && !rows.length && <p className="text-sm text-slate-500">この利用日の保存済み帳票はありません。</p>}<div className="flex gap-2"><button className={button} disabled={!offset || loading} onClick={() => setOffset(value => Math.max(0, value - 50))}>前の50件</button><button className={button} disabled={!more || loading} onClick={() => setOffset(value => value + 50)}>次の50件</button></div>
    {draft && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-3"><form aria-label="運送帳票の作成" role="dialog" aria-modal="true" onSubmit={saveDocument} className="mx-auto my-3 max-w-3xl space-y-5 rounded-2xl bg-white p-5"><h3 className="text-lg font-bold">{documentNames[draft.kind]} {draft.original ? 'の訂正・取消' : 'の作成'}</h3><p className="text-sm">{draft.job.title} ／ {draft.job.client.name}</p><fieldset disabled={busy || retry} className="space-y-4">{memberSelect(draft.kind, draft.staffId, value => setDraft({ ...draft, staffId: value }))}
      {draft.kind === 'instruction' && <p className="text-sm">運転者：{draft.original?.driverName ?? drivers.find(row => row.id === draft.job.driverId)?.name} ／ 車両：{draft.original?.vehiclePlate ?? vehicles.find(row => row.id === draft.job.vehicleId)?.plateNo}</p>}
      {relevantFields(draft.kind).map(([key, label, type, , required]) => <label key={key} className="block text-sm">{label}{required && ' ＊'}{type === 'textarea' ? <textarea className={control} maxLength={2000} required={required} value={draft.values[key]} onChange={e => setDraft({ ...draft, values: { ...draft.values, [key]: e.target.value } })} /> : <input className={control} type={type === 'money' ? 'text' : type} inputMode={type === 'money' ? 'numeric' : undefined} maxLength={200} required={required} value={draft.values[key]} onChange={e => setDraft({ ...draft, values: { ...draft.values, [key]: e.target.value } })} />}</label>)}
      {draft.kind === 'acceptance' && <><label className="block text-sm">申込方法<select className={control} required value={draft.values.applicationMethod} onChange={e => setDraft({ ...draft, values: { ...draft.values, applicationMethod: e.target.value } })}><option value="">選択してください</option>{Object.entries(applicationMethods).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="block text-sm">金額の確定状況<select className={control} value={draft.values.priceStatus} onChange={e => setDraft({ ...draft, values: { ...draft.values, priceStatus: e.target.value as 'fixed' | 'estimate' } })}><option value="fixed">確定額</option><option value="estimate">概算額（算出根拠を記入）</option></select></label><p className="text-sm">合計（税込）：{Number(draft.values.fare || 0) + Number(draft.values.charge || 0)}円。予約の税抜見積からの自動転記は行いません。</p></>}
      <label className="block text-sm">日時の確定状況<select className={control} value={draft.values.timeStatus} onChange={e => setDraft({ ...draft, values: { ...draft.values, timeStatus: e.target.value as 'planned' | 'confirmed' } })}><option value="planned">予定日時</option><option value="confirmed">確定した日時</option></select></label>{draft.original && <><label className="block text-sm">訂正・取消の理由<textarea className={control} required maxLength={2000} value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} /></label><label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={draft.voided} onChange={e => setDraft({ ...draft, voided: e.target.checked })} />この帳票を取消（元の内容と履歴は残ります）</label></>}
      <p className="text-sm text-slate-600">保存後は上書きせず、理由付きの訂正として新しい版を作成します。保存だけで交付・指示完了にはなりません。</p></fieldset>{actions}</form></div>}
    {detail && createPortal(<div id="transport-document-print" className="fixed inset-0 z-40 overflow-y-auto bg-slate-900/50 p-3"><div className="document-panel mx-auto my-3 max-w-4xl rounded-xl bg-white p-5"><div className="document-controls space-y-3"><div className="flex flex-wrap gap-2"><button className={button} onClick={() => setDetail(null)}>帳票を閉じる</button><button className={button} onClick={() => window.print()}>印刷・PDF保存</button><button className={button} onClick={() => open(detail.kind, detail)}>理由を付けて訂正・取消</button><button className={button} disabled={detail.voided || history.some(row => row.supersedes === detail.id)} onClick={() => { reset(); setEventDraft({ staffId: '', recipient: detail.kind === 'acceptance' ? detail.values.applicantName : detail.driverName ?? '', at: eventNow(), method: '', note: '' }); }}>{detail.kind === 'acceptance' ? '交付した記録を残す' : '指示・携行確認の記録を残す'}</button></div><p className="text-sm">帳票の作成と、実際の交付・指示・携行は別に確認します。ここからの自動送信はありません。</p><div className="flex flex-wrap gap-2">{history.map((row, index) => <button key={row.id} className={button} onClick={() => setDetail(row)}>第{index + 1}版{row.voided ? '（取消）' : ''}</button>)}</div></div>
      <article className="transport-document space-y-4 py-5"><h1 className="text-center text-2xl font-bold">{documentNames[detail.kind]}</h1>{(detail.voided || history.some(row => row.supersedes === detail.id)) && <p className="text-center font-bold">【{detail.voided ? '取消済み' : '旧版・訂正前'}】</p>}<p className="break-all text-sm">番号：{detail.number} ／ 記録ID：{detail.id}<br />作成：{displayTime(detail.createdAt)} ／ {detail.issuerStaffName}</p>
      <table className="w-full border-collapse text-sm"><tbody>{relevantFields(detail.kind).map(([key, label, type]) => <tr key={key}><th className="w-1/3 border p-2 text-left">{label}</th><td className="whitespace-pre-wrap break-words border p-2">{type === 'datetime-local' ? displayTime(detail.values[key]) : detail.values[key] || '記載なし'}</td></tr>)}{detail.kind === 'acceptance' ? <><tr><th className="border p-2 text-left">申込方法</th><td className="border p-2">{applicationMethods[detail.values.applicationMethod as keyof typeof applicationMethods]}</td></tr><tr><th className="border p-2 text-left">合計（税込）</th><td className="border p-2">{(Number(detail.values.fare) + Number(detail.values.charge)).toLocaleString()}円 ／ {detail.values.priceStatus === 'estimate' ? '概算額' : '確定額'}</td></tr></> : <><tr><th className="border p-2 text-left">運転者</th><td className="border p-2">{detail.driverName}</td></tr><tr><th className="border p-2 text-left">自動車登録番号</th><td className="border p-2">{detail.vehiclePlate}</td></tr></>}<tr><th className="border p-2 text-left">日時の区分</th><td className="border p-2">{detail.values.timeStatus === 'confirmed' ? '確定' : '予定'}</td></tr></tbody></table><p className="whitespace-pre-wrap text-sm">{detail.reason && `訂正・取消理由：${detail.reason}`}</p>
      {detail.kind === 'acceptance' && <p className="text-sm">上記のとおり運送を引き受けます。</p>}</article>
      <section className="document-controls space-y-2 border-t pt-3 text-sm"><h3 className="font-bold">この版の交付・指示の記録</h3>{events.filter(row => row.recordId === detail.id).map(row => <p key={row.id} className="whitespace-pre-wrap">{displayTime(row.at)} ／ {row.staffName} → {row.recipient} ／ {row.method}<br />{row.note}</p>)}{!events.some(row => row.recordId === detail.id) && <p>まだ記録がありません。</p>}</section></div></div>, document.body)}
    {eventDraft && detail && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-3"><form role="dialog" aria-modal="true" aria-label="帳票の交付・指示記録" onSubmit={saveEvent} className="mx-auto my-3 max-w-xl space-y-4 rounded-xl bg-white p-5"><h3 className="font-bold">{detail.kind === 'acceptance' ? '実際の交付を記録' : '実際の指示・携行確認を記録'}</h3><fieldset disabled={busy || retry} className="space-y-3">{memberSelect(detail.kind, eventDraft.staffId, value => setEventDraft({ ...eventDraft, staffId: value }))}{([['at', '実施日時', 'datetime-local'], ['recipient', '相手の氏名・名称', 'text'], ['method', '交付・指示の方法', 'text'], ['note', '確認内容（指示書は運転者の確認・携行方法も記録）', 'text']] as const).map(([key, label, type]) => <label key={key} className="block text-sm">{label}<input className={control} type={type} step={type === 'datetime-local' ? 0.001 : undefined} maxLength={key === 'note' ? 2000 : 200} required value={eventDraft[key]} onChange={e => setEventDraft({ ...eventDraft, [key]: e.target.value })} /></label>)}</fieldset>{actions}</form></div>}
  </section>;
}
