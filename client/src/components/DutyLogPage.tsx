import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { DriverLedgerEntry } from '../data/drivers';
import type { VehicleLedgerVehicle } from '../data/vehicles';
import { appendCollectionAndSave, usePersistentState } from '../lib/store';
import { todayInJapan } from '../lib/ledger';
import { emptyStaff, canExecuteRollCall, staffRoles, type StaffMember, type StaffRole } from '../lib/staff';
import { displayTime, dutyCsv, dutyError, isoTime, latestDuties, localTime, methodNames, needsAttention, type DutyLog, type RollCall } from '../lib/dutyLog';

const field = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const button = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50';
const nowInput = () => localTime(new Date().toISOString());
const emptyDuties: DutyLog[] = [];
type Draft = { location: string; visualCheck: string; detectorCondition: string; vehicleReport: string; roadReport: string; operationReport: string; handoverStatus: string; otherNotes: string; mode: 'attendance' | 'before' | 'after'; original?: DutyLog; driverId: string; clockIn: string; clockOut: string; recorder: string; reason: string; note: string; voided: boolean;
  at: string; executor: string; vehicleId: string; method: string; methodDetail: string; alcohol: string; detectorUsed: string; alcoholValue: string;
  health: string; fatigue: string; sleep: string; inspection: string; instructions: string; report: string; handover: string; response: string };
function draftFor(mode: Draft['mode'], original?: DutyLog): Draft {
  const call = mode === 'attendance' ? undefined : original?.[mode];
  return { location: call?.location ?? '', visualCheck: call?.visualCheck ?? '', detectorCondition: call?.detectorCondition ?? '',
    vehicleReport: call?.vehicleReport ?? '', roadReport: call?.roadReport ?? '', operationReport: call?.operationReport ?? call?.report ?? '', handoverStatus: call?.handoverStatus ?? '', otherNotes: call?.otherNotes ?? '', mode, original, driverId: String(original?.driverId ?? ''), clockIn: original ? localTime(original.clockIn) : nowInput(),
    clockOut: original?.clockOut ? localTime(original.clockOut) : '', recorder: '', reason: '', note: original?.note ?? '', voided: original?.voided ?? false,
    at: call ? localTime(call.at) : nowInput(), executor: '', vehicleId: String(call?.vehicleId ?? ''), method: call?.method ?? '', methodDetail: call?.methodDetail ?? '',
    alcohol: call?.alcohol ?? '', detectorUsed: call?.detectorUsed ?? '', alcoholValue: call?.alcoholValue === undefined ? '' : String(call.alcoholValue),
    health: call?.health ?? '', fatigue: call?.fatigue ?? '', sleep: call?.sleep ?? '', inspection: call?.inspection ?? '',
    instructions: call?.instructions ?? '', report: call?.report ?? '', handover: call?.handover ?? '', response: call?.response ?? '' };
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-sm font-medium text-slate-700">{label}{children}</label>; }
function callSummary(call?: RollCall) {
  if (!call) return <span className="text-amber-800">未記録</span>;
  return <span className={needsAttention(call) ? 'text-rose-700' : 'text-slate-700'}>{displayTime(call.at)}<br />{call.executor} · {needsAttention(call) ? '確認事項あり' : '記録あり'}</span>;
}
export default function DutyLogPage({ drivers, vehicles }: { drivers: DriverLedgerEntry[]; vehicles: VehicleLedgerVehicle[] }) {
  const [records] = usePersistentState<DutyLog[]>('dutyLogs', emptyDuties);
  const [staff] = usePersistentState<StaffMember[]>('staffMembers', emptyStaff);
  const [date, setDate] = useState(todayInJapan);
  const [month, setMonth] = useState(() => todayInJapan().slice(0, 7));
  const [view, setView] = useState<'rollcall' | 'attendance'>('rollcall');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, setPending] = useState<DutyLog | null>(null);
  const [saving, setSaving] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [historyId, setHistoryId] = useState<string | null>(null);
  const latest = latestDuties(records);
  const selected = latest.filter(record => record.dutyDate === date);
  const openEarlier = latest.filter(record => !record.voided && !record.clockOut && record.dutyDate < date);
  const history = records.filter(record => record.dutyId === historyId);
  useEffect(() => {
    if (!draft) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);
  function open(mode: Draft['mode'], record?: DutyLog) { setDraft(draftFor(mode, record)); setPending(null); setError(''); setNotice(''); }
  function patch(key: keyof Draft, value: string | boolean) { setDraft(previous => previous ? { ...previous, [key]: value } : previous); }
  function exportCsv(kind: 'attendance' | 'rollcall' | 'history') {
    const blob = new Blob([dutyCsv(records.filter(record => record.dutyDate.startsWith(month)), kind)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url;
    link.download = `${kind === 'attendance' ? '出勤簿' : kind === 'history' ? '点呼出勤訂正履歴' : '点呼簿'}-${month}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!draft || locked.current) return;
    setError('');
    let record = pending;
    if (!record) {
      const driver = drivers.find(item => item.id === Number(draft.driverId));
      if (!driver) { setError('運転者を選択してください。'); return; }
      const member = staff.find(item => item.id === (draft.mode === 'attendance' ? draft.recorder : draft.executor));
      if (!member?.active || (draft.mode !== 'attendance' && !canExecuteRollCall(member))) { setError('職員台帳から有効な担当者を選択してください。'); return; }
      const original = draft.original;
      record = { ...(original ?? {}), id: crypto.randomUUID(), dutyId: original?.dutyId ?? crypto.randomUUID(), supersedes: original?.id,
        recordedAt: new Date().toISOString(), recorder: member.name, recorderStaffId: member.id, reason: draft.reason.trim(), driverId: driver.id,
        driverName: original?.driverName ?? driver.name, driverCode: original?.driverCode ?? driver.code,
        dutyDate: original?.dutyDate ?? draft.clockIn.slice(0, 10), clockIn: isoTime(draft.clockIn), clockOut: isoTime(draft.clockOut) || undefined, note: draft.note, voided: draft.voided };
      if (draft.mode !== 'attendance') {
        const vehicle = vehicles.find(item => item.id === Number(draft.vehicleId));
        if (!vehicle) { setError('車両を選択してください。'); return; }
        record[draft.mode] = { schemaVersion: 2, executorStaffId: member.id, executorRole: member.role, executorOffice: member.officeName,
          location: draft.location.trim(), visualCheck: draft.visualCheck as RollCall['visualCheck'], detectorCondition: draft.detectorCondition as RollCall['detectorCondition'],
          vehicleReport: draft.vehicleReport, roadReport: draft.roadReport, operationReport: draft.operationReport, handoverStatus: draft.mode === 'after' ? draft.handoverStatus as RollCall['handoverStatus'] : undefined, otherNotes: draft.otherNotes,
          at: isoTime(draft.at), executor: member.name, vehicleId: vehicle.id,
          vehicleLabel: original?.[draft.mode]?.vehicleId === vehicle.id ? original[draft.mode]!.vehicleLabel : `${vehicle.name} / ${vehicle.plateNo}`,
          method: draft.method as RollCall['method'], methodDetail: draft.methodDetail.trim(), alcohol: draft.alcohol as RollCall['alcohol'], detectorUsed: draft.detectorUsed as RollCall['detectorUsed'],
          alcoholValue: draft.alcoholValue === '' ? undefined : Number(draft.alcoholValue), health: draft.mode === 'before' ? draft.health as RollCall['health'] : undefined, fatigue: draft.mode === 'before' ? draft.fatigue as RollCall['fatigue'] : undefined, sleep: draft.mode === 'before' ? draft.sleep as RollCall['sleep'] : undefined,
          inspection: draft.mode === 'before' ? draft.inspection as RollCall['inspection'] : undefined,
          instructions: draft.instructions, report: draft.report, handover: draft.handover, response: draft.response };
      }
      const problem = dutyError(record, records);
      if (problem) { setError(problem); return; }
      if (original && !latest.some(item => item.id === original.id)) { setError('この勤務は更新されています。入力内容を控え、閉じて最新の記録を開いてください。'); return; }
      setPending(record);
    }
    locked.current = true; setSaving(true);
    try { await appendCollectionAndSave('dutyLogs', [record]); setDate(record.dutyDate); setDraft(null); setPending(null); setNotice('記録を保存しました。'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存できませんでした。'); }
    finally { locked.current = false; setSaving(false); }
  }
  const text = (key: keyof Draft, label: string, required = false, type = 'text') => <Field label={label}><input className={field} type={type} value={String(draft?.[key] ?? '')} onChange={event => patch(key, event.target.value)} required={required} maxLength={type === 'text' ? 200 : undefined} /></Field>;
  const area = (key: keyof Draft, label: string, required = false) => <Field label={label}><textarea className={field} rows={2} value={String(draft?.[key] ?? '')} onChange={event => patch(key, event.target.value)} required={required} maxLength={2000} /></Field>;
  const select = (key: keyof Draft, label: string, options: [string, string][]) => {
    if (['recorder', 'executor', 'method'].includes(key)) return <Field label={label}><select className={field} value={String(draft?.[key] ?? '')} onChange={event => patch(key, event.target.value)} required><option value="">選択してください</option>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>;
    return <fieldset className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-medium text-slate-700">{label}</legend><div className="flex flex-wrap gap-3">{options.map(([value, option]) => <label key={value} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><input type="radio" name={`rollcall-${key}`} value={value} checked={draft?.[key] === value} onChange={() => patch(key, value)} required />{option}</label>)}</div></fieldset>;
  };
  function table(rows: DutyLog[]) {
    return <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[960px] text-left text-sm"><thead className="bg-slate-100 text-slate-600"><tr>{['勤務日・運転者', '出勤', '乗務前点呼', '乗務後点呼', '退勤', '記録'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{rows.map(record => <tr key={record.id} className={`border-t border-slate-200 ${record.voided ? 'bg-slate-50 text-slate-400' : 'bg-white'}`}><td className="p-3"><strong>{record.driverName}</strong><br />{record.driverCode} · {record.dutyDate}{record.voided && <span className="ml-2">取消</span>}</td><td className="p-3">{displayTime(record.clockIn)}</td><td className="p-3">{callSummary(record.before)}</td><td className="p-3">{callSummary(record.after)}</td><td className="p-3">{displayTime(record.clockOut)}</td><td className="p-3"><div className="flex flex-wrap gap-2">{!record.voided && <>{view === 'rollcall' && <><button className={button} onClick={() => open('before', record)}>乗務前{record.before ? 'を訂正' : 'を記録'}</button><button className={button} onClick={() => open('after', record)}>乗務後{record.after ? 'を訂正' : 'を記録'}</button></>}</>}<button className={button} onClick={() => open('attendance', record)}>{record.voided ? '取消を訂正' : '出退勤・訂正'}</button><button className={button} onClick={() => setHistoryId(record.dutyId)}>詳細・履歴</button></div></td></tr>)}</tbody></table>{rows.length === 0 && <p className="bg-white p-6 text-sm text-slate-500">この日の勤務記録はありません。「出勤を記録」から登録できます。</p>}</div>;
  }
  return <section className="mx-auto max-w-7xl space-y-5 px-4 py-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">点呼簿・出勤簿</h2><p className="mt-1 text-sm text-slate-600">同じ勤務の出退勤と点呼をまとめて確認。日またぎも出勤日の勤務にひも付きます。</p></div><button className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white" onClick={() => open('attendance')}>出勤を記録</button></div>
    <div className="flex flex-wrap items-end gap-3"><button className={button} aria-pressed={view === 'rollcall'} onClick={() => setView('rollcall')}>点呼簿</button><button className={button} aria-pressed={view === 'attendance'} onClick={() => setView('attendance')}>出勤簿</button><Field label="勤務日（出勤日）"><input type="date" className={field} value={date} onChange={event => setDate(event.target.value)} required /></Field><span className="pb-2 text-sm text-slate-600">{selected.filter(record => !record.voided).length}勤務 ／ 乗務前未記録 {selected.filter(record => !record.voided && !record.before).length} ／ 乗務後未記録 {selected.filter(record => !record.voided && !record.after).length}</span></div>
    {!staff.some(canExecuteRollCall) && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">点呼を記録するには、上部の「職員台帳」で運行管理者または選任された補助者を登録してください。</p>}
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}{table(selected)}
    {openEarlier.length > 0 && <div className="space-y-2"><h3 className="font-semibold text-amber-900">前日以前からの未退勤 {openEarlier.length}件</h3>{table(openEarlier)}</div>}
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4"><Field label="出力対象月（出勤月）"><input className={field} type="month" value={month} onChange={event => setMonth(event.target.value)} /></Field><button className={button} disabled={!month} onClick={() => exportCsv('rollcall')}>点呼簿CSV</button><button className={button} disabled={!month} onClick={() => exportCsv('attendance')}>出勤簿CSV</button><button className={button} disabled={!month} onClick={() => exportCsv('history')}>訂正履歴CSV</button><p className="w-full text-xs text-slate-500">出退勤は実際の時刻を記録します。点呼時刻からの自動打刻・給与計算は行いません。</p></div>
    {draft && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-4"><form onSubmit={submit} className="mx-auto my-6 max-w-3xl space-y-4 rounded-2xl bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-label={draft.mode === 'attendance' ? '出退勤の記録' : `${draft.mode === 'before' ? '乗務前' : '乗務後'}点呼の記録`}><h3 className="text-lg font-bold">{draft.mode === 'attendance' ? '出退勤の記録' : `${draft.mode === 'before' ? '乗務前' : '乗務後'}点呼の記録`}</h3><fieldset disabled={saving || !!pending} className="space-y-4 disabled:opacity-70">
      <div className="grid gap-3 sm:grid-cols-2"><Field label="運転者"><select className={field} value={draft.driverId} onChange={event => patch('driverId', event.target.value)} required disabled={!!draft.original}><option value="">選択してください</option>{drivers.filter(driver => driver.status === 'active' || driver.id === draft.original?.driverId).map(driver => <option key={driver.id} value={driver.id}>{driver.name}（{driver.code}）</option>)}</select></Field>{draft.mode === 'attendance' && select('recorder', '記録担当者', staff.filter(member => member.active).map(member => [member.id, `${member.name}（${staffRoles[member.role]}／${member.officeName}）`]))}</div>
      {draft.mode === 'attendance' ? <><div className="grid gap-3 sm:grid-cols-2">{text('clockIn', '出勤日時（日本時間）', true, 'datetime-local')}{text('clockOut', '退勤日時（未退勤は空欄）', false, 'datetime-local')}</div>{area('note', '勤務メモ')}{draft.original && <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.voided} onChange={event => patch('voided', event.target.checked)} />この勤務記録を取消（元の記録・点呼は履歴に残ります）</label>}</> : <>
      <p className="text-sm text-slate-600">出勤：{displayTime(draft.original?.clockIn)} ／ 退勤：{displayTime(draft.original?.clockOut)}</p>
      <div className="grid gap-3 sm:grid-cols-2">{text('at', '点呼日時（日本時間）', true, 'datetime-local')}{select('executor', '点呼執行者（運行管理者・補助者）', staff.filter(canExecuteRollCall).map(member => [member.id, `${member.name}（${staffRoles[member.role]}／${member.officeName}）`]))}{text('location', '点呼場所', true)}<Field label="車両"><select className={field} value={draft.vehicleId} onChange={event => patch('vehicleId', event.target.value)} required><option value="">選択してください</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}／{vehicle.plateNo}</option>)}</select></Field>{select('method', '点呼方法', Object.entries(methodNames))}</div>
      {draft.method && draft.method !== 'face' && area('methodDetail', '具体的方法・対面で行えない理由', true)}
      <div className="grid gap-3 sm:grid-cols-3">{select('alcohol', '酒気帯びの有無', [['none', '無'], ['detected', '有']])}{select('detectorUsed', 'アルコール検知器', [['yes', '使用'], ['no', '未使用']])}<Field label="測定値（mg/L・任意）"><input className={field} type="text" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,3})?" maxLength={6} placeholder="例：0.000" value={draft.alcoholValue} onChange={event => patch('alcoholValue', event.target.value)} /></Field>{select('visualCheck', '目視・応答等の確認', [['yes', '確認した'], ['no', '未確認']])}{select('detectorCondition', '検知器の状態', [['ok', '正常'], ['fault', '故障等あり'], ['unchecked', '未確認']])}{draft.mode === 'before' && <>{select('health', '疾病等の状況', [['good', '問題なし'], ['concern', '確認事項あり']])}{select('fatigue', '疲労', [['none', 'なし'], ['concern', 'あり']])}{select('sleep', '睡眠不足', [['enough', 'なし'], ['insufficient', 'あり']])}{select('inspection', '日常点検', [['ok', '実施・異常なし'], ['concern', '実施・確認事項あり'], ['not_done', '未実施']])}</>}</div>
      {draft.mode === 'before' && area('instructions', '指示事項', true)}{draft.mode === 'after' && <>{area('vehicleReport', '車両の状況の報告', true)}{area('roadReport', '道路の状況の報告', true)}{area('operationReport', '運行の状況の報告', true)}{select('handoverStatus', '交替運転者への通告', [['none', '交替なし'], ['done', '通告済み'], ['not_done', '未通告']])}{draft.handoverStatus !== 'none' && area('handover', '交替運転者への通告内容・未通告の理由', true)}</>}{area('otherNotes', 'その他必要な事項')}{area('response', '確認事項の詳細・対応内容')}
      </>}
      {draft.original && area('reason', '今回の追記・訂正・取消の理由', true)}<p className="text-xs text-slate-500">保存後の記録は上書きせず、追記・訂正の履歴として残します。</p>
      </fieldset>{error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{pending && !saving && <p className="text-sm text-amber-800">保存結果を確認できていません。同じ内容で再試行できます。入力内容は保持しています。</p>}
      <div className="flex justify-end gap-2"><button className={button} type="button" disabled={saving} onClick={() => { setDraft(null); setPending(null); }}>閉じる</button><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={saving}>{saving ? '保存中…' : pending ? '同じ記録を再試行' : '記録を保存'}</button></div>
    </form></div>}
    {historyId && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-4"><section role="dialog" aria-modal="true" aria-label="勤務の詳細・訂正履歴" className="mx-auto my-6 max-w-3xl space-y-4 rounded-2xl bg-white p-5"><div className="flex justify-between"><h3 className="font-bold">勤務の詳細・訂正履歴</h3><button className={button} onClick={() => setHistoryId(null)}>閉じる</button></div>{history.map((record, index) => <article key={record.id} className="space-y-2 rounded-xl border border-slate-200 p-4 text-sm"><h4 className="font-bold">{index + 1}回目 · {record.voided ? '取消' : record.supersedes ? '追記・訂正' : '新規'} ／ {record.recorder} ／ {displayTime(record.recordedAt)}</h4><p>{record.driverName} · 出勤 {displayTime(record.clockIn)} ／ 退勤 {displayTime(record.clockOut)}</p><p className="whitespace-pre-wrap">{record.reason} {record.note}</p>{(['before', 'after'] as const).map(phase => { const call = record[phase]; return call && <div key={phase} className="space-y-1 border-t pt-2"><h5 className="font-semibold">{phase === 'before' ? '乗務前' : '乗務後'}：{displayTime(call.at)} ／ {call.executor}</h5><p>{call.vehicleLabel} · {methodNames[call.method]} {call.methodDetail}</p><p>点呼場所：{call.location || '旧記録：未記録'} ／ 役割：{call.executorRole ? staffRoles[call.executorRole as StaffRole] : '旧記録：未記録'} ／ 営業所：{call.executorOffice || '未記録'}</p><p>目視・応答：{call.visualCheck === 'yes' ? '確認' : call.visualCheck === 'no' ? '未確認' : '旧記録：未記録'} ／ 検知器状態：{call.detectorCondition === 'ok' ? '正常' : call.detectorCondition === 'fault' ? '故障等あり' : '未確認'}</p><p>酒気帯び：{call.alcohol === 'none' ? '無' : '有'} ／ 検知器：{call.detectorUsed === 'yes' ? '使用' : '未使用'} ／ 測定：{call.alcoholValue === undefined ? '未記録' : `${call.alcoholValue} mg/L`}</p>{call.health && <p>疾病等：{call.health === 'good' ? '問題なし' : '確認事項あり'} ／ 疲労：{call.fatigue === 'none' ? 'なし' : 'あり'} ／ 睡眠不足：{call.sleep === 'enough' ? 'なし' : 'あり'}{call.inspection && ` ／ 日常点検：${call.inspection === 'ok' ? '実施・異常なし' : call.inspection === 'not_done' ? '未実施' : '確認事項あり'}`}</p>}{[['指示', call.instructions], ['旧形式の報告', call.report], ['車両の状況', call.vehicleReport], ['道路の状況', call.roadReport], ['運行の状況', call.operationReport], ['交替運転者への通告', call.handover], ['通告区分', call.handoverStatus === 'none' ? '交替なし' : call.handoverStatus === 'done' ? '通告済み' : call.handoverStatus === 'not_done' ? '未通告' : '旧記録：未記録'], ['その他必要事項', call.otherNotes], ['対応', call.response]].map(([label, value]) => <p key={label} className="whitespace-pre-wrap">{label}：{value || '記載なし'}</p>)}</div>; })}</article>)}</section></div>}
  </section>;
}
