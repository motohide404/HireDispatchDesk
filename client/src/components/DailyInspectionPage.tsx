import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { DriverLedgerEntry } from '../data/drivers';
import type { VehicleLedgerVehicle } from '../data/vehicles';
import { appendCollectionAndSave, usePersistentState } from '../lib/store';
import { emptyStaff, type StaffMember } from '../lib/staff';
import { displayTime, isoTime, localTime } from '../lib/dutyLog';
import { todayInJapan } from '../lib/ledger';
import { configurableItems, emptyInspections, emptyProfiles, emptyReviews, inspectionCsv, inspectionItems, inspectionState, latestInspections, type DailyInspection, type InspectionKey, type InspectionProfile, type InspectionReview } from '../lib/dailyInspection';

const control = 'mt-1 min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base';
const button = 'min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50';
const now = () => localTime(new Date().toISOString());
const id = () => crypto.randomUUID();
type Draft = { original?: DailyInspection; at: string; driverId: string; odometer: string; results: DailyInspection['results']; notes: string; previousIssues: string; reason: string };

export default function DailyInspectionPage({ drivers, vehicles }: { drivers: DriverLedgerEntry[]; vehicles: VehicleLedgerVehicle[] }) {
  const [profiles] = usePersistentState<InspectionProfile[]>('inspectionProfiles', emptyProfiles);
  const [records] = usePersistentState<DailyInspection[]>('dailyInspections', emptyInspections);
  const [reviews] = usePersistentState<InspectionReview[]>('inspectionReviews', emptyReviews);
  const [staff] = usePersistentState<StaffMember[]>('staffMembers', emptyStaff);
  const [vehicleId, setVehicleId] = useState('');
  const [date, setDate] = useState(todayInJapan);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [config, setConfig] = useState(false);
  const [excluded, setExcluded] = useState<InspectionProfile['excluded']>({});
  const [basis, setBasis] = useState('');
  const [methods, setMethods] = useState('');
  const [managerId, setManagerId] = useState('');
  const [reviewing, setReviewing] = useState<DailyInspection | null>(null);
  const [decision, setDecision] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [history, setHistory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef<{ key: string; value: InspectionProfile | DailyInspection | InspectionReview } | null>(null);
  const lock = useRef(false);
  const [retry, setRetry] = useState(false);
  const vehicle = vehicles.find(row => row.id === Number(vehicleId));
  const profile = profiles.filter(row => row.vehicleId === vehicle?.id).slice(-1)[0];
  const draftProfile = draft?.original ? profiles.find(row => row.id === draft.original?.profileId) : profile;
  const managers = staff.filter(row => row.active && row.maintenanceManager);
  const current = latestInspections(records);
  const shown = current.filter(row => row.at.startsWith(date) && (!vehicleId || row.vehicleId === Number(vehicleId)));
  useEffect(() => {
    if (!draft && !config && !reviewing) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [draft, config, reviewing]);
  function reset() { setError(''); setNotice(''); pending.current = null; setRetry(false); setManagerId(''); }
  function open(original?: DailyInspection) {
    reset(); if (original) setVehicleId(String(original.vehicleId));
    setDraft({ original, at: original ? localTime(original.at) : now(), driverId: original ? String(original.driverId) : '', odometer: original ? String(original.odometer) : '', results: original ? { ...original.results } : {}, notes: original?.notes ?? '', previousIssues: original?.previousIssues ?? '', reason: '' });
  }
  function patch(patch: Partial<Draft>) { setDraft(row => row ? { ...row, ...patch } : row); }
  async function save(key: string, value: InspectionProfile | DailyInspection | InspectionReview) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    pending.current ??= { key, value }; setRetry(true);
    try {
      await appendCollectionAndSave(pending.current.key, [pending.current.value]);
      setDraft(null); setConfig(false); setReviewing(null); pending.current = null; setRetry(false); setNotice('保存しました。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '保存できませんでした。'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function saveConfig(event: FormEvent) {
    event.preventDefault(); if (!vehicle) return;
    const member = managers.find(row => row.id === managerId);
    if (!member || !basis.trim() || !methods.trim()) { setError('整備管理者と、確認した資料・点検方法を入力してください。'); return; }
    await save('inspectionProfiles', { id: id(), vehicleId: vehicle.id, vehicleLabel: `${vehicle.name} / ${vehicle.plateNo}`, at: new Date().toISOString(), staffId: member.id, staffName: member.name, basis: basis.trim(), methods: methods.trim(), excluded });
  }
  async function saveInspection(event: FormEvent) {
    event.preventDefault(); if (!draft || !vehicle || !draftProfile) return;
    const driver = drivers.find(row => row.id === Number(draft.driverId));
    if (!driver || !draft.at || !/^\d{1,9}$/.test(draft.odometer)) { setError('実施者・点検日時と走行距離を確認してください。'); return; }
    if (inspectionItems.some(([key]) => !draftProfile.excluded[key] && !draft.results[key])) { setError('すべての点検結果を選択してください。'); return; }
    if (!draft.previousIssues.trim() || (Object.values(draft.results).includes('defect') && !draft.notes.trim()) || (draft.original && !draft.reason.trim())) { setError('前回異常の確認内容、異常があれば詳細、訂正時は理由を記録してください。'); return; }
    await save('dailyInspections', { id: id(), inspectionId: draft.original?.inspectionId ?? id(), supersedes: draft.original?.id, reason: draft.reason.trim(), recordedAt: new Date().toISOString(), at: isoTime(draft.at), vehicleId: vehicle.id, vehicleLabel: draft.original?.vehicleLabel ?? `${vehicle.name} / ${vehicle.plateNo}`, driverId: driver.id, driverName: draft.original?.driverName ?? driver.name, profileId: draftProfile.id, odometer: Number(draft.odometer), results: draft.results, notes: draft.notes.trim(), previousIssues: draft.previousIssues.trim() });
  }
  async function saveReview(event: FormEvent) {
    event.preventDefault(); const member = managers.find(row => row.id === managerId);
    if (!reviewing || !member || !decision || !reviewNote.trim()) { setError('整備管理者・運行可否・確認内容を入力してください。'); return; }
    await save('inspectionReviews', { id: id(), inspectionId: reviewing.id, at: new Date().toISOString(), staffId: member.id, staffName: member.name, decision: decision as InspectionReview['decision'], note: reviewNote.trim() });
  }
  function download() {
    const csv = inspectionCsv(records.filter(row => row.at.startsWith(date) && (!vehicleId || row.vehicleId === Number(vehicleId))), profiles, reviews);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `日常点検簿-${date}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  const managerSelect = <label className="block text-sm">確認する整備管理者<select className={control} required value={managerId} onChange={event => setManagerId(event.target.value)}><option value="">選択してください</option>{managers.map(row => <option key={row.id} value={row.id}>{row.name} ／ {row.officeName}</option>)}</select></label>;
  const actions = <><p role="alert" className="text-sm text-rose-800">{error}</p><div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={() => { setDraft(null); setConfig(false); setReviewing(null); }}>閉じる</button><button className={button} disabled={busy}>{busy ? '保存中…' : retry ? '同じ内容で再試行' : '記録を保存'}</button></div></>;
  return <section className="mx-auto max-w-6xl space-y-5 px-4 py-6">
    <div><h2 className="text-xl font-bold">車両の日常点検</h2><p className="mt-2 text-sm text-slate-600">乗用車の運行前点検を記録し、整備管理者が確認します。</p></div>
    <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">現在は共通ログインで、実施者を台帳から選ぶ方式です。氏名の選択は本人認証にはなりません。</p>
    <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">点検する車両<select className={control} value={vehicleId} onChange={event => setVehicleId(event.target.value)}><option value="">全車両（記録一覧）</option>{vehicles.map(row => <option key={row.id} value={row.id}>{row.name} ／ {row.plateNo}</option>)}</select></label><label className="text-sm">点検日<input className={control} type="date" value={date} onChange={event => setDate(event.target.value)} /></label></div>
    <div className="flex flex-wrap gap-2"><button className={button} disabled={!vehicle || !profile} onClick={() => open()}>日常点検を記録</button><button className={button} disabled={!vehicle} onClick={() => { reset(); setExcluded(profile?.excluded ?? {}); setBasis(profile?.basis ?? ''); setMethods(profile?.methods ?? ''); setConfig(true); }}>車両の点検方法を設定</button><button className={button} onClick={download}>点検簿CSV（訂正履歴を含む）</button></div>
    {vehicle && !profile && <p className="text-sm text-amber-900">先に整備管理者が、この車両の取扱説明書に合わせて点検方法を設定してください。</p>}
    {!managers.length && <p className="text-sm text-amber-900">職員台帳で整備管理者と選任日を登録してください。</p>}
    {notice && <p role="status" className="text-emerald-800">{notice}</p>}
    <div className="grid gap-3 md:grid-cols-2">{shown.map(row => <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" key={row.id}><h3 className="font-bold">{row.vehicleLabel}</h3><p className="text-sm">{displayTime(row.at)} ／ {row.driverName} ／ {row.odometer} km</p><p className="font-semibold">{inspectionState(row, reviews)}{Object.values(row.results).includes('defect') && '・異常の報告あり'}</p><div className="flex flex-wrap gap-2"><button className={button} onClick={() => { reset(); setReviewing(row); setDecision(''); setReviewNote(''); }}>整備管理者の確認</button><button className={button} onClick={() => open(row)}>理由を付けて訂正・再点検</button><button className={button} onClick={() => setHistory(row.inspectionId)}>詳細・履歴</button></div></article>)}</div>
    {!shown.length && <p className="rounded-xl bg-white p-5 text-sm text-slate-600">この条件の日常点検記録はありません。</p>}
    {(config || draft || reviewing) && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-3"><form role="dialog" aria-modal="true" aria-label={config ? '車両の点検方法' : draft ? '日常点検の記録' : '整備管理者の確認'} className="mx-auto my-3 max-w-3xl space-y-5 rounded-2xl bg-white p-4 sm:p-6" onSubmit={config ? saveConfig : draft ? saveInspection : saveReview}>
      <h3 className="text-lg font-bold">{config ? '車両の点検方法' : draft ? '日常点検の記録' : '整備管理者の確認'}</h3>
      <fieldset disabled={busy || retry} className="space-y-4">
      {config && <>{managerSelect}<p className="text-sm">取扱説明書・整備管理規程で実車を確認してください。この版では、対象となる項目を毎回すべて点検します。</p><label className="block text-sm">確認した資料・版・該当ページ<textarea className={control} required maxLength={2000} value={basis} onChange={e => setBasis(e.target.value)} /></label><label className="block text-sm">車両固有の点検方法（駐車ブレーキ・原動機等）<textarea className={control} required maxLength={2000} value={methods} onChange={e => setMethods(e.target.value)} /></label><p className="text-sm">構造上、該当装置がない場合だけ理由を記録します。未点検の代わりには使えません。</p>{configurableItems.map(key => <label key={key} className="block text-sm">{inspectionItems.find(row => row[0] === key)?.[1]}：対象外の根拠（通常は空欄）<input className={control} maxLength={200} value={excluded[key] ?? ''} onChange={e => setExcluded(previous => { const next = { ...previous }; if (e.target.value) next[key] = e.target.value; else delete next[key]; return next; })} /></label>)}</>}
      {draft && <><p className="font-semibold">{vehicle?.name} ／ {vehicle?.plateNo}</p><p className="whitespace-pre-wrap text-sm text-slate-600">点検方法：{draftProfile?.methods}</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">点検日時<input className={control} type="datetime-local" required value={draft.at} onChange={e => patch({ at: e.target.value })} /></label><label className="text-sm">点検実施者<select className={control} required value={draft.driverId} disabled={!!draft.original} onChange={e => patch({ driverId: e.target.value })}><option value="">選択してください</option>{drivers.filter(row => row.status === 'active' || row.id === Number(draft.driverId)).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="text-sm">走行距離（km）<input className={control} inputMode="numeric" pattern="[0-9]{1,9}" required value={draft.odometer} onChange={e => patch({ odometer: e.target.value })} /></label></div>
        {inspectionItems.map(([key, label]) => <fieldset key={key} className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-semibold">{label}</legend>{draftProfile?.excluded[key] ? <p className="text-sm text-slate-600">車両設定で対象外：{draftProfile.excluded[key]}</p> : <div className="grid grid-cols-2 gap-3">{(['ok', 'defect'] as const).map(value => <label key={value} className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-lg border border-slate-300 px-3"><input type="radio" name={`inspection-${key}`} required value={value} checked={draft.results[key] === value} onChange={() => patch({ results: { ...draft.results, [key]: value } })} />{value === 'ok' ? '正常' : '異常'}</label>)}</div>}</fieldset>)}
        <label className="block text-sm">前回異常の確認内容（報告がなければ「前回報告なし」）<textarea className={control} required maxLength={2000} value={draft.previousIssues} onChange={e => patch({ previousIssues: e.target.value })} /></label><label className="block text-sm">異常箇所・状況・措置内容<textarea className={control} required={Object.values(draft.results).includes('defect')} maxLength={2000} value={draft.notes} onChange={e => patch({ notes: e.target.value })} /></label>{draft.original && <label className="block text-sm">訂正・再点検の理由<textarea className={control} required maxLength={2000} value={draft.reason} onChange={e => patch({ reason: e.target.value })} /></label>}</>}
      {reviewing && <><p>{reviewing.vehicleLabel} ／ {displayTime(reviewing.at)} ／ {reviewing.driverName}</p><div className="space-y-2 text-sm">{inspectionItems.map(([key, label]) => <p key={key}>{label}：{reviewing.results[key] === 'ok' ? '正常' : reviewing.results[key] === 'defect' ? '異常' : `対象外：${profiles.find(p => p.id === reviewing.profileId)?.excluded[key] ?? '未確認'}`}</p>)}</div><p className="whitespace-pre-wrap text-sm">前回異常：{reviewing.previousIssues}<br />異常・措置：{reviewing.notes || '記載なし'}</p>{managerSelect}<fieldset><legend className="text-sm font-semibold">運行可否</legend><div className="mt-2 flex flex-wrap gap-3">{(['allow', 'deny'] as const).map(value => <label key={value} className="flex min-h-[44px] items-center gap-2"><input type="radio" required name="inspection-decision" checked={decision === value} disabled={value === 'allow' && Object.values(reviewing.results).includes('defect')} onChange={() => setDecision(value)} />{value === 'allow' ? '運行可' : '運行不可'}</label>)}</div></fieldset><p className="text-sm">異常が残る記録は運行可にできません。是正後の再点検は、元の記録を残して追記してください。</p><label className="block text-sm">確認内容・判断理由<textarea className={control} required maxLength={2000} value={reviewNote} onChange={e => setReviewNote(e.target.value)} /></label></>}
      </fieldset>{actions}</form></div>}
    {history && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-3"><section role="dialog" aria-modal="true" aria-label="日常点検の履歴" className="mx-auto my-3 max-w-3xl space-y-4 rounded-2xl bg-white p-5"><h3 className="text-lg font-bold">日常点検の履歴</h3><button className={button} onClick={() => setHistory(null)}>閉じる</button>{records.filter(row => row.inspectionId === history).map(row => <article key={row.id} className="space-y-2 rounded-xl border p-4 text-sm"><h4 className="font-bold">{displayTime(row.at)} ／ {row.driverName}</h4><p>{row.reason || '初回記録'} ／ 保存 {displayTime(row.recordedAt)}</p>{inspectionItems.map(([key, label]) => <p key={key}>{label}：{row.results[key] === 'ok' ? '正常' : row.results[key] === 'defect' ? '異常' : `対象外：${profiles.find(p => p.id === row.profileId)?.excluded[key] ?? '未確認'}`}</p>)}<p className="whitespace-pre-wrap">前回異常：{row.previousIssues}<br />異常・措置：{row.notes || '記載なし'}</p>{reviews.filter(item => item.inspectionId === row.id).map(item => <p key={item.id} className="whitespace-pre-wrap">{displayTime(item.at)} ／ {item.staffName} ／ {item.decision === 'allow' ? '運行可' : '運行不可'}：{item.note}</p>)}</article>)}</section></div>}
  </section>;
}
