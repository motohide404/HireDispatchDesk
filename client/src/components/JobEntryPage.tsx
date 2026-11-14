import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import type { DriverLedgerEntry } from '../data/drivers';
import type { PartnerLedgerData } from '../data/partners';
import { customerRecords, resolveJobCustomer, selectJobCustomer, unlinkJobCustomer, type JobCustomerLink } from '../lib/jobCustomers';
import { formatVehicleClass, type VehicleLedgerVehicle } from '../data/vehicles';
import { createJobRow, driverChoice, hasJobInput, JOB_COLUMNS, MAX_JOB_ROWS, pasteJobCells, validateJobRows, vehicleChoice,
  type JobColumn, type JobEntryRow, type NewWorkJob } from '../lib/jobEntry';

type Props = {
  rows: JobEntryRow[];
  onRowsChange: (rows: JobEntryRow[]) => void;
  date: string;
  onDateChange: (date: string) => void;
  drivers: DriverLedgerEntry[];
  vehicles: VehicleLedgerVehicle[];
  customers: PartnerLedgerData;
  onRegister: (jobs: NewWorkJob[]) => Promise<void>;
  onOpenDispatch: (date?: string) => void;
  registering: boolean;
};

const placeholders: Record<string, string> = {
  title: '例：空港からホテル送迎', clientName: '例：テスト旅行', startDate: '2026/11/14', endDate: '同日なら空欄',
  startTime: '09:00', endTime: '10:00', preferClass: '指定なし', vehicle: '未指定', driver: '未指定', amount: '例：25,000', note: '集合場所・注意事項など',
  contactName: '例：予約ご担当者', phone: '例：090-1234-5678', email: '例：booking@example.com'
};

export default function JobEntryPage({ rows: draftRows, onRowsChange, date, onDateChange, drivers, vehicles, customers, onRegister, onOpenDispatch, registering }: Props) {
  const rows = useMemo(() => draftRows.map(row => row.customer ? resolveJobCustomer(row, customers).row : row), [draftRows, customers]);
  const [pickerRow, setPickerRow] = useState<string | null>(null);
  const [phase, setPhase] = useState<'edit' | 'confirm'>('edit');
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState('');
  const [pasteUndo, setPasteUndo] = useState<JobEntryRow[] | null>(null);
  const [submitted, setSubmitted] = useState<NewWorkJob[] | null>(null);
  const [success, setSuccess] = useState<{ count: number; date: string } | null>(null);
  const table = useRef<HTMLTableElement>(null);
  const submitLock = useRef(false);
  const results = useMemo(() => validateJobRows(rows, drivers, vehicles, JOB_COLUMNS, customers), [rows, drivers, vehicles, customers]);
  const invalid = results.filter(result => !result.job);
  const resultById = new Map(results.map(result => [result.row.id, result]));
  const totals = results.reduce((value, result) => {
    if (result.job?.amount !== undefined) { value.sum += result.job.amount; value.entered++; }
    return value;
  }, { sum: 0, entered: 0 });
  const classOptions = Array.from(new Set(vehicles.map(vehicle => formatVehicleClass(vehicle.class))));
  const locked = registering || submitted !== null;

  function updateCell(id: string, key: string, value: string) {
    setSuccess(null); setError(''); setPasteUndo(null);
    onRowsChange(rows.map(row => row.id === id ? { ...row, values: { ...row.values, [key]: value } } : row));
  }
  function focusCell(row: number, column: number) {
    requestAnimationFrame(() => {
      const control = table.current?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-row="${row}"][data-column="${column}"]`);
      control?.focus();
      control?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  }
  function paste(event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>, row: number, column: number) {
    const text = event.clipboardData.getData('text/plain');
    if (!/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    try {
      const next = pasteJobCells(rows, row, column, text, date);
      setPasteUndo(rows); setError(''); setSuccess(null);
      onRowsChange(next.map(item => resolveJobCustomer(item, customers).row));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '貼り付けできませんでした。'); }
  }
  function move(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, row: number, column: number) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' && !(event.currentTarget.tagName === 'TEXTAREA' && (event.altKey || event.ctrlKey || event.metaKey))) {
      event.preventDefault();
      const target = row + (event.shiftKey ? -1 : 1);
      if (target < 0 || target >= MAX_JOB_ROWS) return;
      if (target >= rows.length) onRowsChange([...rows, createJobRow(date)]);
      focusCell(target, column);
    } else if (event.key === 'Tab' && !event.shiftKey && column === JOB_COLUMNS.length - 1) {
      if (row + 1 >= MAX_JOB_ROWS) return;
      event.preventDefault();
      if (row + 1 >= rows.length) onRowsChange([...rows, createJobRow(date)]);
      focusCell(row + 1, 0);
    }
  }
  function review() {
    setShowErrors(true); setSuccess(null); setError('');
    if (!results.length) { setError('仕事を1件以上入力してください。'); return; }
    if (invalid.length) {
      const first = invalid[0];
      const column = JOB_COLUMNS.findIndex(item => first.errors[item.key]);
      focusCell(first.index, Math.max(0, column));
      return;
    }
    setPhase('confirm');
  }
  async function register() {
    if (submitLock.current || registering) return;
    const checked = validateJobRows(rows, drivers, vehicles, JOB_COLUMNS, customers);
    if (!submitted && (!checked.length || checked.some(result => !result.job))) {
      setError('入力内容や指定先が更新されています。入力画面で確認してください。'); return;
    }
    const batch = submitted ?? checked.map(result => result.job!);
    setSubmitted(batch); setError(''); submitLock.current = true;
    try {
      await onRegister(batch);
      onRowsChange(Array.from({ length: 5 }, () => createJobRow(date)));
      setSuccess({ count: batch.length, date: batch[0].start.slice(0, 10) });
      setPhase('edit'); setShowErrors(false); setSubmitted(null); setPasteUndo(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '登録を確認できませんでした。入力内容を保持しています。'); }
    finally { submitLock.current = false; }
  }
  function changeDefaultDate(value: string) {
    onDateChange(value);
    onRowsChange(rows.map(row => hasJobInput(row) ? row : { ...row, values: { ...row.values, startDate: value } }));
  }
  function cellInput(row: JobEntryRow, rowIndex: number, column: JobColumn, columnIndex: number) {
    const cellError = showErrors ? resultById.get(row.id)?.errors[column.key] : undefined;
    const props = {
      'aria-label': `${rowIndex + 1}行目 ${column.label}`,
      'aria-invalid': Boolean(cellError),
      'aria-describedby': cellError ? `${row.id}-${column.key}-error` : undefined,
      'data-row': rowIndex, 'data-column': columnIndex,
      value: row.values[column.key] ?? '', disabled: locked,
      maxLength: column.maxLength,
      placeholder: placeholders[column.key],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => updateCell(row.id, column.key, event.target.value),
      onPaste: (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => paste(event, rowIndex, columnIndex),
      onKeyDown: (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => move(event, rowIndex, columnIndex),
      className: `block min-h-11 w-full rounded-none border-0 px-3 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:bg-emerald-50 focus:ring-2 focus:ring-inset focus:ring-emerald-600 disabled:bg-slate-100 ${cellError ? 'bg-rose-50' : 'bg-transparent'}`
    };
    const list = ['driver', 'vehicle', 'class', 'clientType'].includes(column.kind) ? `job-entry-${column.kind}` : undefined;
    return <>
      {column.kind === 'memo' ? <textarea {...props} rows={1} title="改行はAlt＋Enter、次の行へはEnter" />
        : <input {...props} type="text" autoComplete="off" readOnly={column.key === 'clientName' && Boolean(row.customer)}
          onBlur={column.key === 'clientName' && !row.customer ? () => onRowsChange(rows.map(item => item.id === row.id ? resolveJobCustomer(item, customers).row : item)) : undefined}
          inputMode={column.kind === 'amount' ? 'decimal' : column.key === 'phone' ? 'tel' : column.key === 'email' ? 'email' : undefined} list={list} />}
      {column.key === 'clientName' && <div className="flex flex-wrap items-center gap-2 px-3 pb-2 text-xs">
        <button type="button" disabled={locked} aria-label={`${rowIndex + 1}行目 台帳から選ぶ`} onClick={() => setPickerRow(row.id)} className="font-semibold text-emerald-800 underline disabled:opacity-40">台帳から選ぶ</button>
        {row.customer ? <>
          <span className="text-emerald-800">台帳連動{customerRecords(row.customer, customers)?.office ? `・${customerRecords(row.customer, customers)!.office!.displayName}` : ''}</span>
          <button type="button" disabled={locked} aria-label={`${rowIndex + 1}行目 台帳連動を解除`} className="text-slate-500 underline" onClick={() => onRowsChange(rows.map(item => item.id === row.id ? unlinkJobCustomer(item) : item))}>解除</button>
        </> : <span className="text-slate-500">新規は直接入力</span>}
      </div>}
      {cellError && <p id={`${row.id}-${column.key}-error`} className="px-3 pb-2 text-xs font-medium text-rose-700">{cellError}</p>}
    </>;
  }

  return <section className="mx-auto w-full max-w-screen-2xl space-y-5 px-4 py-8 sm:px-6" aria-label="仕事登録画面">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Work entry</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">仕事登録</h2>
        <p className="mt-2 text-sm text-slate-600">1行に1件ずつ入力します。確認して登録すると、配車ボードの未配車の仕事に追加されます。</p>
        <p className="mt-1 text-sm text-slate-600">既存のお客様は台帳から選ぶと連絡先が入ります。新規は電話番号かメールアドレスを入力してください。</p>
      </div>
      <button type="button" disabled={registering} onClick={() => onOpenDispatch()} className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">配車ボードへ戻る</button>
    </header>

    {success && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-emerald-900">
      <p className="font-semibold">{success.count}件の仕事を登録しました。</p>
      <button type="button" className="rounded-full bg-emerald-800 px-4 py-2 text-sm font-semibold text-white" onClick={() => onOpenDispatch(success.date)}>登録した仕事を確認</button>
    </div>}
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

    {phase === 'edit' ? <>
      <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">新しい行の利用日
              <input type="date" aria-label="新しい行の利用日" value={date} disabled={locked} onChange={event => changeDefaultDate(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5" />
            </label>
            <button type="button" disabled={locked || rows.length >= MAX_JOB_ROWS} onClick={() => { onRowsChange([...rows, createJobRow(date)]); setPasteUndo(null); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">＋ 行を追加</button>
            {pasteUndo && <button type="button" disabled={locked} onClick={() => { onRowsChange(pasteUndo); setPasteUndo(null); setError(''); }} className="text-sm font-semibold text-emerald-800">貼り付けを元に戻す</button>}
          </div>
          <span className="text-xs text-slate-500">Excelから複数セルを貼り付け可能 ／ {rows.length}行・最大{MAX_JOB_ROWS}行</span>
        </div>
        <div className="max-h-[65vh] overflow-auto">
          <table ref={table} className="w-full table-fixed border-collapse text-left" style={{ minWidth: 92 + JOB_COLUMNS.reduce((sum, column) => sum + column.width, 0) }} aria-label="仕事入力表">
            <colgroup><col style={{ width: 48 }} />{JOB_COLUMNS.map(column => <col key={column.key} style={{ width: column.width }} />)}<col style={{ width: 44 }} /></colgroup>
            <thead className="sticky top-0 z-20 bg-emerald-900 text-white">
              <tr><th scope="col" className="sticky left-0 z-30 border-r border-emerald-800 bg-emerald-900 py-3 text-center text-xs">行</th>
                {JOB_COLUMNS.map((column, index) => <th key={column.key} scope="col" className={`border-r border-emerald-800 px-3 py-3 text-xs font-semibold ${index === 0 ? 'sticky left-12 z-30 bg-emerald-900' : ''}`}>
                  {column.label}{column.required && <span className="ml-1 text-amber-200">＊</span>}
                </th>)}<th scope="col" className="text-center text-xs"><span className="sr-only">行の削除</span></th></tr>
            </thead>
            <tbody>{rows.map((row, rowIndex) => {
              const result = resultById.get(row.id);
              return <tr key={row.id} className={rowIndex % 2 ? 'bg-slate-50' : 'bg-white'}>
                <th scope="row" className={`sticky left-0 z-10 border-b border-r border-slate-200 py-2 text-center text-xs font-medium ${showErrors && result && !result.job ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-500'}`} title={result?.job ? '登録可能' : result ? '入力中' : '空の行'}>{rowIndex + 1}</th>
                {JOB_COLUMNS.map((column, columnIndex) => <td key={column.key} className={`border-b border-r border-slate-200 align-top ${columnIndex === 0 ? 'sticky left-12 z-10 bg-white' : ''}`}>{cellInput(row, rowIndex, column, columnIndex)}</td>)}
                <td className="border-b border-slate-200 text-center align-middle"><button type="button" disabled={locked} aria-label={`${rowIndex + 1}行目を削除`} className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700" onClick={() => {
                  if (hasJobInput(row) && !window.confirm(`${rowIndex + 1}行目の入力を削除しますか？`)) return;
                  const remaining = rows.filter(item => item.id !== row.id);
                  onRowsChange(remaining.length ? remaining : [createJobRow(date)]); setPasteUndo(null); setError('');
                }}>×</button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          <p>＊は必須です。電話番号・メールはどちらか必須です。終了日が空欄なら利用日と同じ日になります。</p>
          <p>Tab：右のセル ／ Enter：下の行 ／ メモの改行：Alt＋Enter</p>
        </div>
      </div>
      {showErrors && invalid.length > 0 && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        <p className="font-semibold">{invalid.length}行に確認が必要です。赤いセルを修正してください。</p>
        <div className="mt-2 flex flex-wrap gap-2">{invalid.map(result => <button key={result.row.id} type="button" className="underline" onClick={() => focusCell(result.index, JOB_COLUMNS.findIndex(column => result.errors[column.key]))}>{result.index + 1}行目</button>)}</div>
      </div>}
      <div className="sticky bottom-3 z-30 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white/95 px-5 py-4 shadow-lg backdrop-blur">
        <div><p className="text-sm text-slate-700">入力あり <strong>{results.length}件</strong> ／ 登録可能 <strong>{results.length - invalid.length}件</strong></p>
          <p className="mt-1 text-xs text-slate-500">入力中の内容はまだ登録されていません。</p></div>
        <div className="flex items-center gap-3">
          <button type="button" disabled={locked} className="text-sm text-slate-500 disabled:opacity-40" onClick={() => {
            if (results.length && !window.confirm('入力した仕事をすべてクリアしますか？')) return;
            onRowsChange(Array.from({ length: 5 }, () => createJobRow(date))); setError(''); setShowErrors(false); setPasteUndo(null);
          }}>入力をクリア</button>
          <button type="button" disabled={locked || !results.length} onClick={review} className="rounded-full bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-900 disabled:opacity-40">登録内容を確認</button>
        </div>
      </div>
    </> : <section aria-label="仕事の登録確認" className="space-y-4 rounded-2xl border border-emerald-300 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-900">この内容で登録しますか？</h3><p className="mt-1 text-sm text-slate-600">{results.length}件を未配車の仕事として登録します。</p></div>
        <p className="text-sm font-semibold text-slate-700">見積合計：{totals.entered ? `${totals.sum.toLocaleString('ja-JP')}円（税抜）` : '金額未入力'}{totals.entered < results.length && totals.entered > 0 && ` ／ 未入力${results.length - totals.entered}件`}</p></div>
      <div className="overflow-auto"><table className="min-w-[1400px] w-full border-collapse text-left text-sm" aria-label="仕事の登録内容">
        <thead><tr><th className="border-b p-3">行</th>{JOB_COLUMNS.map(column => <th key={column.key} className="border-b p-3 whitespace-nowrap">{column.label}</th>)}</tr></thead>
        <tbody>{results.map(result => <tr key={result.row.id}><th scope="row" className="border-b p-3">{result.index + 1}</th>{JOB_COLUMNS.map(column => <td key={column.key} className="border-b p-3 whitespace-pre-wrap break-words">{result.row.values[column.key] || (column.key === 'endDate' ? '利用日と同日' : '—')}{column.key === 'clientName' && <p className="mt-1 text-xs text-slate-500">{result.row.customer ? ['台帳連動', customerRecords(result.row.customer, customers)?.office?.displayName].filter(Boolean).join('・') : '新規・直接入力'}</p>}</td>)}</tr>)}</tbody>
      </table></div>
      {submitted && error && <p className="text-sm text-slate-600">入力内容は保持しています。同じ仕事を重複させずに保存を再試行できます。</p>}
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" disabled={locked} onClick={() => { setPhase('edit'); setError(''); }} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40">入力に戻る</button>
        <button type="button" disabled={registering || (!submitted && invalid.length > 0)} onClick={() => void register()} className="rounded-full bg-emerald-800 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">{registering ? '登録中…' : submitted ? '保存を再試行' : 'この内容で登録する'}</button>
      </div>
    </section>}

    <datalist id="job-entry-clientType">{['個人', '法人', 'ホテル', '旅行代理店', 'ハイヤー会社', 'アプリ', 'その他'].map(value => <option key={value} value={value} />)}</datalist>
    <datalist id="job-entry-class">{classOptions.map(value => <option key={value} value={value} />)}</datalist>
    <datalist id="job-entry-vehicle">{vehicles.map(vehicle => <option key={vehicle.id} value={vehicleChoice(vehicle)}>{vehicle.plateNo}</option>)}</datalist>
    <datalist id="job-entry-driver">{drivers.filter(driver => driver.status === 'active').map(driver => <option key={driver.id} value={driverChoice(driver)} />)}</datalist>
    {pickerRow && <CustomerPicker key={pickerRow} row={rows.find(row => row.id === pickerRow)!} customers={customers}
      onClose={() => setPickerRow(null)} onSelect={link => {
        onRowsChange(rows.map(row => row.id === pickerRow ? selectJobCustomer(row, link, customers) : row));
        setPickerRow(null); setSuccess(null); setError(''); setPasteUndo(null);
      }} />}
  </section>;
}

function CustomerPicker({ row, customers, onSelect, onClose }: { row: JobEntryRow; customers: PartnerLedgerData; onSelect: (link: JobCustomerLink) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [partnerId, setPartnerId] = useState(row.customer?.partnerId ?? '');
  const [officeId, setOfficeId] = useState(row.customer?.officeId ?? '');
  const [contactId, setContactId] = useState(row.customer?.contactId ?? '');
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => previous?.focus();
  }, []);
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  const words = normalize(search).split(' ').filter(Boolean);
  const matches = customers.partners.filter(partner => {
    const text = normalize([partner.displayName, partner.officialName, partner.nameKana, partner.internalId, partner.phone, partner.email,
      ...customers.offices.filter(office => office.partnerId === partner.id).flatMap(office => [office.displayName, office.phone, office.email]),
      ...customers.contacts.filter(contact => contact.partnerId === partner.id).flatMap(contact => [contact.name, contact.nameKana, contact.phone, contact.email])].filter(Boolean).join(' '));
    return words.every(word => text.includes(word));
  });
  const partner = customers.partners.find(item => item.id === partnerId);
  const offices = customers.offices.filter(item => item.partnerId === partnerId);
  const contacts = customers.contacts.filter(item => item.partnerId === partnerId && (officeId ? item.affiliationType === 'office' && item.affiliationId === officeId : item.affiliationType === 'partner' && item.affiliationId === partnerId));
  const link = { partnerId, ...(officeId ? { officeId } : {}), ...(contactId ? { contactId } : {}) };
  const preview = partner ? selectJobCustomer(row, link, customers) : undefined;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key === 'Tab') {
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,select');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="customer-picker-title" className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-auto rounded-2xl bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between gap-4"><h3 id="customer-picker-title" className="text-lg font-bold text-slate-900">取引先台帳から選択</h3><button type="button" aria-label="お客様の選択を閉じる" onClick={onClose} className="rounded-lg border px-3 py-1">閉じる</button></div>
      <label className="block text-sm font-semibold text-slate-700">取引先・担当者・電話・メールで検索<input type="search" value={search} onChange={event => setSearch(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 p-3" /></label>
      <div className="max-h-48 space-y-2 overflow-auto" aria-label="取引先の候補">{matches.length ? matches.map(item => <button type="button" key={item.id} aria-pressed={partnerId === item.id}
        onClick={() => { setPartnerId(item.id); setOfficeId(''); setContactId(''); }} className={`block w-full rounded-lg border p-3 text-left text-sm ${partnerId === item.id ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200'}`}>
        <span className="font-semibold">{item.displayName}</span><span className="ml-2 text-xs text-slate-500">{item.internalId}</span><span className="mt-1 block text-xs text-slate-500">{[item.phone, item.email].filter(Boolean).join(' ／ ')}</span>
      </button>) : <p className="p-3 text-sm text-slate-500">該当する取引先はありません。新規のお客様は入力画面に直接記入できます。</p>}</div>
      {partner && <div className="space-y-3 border-t pt-4">
        <label className="block text-sm font-semibold text-slate-700">拠点<select value={officeId} onChange={event => { setOfficeId(event.target.value); setContactId(''); }} className="mt-1 w-full rounded-lg border p-2"><option value="">本社・代表窓口</option>{offices.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></label>
        <label className="block text-sm font-semibold text-slate-700">担当者<select value={contactId} onChange={event => setContactId(event.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">担当者を指定しない</option>{contacts.map(item => <option key={item.id} value={item.id}>{item.name}（{item.role}）</option>)}</select></label>
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">電話：{preview?.values.phone || '未登録'}<br />メール：{preview?.values.email || '未登録'}</p>
        <p className="text-xs text-slate-500">連絡先は仕事ごとに変更できます。変更した内容は取引先台帳へ上書きしません。</p>
      </div>}
      <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-full border px-4 py-2 text-sm">キャンセル</button><button type="button" disabled={!customerRecords(link, customers)} onClick={() => onSelect(link)} className="rounded-full bg-emerald-800 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">この窓口を選ぶ</button></div>
    </div>
  </div>;
}
