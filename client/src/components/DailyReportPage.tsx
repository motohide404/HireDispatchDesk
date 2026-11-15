import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { DriverLedgerEntry } from '../data/drivers';
import type { VehicleLedgerVehicle } from '../data/vehicles';
import { todayInJapan } from '../lib/ledger';
import { localTime } from '../lib/dutyLog';
import { activityNames, dayOffset, timeOnDay, dailyRequest, instructionRow, localDateTime, meterSummary, minutes, newDailyRow, reportError, uuid, type Activity, type DailyReport, type DailyRow } from '../lib/dailyReport';
import type { TransportDocument } from '../lib/transportDocuments';
import DailyReportSheet from './DailyReportSheet';
import './DailyReportPage.css';
const cacheKey = (day: string, driver: number) => `hire-daily-draft:${day}:${driver}`;
const field = (label: string, input: ReactNode, wide = false) => <label className={wide ? 'daily-wide' : ''}>{label}{input}</label>;
const now = () => localTime(new Date().toISOString()).slice(0,16);
function DailyTimeInput({ label, day, value, onChange, defaultDay = 0, currentButton = false }: { label: string; day: string; value: string; onChange: (value: string) => void; defaultDay?: number; currentButton?: boolean }) {
  const [chosenDay, setChosenDay] = useState<number | null>(null);
  const offset = value ? dayOffset(day, value.slice(0, 10)) : chosenDay ?? defaultDay;
  const days = Array.from(new Set([-1, 0, 1, 2, 3, offset])).sort((a,b)=>a-b);
  return <div className="daily-time-field"><label>{label}<input aria-label={label} type="time" step="60" value={value.slice(11,16)} onChange={e=>onChange(timeOnDay(day,e.target.value,offset))} /></label>
    <select aria-label={`${label}の日付`} value={offset} onChange={e=>{ const next=Number(e.target.value);setChosenDay(next);if(value)onChange(timeOnDay(day,value.slice(11,16),next)); }}>{days.map(n=><option key={n} value={n}>{n===-1?'前日':n===0?'当日':n===1?'翌日':n===2?'翌々日':`${n}日後`}</option>)}</select>
    {currentButton && <button onClick={()=>onChange(now())}>{label==='出庫の実時刻'?'出庫時刻':label==='開始の実時刻'?'開始':'終了'}を現在時刻にする</button>}
  </div>;
}

export default function DailyReportPage({ drivers, vehicles }: { drivers: DriverLedgerEntry[]; vehicles: VehicleLedgerVehicle[] }) {
  const [date, setDate] = useState(todayInJapan);
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [draft, setDraft] = useState<DailyReport | null>(null);
  const [saved, setSaved] = useState<DailyReport | null>(null);
  const [instructions, setInstructions] = useState<TransportDocument[]>([]);
  const [history, setHistory] = useState<DailyReport[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [print, setPrint] = useState<{ report: DailyReport; blank: boolean } | null>(null);
  const [preview, setPreview] = useState(false);
  const pending = useRef<DailyReport | null>(null);
  const lock = useRef(false);
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    if (!dirty || !draft) return;
    try { localStorage.setItem(cacheKey(draft.date, draft.driverId), JSON.stringify(draft)); }
    catch { setNotice('この端末への下書き保存ができません。サーバーへ下書き保存してください。'); }
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft, dirty]);
  useEffect(() => { if (!print) return; const close = () => setPrint(null); window.addEventListener('afterprint',close); return () => window.removeEventListener('afterprint',close); }, [print]);
  async function open() {
    if (!driverId || !date || busy) return;
    setBusy(true); setError(''); setNotice(''); setHistory([]); setPreview(false);
    try {
      const [result, jobs, settings] = await Promise.all([
        dailyRequest(`?date=${date}&driverId=${driverId}`), dailyRequest(`/instructions?date=${date}&driverId=${driverId}`),
        fetch('/api/transport-documents/settings', { credentials: 'same-origin' }).then(async r => { if (!r.ok) throw new Error('営業所の設定を取得できません。'); return r.json(); })
      ]);
      const original: DailyReport | null = result.record;
      const driver = drivers.find(d => d.id === Number(driverId))!;
      const vehicle = original ? { id: original.vehicleId, plateNo: original.vehiclePlate } : vehicles.find(v => v.id === Number(vehicleId));
      if (!vehicle) throw new Error('新しい日報を作る車両を選んでください。');
      const identifier = uuid();
      const created: DailyReport = { id: identifier, reportId: identifier, version: 0, date, driverId: driver.id, driverName: driver.name, vehicleId: vehicle.id, vehiclePlate: vehicle.plateNo, office: settings.profile?.officeName ?? '', status: 'draft', reason: '', savedAt: '', startAt: '', startPlace: settings.profile?.depotPlace ?? '', startOdometer: '', dutyStart: '', dutyEnd: '', notes: '', rows: [] };
      let local: DailyReport | null = null;
      try { const raw = localStorage.getItem(cacheKey(date, driver.id)); if (raw) local = JSON.parse(raw); } catch { /* Server copy remains available. */ }
      const restorable = local && local.date === date && local.driverId === driver.id && Array.isArray(local.rows) && ((!original && local.version === 0) || (original && local.id === original.id && local.version === original.version));
      setSaved(original); setDraft(restorable ? local : original ?? created); setInstructions(jobs.records); pending.current = null;
      if (restorable) setNotice('この端末に残っていた未保存の入力を復元しました。');
      else if (local) setNotice('サーバーの最新の日報を開きました。古い端末下書きは上書きせず保管しています。');
      if (original) setVehicleId(String(original.vehicleId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '日報を開けません。'); }
    finally { setBusy(false); }
  }
  function change(patch: Partial<DailyReport>) { if (!draft) return; pending.current = null; setError(''); setNotice(''); setDraft({ ...draft, ...patch }); }
  function changeRow(id: string, patch: Partial<DailyRow>) { if (draft) change({ rows: draft.rows.map(row => row.id === id ? { ...row, ...patch } : row) }); }
  function add(kind: Activity) {
    if (!draft) return;
    const last = draft.rows[draft.rows.length - 1];
    change({ rows: [...draft.rows, newDailyRow(kind, last?.to || draft.startPlace)] });
  }
  async function save(status: 'draft' | 'submitted') {
    if (!draft || lock.current) return;
    const issue = reportError(draft, status === 'submitted');
    if (issue) { setError(issue); return; }
    if (saved?.status === 'submitted' && !draft.reason.trim()) { setError('提出済み日報の訂正理由を入力してください。'); return; }
    if (pending.current && pending.current.status !== status) { setError('前回の保存を同じボタンで再試行してから、提出してください。'); return; }
    lock.current = true; setBusy(true); setError(''); setNotice('');
    const row = pending.current ?? { ...draft, id: uuid(), version: (saved?.version ?? 0) + 1, status, savedAt: new Date().toISOString() };
    pending.current = row;
    try {
      const result = await dailyRequest('', row);
      setSaved(result.record); setDraft(result.record); pending.current = null;
      try { localStorage.removeItem(cacheKey(row.date,row.driverId)); } catch { /* Saved on server. */ }
      setNotice(row.status === 'submitted' ? '日報を提出しました。' : '下書きをサーバーに保存しました。');
    } catch (cause) { setError((cause instanceof Error ? cause.message : '保存できません。') + ' 入力内容は画面に残っています。'); }
    finally { lock.current = false; setBusy(false); }
  }
  function preparePrint(blank: boolean) { if (draft) { setPrint({ report: draft, blank }); } }
  const summary = draft ? meterSummary(draft) : null;
  return <section className="daily-page"><h2>乗務日報</h2><p className="daily-muted">乗務員と運行日を選択して入力します。記録は必要なだけ追加できます。</p>
    <div className="daily-grid">
      {field('運行日',<input type="date" value={date} onChange={e=>setDate(e.target.value)} />)}
      {field('乗務員',<select value={driverId} onChange={e=>setDriverId(e.target.value)}><option value="">選択してください</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name}{d.status==='archived' ? '（退職・保管）' : ''}</option>)}</select>)}
      {field('車両（新規作成時）',<select value={vehicleId} onChange={e=>setVehicleId(e.target.value)}><option value="">選択してください</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plateNo}</option>)}</select>)}
      <div className="daily-actions"><button disabled={!date || !driverId || busy} onClick={()=>void open()}>日報を開く</button></div>
    </div>
    {error && <p role="alert" className="daily-message daily-error">{error}</p>}{notice && <p role="status" className="daily-message">{notice}</p>}
    {draft && <fieldset disabled={busy}><div className="daily-card"><h3>{draft.date} / {draft.driverName}</h3><p>{draft.vehiclePlate}　{saved ? `第${saved.version}版・${saved.status === 'submitted' ? '提出済み' : '下書き'}` : '新規'}</p>
      <div className="daily-grid">
        {field('営業所',<input maxLength={100} value={draft.office} onChange={e=>change({office:e.target.value})} />)}
        {field('出庫地点',<input maxLength={100} value={draft.startPlace} onChange={e=>change({startPlace:e.target.value})} />)}
        <DailyTimeInput key={`${draft.reportId}-dutyStart`} label="勤務開始（任意）" day={draft.date} value={draft.dutyStart} onChange={value=>change({dutyStart:value})} />
        <DailyTimeInput key={`${draft.reportId}-dutyEnd`} label="勤務終了（任意）" day={draft.date} value={draft.dutyEnd} defaultDay={dayOffset(draft.date, draft.rows[draft.rows.length-1]?.endAt.slice(0,10) || draft.date)} onChange={value=>change({dutyEnd:value})} />
      </div></div>
      <div className="daily-card"><h3>開始時の記録</h3><p className="daily-muted">時刻だけを入力してください。日をまたぐときは「翌日」を選びます。</p><p className="daily-muted">以降はメーター下3桁だけを入力します。1区間が1000km以上になる場合は中間地点の記録を追加してください。</p><div className="daily-grid">
        <DailyTimeInput key={`${draft.reportId}-startAt`} label="出庫の実時刻" day={draft.date} value={draft.startAt} onChange={value=>change({startAt:value})} currentButton />
        {field('出庫メーター（積算km・最初だけ全桁）',<input inputMode="numeric" pattern="[0-9]*" maxLength={7} placeholder="例：12500" value={draft.startOdometer} onChange={e=>change({startOdometer:e.target.value})} />)}
        <p>開始時の下3桁：<strong>{draft.startOdometer ? String(Number(draft.startOdometer)%1000).padStart(3,'0') : '未入力'}</strong></p>
      </div></div>
      <details className="daily-card"><summary>担当の運行指示書から仕事を追加（{instructions.length}件）</summary><p className="daily-muted">乗降地点と仕事のひも付けを引き継ぎます。実時刻は運行時に記録してください。</p>
        {!instructions.length && <p>この日の担当指示書はありません。下のボタンから手入力できます。</p>}
        {instructions.map(doc=><div key={doc.id} className="daily-card"><p><strong>{doc.source.title}</strong></p><p>{doc.values.boardingPlace} → {doc.values.alightingPlace}</p><button disabled={draft.rows.some(r=>r.instructionId===doc.id)} onClick={()=>change({rows:[...draft.rows,instructionRow(doc)]})}>{draft.rows.some(r=>r.instructionId===doc.id) ? '追加済み' : 'この仕事を追加'}</button></div>)}
      </details>
      {draft.rows.map((row,index)=><div className="daily-card" key={row.id}><div className="daily-row-heading"><h3>記録 {index+1}　{activityNames[row.kind]}</h3><div className="daily-actions">
        <button aria-label={`記録${index+1}を上へ`} disabled={index===0} onClick={()=>{const rows=[...draft.rows];[rows[index-1],rows[index]]=[rows[index],rows[index-1]];change({rows});}}>↑</button>
        <button aria-label={`記録${index+1}を下へ`} disabled={index===draft.rows.length-1} onClick={()=>{const rows=[...draft.rows];[rows[index+1],rows[index]]=[rows[index],rows[index+1]];change({rows});}}>↓</button>
        <button onClick={()=>{if (window.confirm('この記録を入力欄から取り除きますか？保存済みの過去の版は残ります。')) change({rows:draft.rows.filter(r=>r.id!==row.id)});}}>削除</button>
      </div></div>
        <div className="daily-grid">{field('区分',<select value={row.kind} onChange={e=>changeRow(row.id,{kind:e.target.value as Activity})}>{Object.entries(activityNames).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>)}
          {field('仕事',<input maxLength={100} value={row.jobLabel} onChange={e=>changeRow(row.id,{jobLabel:e.target.value})} />)}
          {row.instructionId && <p className="daily-wide daily-muted">指示書参照：{row.instructionId} / 予定 {localDateTime(row.plannedStart)} → {localDateTime(row.plannedEnd)}</p>}
          {field('開始地点',<input maxLength={100} value={row.from} onChange={e=>changeRow(row.id,{from:e.target.value})} />)}
          {field('終了地点・休憩場所',<input maxLength={100} value={row.to} onChange={e=>changeRow(row.id,{to:e.target.value})} />)}
          <DailyTimeInput label="開始の実時刻" day={draft.date} value={row.startAt} defaultDay={dayOffset(draft.date, (draft.rows[index-1]?.endAt || draft.startAt || draft.date).slice(0,10))} onChange={value=>changeRow(row.id,{startAt:value})} currentButton />
          <DailyTimeInput label="終了の実時刻" day={draft.date} value={row.endAt} defaultDay={dayOffset(draft.date,(row.startAt || draft.rows[index-1]?.endAt || draft.startAt || draft.date).slice(0,10))} onChange={value=>changeRow(row.id,{endAt:value})} currentButton />
          {field('終了時メーター下3桁',<input inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="例：512" value={row.meter} onChange={e=>changeRow(row.id,{meter:e.target.value,rollover:false})} />)}
          <div><p>区間距離：<strong>{summary?.distances[index] ?? '未確定'}</strong> km</p><label><input type="checkbox" checked={row.rollover} onChange={e=>changeRow(row.id,{rollover:e.target.checked})} />999→000をまたいだことを確認</label></div>
          {row.kind==='passenger' && field('乗車人数',<input inputMode="numeric" maxLength={2} value={row.passengers} onChange={e=>changeRow(row.id,{passengers:e.target.value})}/>)}
          {field('経過地点・補足（ある場合）',<input maxLength={200} value={row.note} onChange={e=>changeRow(row.id,{note:e.target.value})}/>,true)}
        </div>
      </div>)}
      <div className="daily-actions">{Object.entries(activityNames).map(([key,label])=><button key={key} onClick={()=>add(key as Activity)}>＋{label}</button>)}</div>
      <div className="daily-card"><h3>1日のまとめ</h3><p>走行 {summary?.total ?? '未確定'} km / 実車 {summary?.passenger ?? '未確定'} km / 帰庫メーター {summary?.endOdometer ?? '未確定'} km</p>
        <p>休憩 {draft.rows.filter(r=>r.kind==='break').reduce((sum,r)=>sum+(minutes(r.startAt,r.endAt)??0),0)}分</p>
        {field('事故・遅延・異常など（ある場合は概要と原因）',<textarea maxLength={2000} value={draft.notes} onChange={e=>change({notes:e.target.value})}/>)}
        {saved?.status==='submitted' && field('訂正理由',<input maxLength={500} value={draft.reason} onChange={e=>change({reason:e.target.value})}/>)}
      </div>
      <div className="daily-savebar"><p className="daily-muted">{dirty ? '未保存の入力あり（端末にも下書きを保持）' : 'サーバー保存済み'}</p><div className="daily-actions"><button disabled={busy} onClick={()=>void save(saved?.status==='submitted' ? 'submitted' : 'draft')}>{saved?.status==='submitted' ? '訂正を保存' : '下書き保存'}</button><button className="daily-primary" disabled={busy} onClick={()=>void save('submitted')}>{saved?.status==='submitted' ? '訂正して提出' : '1日分を提出'}</button></div></div>
      <div className="daily-actions"><button onClick={()=>setPreview(!preview)}>印刷プレビュー</button><button onClick={()=>preparePrint(false)}>日報を印刷</button><button onClick={()=>preparePrint(true)}>空欄メモ用紙を印刷</button><button disabled={!saved || busy} onClick={()=>{setBusy(true);dailyRequest(`?reportId=${encodeURIComponent(draft.reportId)}`).then(r=>setHistory(r.records)).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>保存履歴</button></div>
      {preview && <div className="daily-print-preview"><DailyReportSheet report={draft}/></div>}
      {history.length>0 && <div className="daily-card"><h3>保存履歴（過去の版は変更できません）</h3>{history.map(r=><p key={r.id}>第{r.version}版 / {r.status==='submitted'?'提出':'下書き'} / {localDateTime(r.savedAt)} / {r.reason}<button onClick={()=>setPrint({report:r,blank:false})}>この版を印刷</button></p>)}</div>}
    </fieldset>}
    {print && createPortal(<div id="daily-report-print"><div className="daily-print-controls"><button onClick={()=>window.print()}>印刷・PDF保存</button><button onClick={()=>setPrint(null)}>閉じる</button></div><DailyReportSheet report={print.report} blank={print.blank}/></div>,document.body)}
  </section>;
}
