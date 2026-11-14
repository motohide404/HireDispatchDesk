import { useRef, useState, type FormEvent } from 'react';
import { saveStaffMember, usePersistentState } from '../lib/store';
import { emptyStaff, staffRoles, type StaffMember } from '../lib/staff';
const input = 'mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm';
const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50';
const fresh = (): StaffMember => ({ id: crypto.randomUUID(), code: '', name: '', officeName: '', role: 'office', active: true, appointmentDate: '', qualification: '' });
export default function StaffLedgerPage() {
  const [members] = usePersistentState<StaffMember[]>('staffMembers', emptyStaff);
  const [draft, setDraft] = useState<StaffMember | null>(null);
  const [original, setOriginal] = useState<StaffMember | undefined>();
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function open(member?: StaffMember) { setOriginal(member); setDraft(member ? { ...member } : fresh()); setError(''); setNotice(''); setPending(false); }
  function patch(key: keyof StaffMember, value: string | boolean) { setDraft(previous => previous ? { ...previous, [key]: value } : previous); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!draft || lock.current) return;
    const member = { ...draft, code: draft.code.trim(), name: draft.name.trim(), officeName: draft.officeName.trim(), qualification: draft.qualification.trim() };
    if (!member.code || !member.name || !member.officeName || ((member.role !== 'office' && !member.appointmentDate) || (member.maintenanceManager && !member.maintenanceAppointmentDate))) { setError('職員コード・氏名・営業所と、点呼担当・整備管理者の場合はそれぞれの選任日を入力してください。'); return; }
    if (members.some(row => row.id !== member.id && row.code === member.code)) { setError('同じ職員コードが登録されています。'); return; }
    lock.current = true; setBusy(true); setError(''); setDraft(member); setPending(true);
    try { await saveStaffMember(member, original); setDraft(null); setPending(false); setNotice('職員情報を保存しました。'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存できませんでした。'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="mx-auto max-w-6xl space-y-5 px-4 py-6"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold">職員台帳</h2><p className="mt-1 text-sm text-slate-600">運行管理者・補助者・事務員を登録します。整備管理者は兼任設定できます。</p></div><button className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => open()}>職員を登録</button></div>
    <p className="text-xs text-slate-600">役割・選任情報は会社で確認した内容を登録してください。台帳への登録は、資格の取得・選任や本人ログインを代行するものではありません。</p>
    {notice && <p role="status" className="text-sm text-emerald-800">{notice}</p>}
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-100"><tr>{['コード・氏名', '営業所', '役割・選任日', '状態', '操作'].map(text => <th className="p-3" key={text}>{text}</th>)}</tr></thead><tbody>{members.map(member => <tr className="border-t border-slate-200" key={member.id}><td className="p-3">{member.code} ／ {member.name}</td><td className="p-3">{member.officeName}</td><td className="p-3">{staffRoles[member.role]}{member.maintenanceManager && ' ／ 整備管理者'}<br />{member.appointmentDate || '—'}{member.maintenanceManager && <p>整備管理者選任：{member.maintenanceAppointmentDate}</p>}</td><td className="p-3">{member.active ? '在籍' : '利用停止'}</td><td className="p-3"><button className={button} onClick={() => open(member)}>職員情報を編集</button></td></tr>)}</tbody></table>{!members.length && <p className="p-5 text-sm text-slate-500">職員は未登録です。最初に運行管理者・補助者を登録してください。</p>}</div>
    {draft && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-4"><form onSubmit={save} className="mx-auto my-6 max-w-xl space-y-4 rounded-2xl bg-white p-5" role="dialog" aria-modal="true" aria-label="職員の登録・編集"><h3 className="font-bold">職員の登録・編集</h3><fieldset disabled={busy || pending} className="space-y-3">{([['code', '職員コード'], ['name', '職員氏名'], ['officeName', '所属営業所']] as const).map(([key, label]) => <label className="block text-sm" key={key}>{label}<input className={input} value={draft[key]} onChange={event => patch(key, event.target.value)} maxLength={200} required /></label>)}
    <label className="block text-sm">職員の役割<select className={input} value={draft.role} onChange={event => patch('role', event.target.value)}>{Object.entries(staffRoles).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label className="block text-sm">選任日<input className={input} type="date" value={draft.appointmentDate} onChange={event => patch('appointmentDate', event.target.value)} required={draft.role !== 'office'} /></label>
    <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={draft.maintenanceManager ?? false} onChange={event => patch('maintenanceManager', event.target.checked)} />整備管理者として選任されている</label>
    {draft.maintenanceManager && <label className="block text-sm">整備管理者の選任日<input className={input} type="date" required value={draft.maintenanceAppointmentDate ?? ''} onChange={event => patch('maintenanceAppointmentDate', event.target.value)} /></label>}
    <label className="block text-sm">資格者証・基礎講習等の確認メモ<input className={input} value={draft.qualification} onChange={event => patch('qualification', event.target.value)} maxLength={200} /></label>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={event => patch('active', event.target.checked)} />在籍・利用中</label></fieldset>
    {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}<div className="flex justify-end gap-2"><button type="button" className={button} disabled={busy} onClick={() => setDraft(null)}>閉じる</button><button className={button} disabled={busy}>{busy ? '保存中…' : pending ? '同じ内容で再試行' : '職員情報を保存'}</button></div></form></div>}
  </section>;
}
