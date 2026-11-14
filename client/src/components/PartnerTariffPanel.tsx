import { useState, type FormEvent } from "react";
import type { PartnerRecord, PartnerTariff, TariffAdjustment } from "../data/partners";
import { formatAdjustment, validAdjustment } from "../lib/ledger";

const fieldClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800";
const taxLabels = { included: "税込", excluded: "税抜", unspecified: "税区分未設定" };
const emptyForm = () => ({
  name: "", vehicleClass: "", route: "", baseFare: "", taxTreatment: "unspecified" as PartnerTariff["taxTreatment"],
  discountKind: "none" as TariffAdjustment["kind"], discountValue: "",
  kickbackKind: "none" as TariffAdjustment["kind"], kickbackValue: "",
  validFrom: "", validUntil: "", conditions: ""
});

export default function PartnerTariffPanel({ partner, onSave }: {
  partner: PartnerRecord;
  onSave: (tariffs: PartnerTariff[]) => void;
}) {
  const tariffs = partner.tariffs ?? [];
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  function reset() { setForm(emptyForm()); setEditingId(null); setError(""); setOpen(false); }

  function edit(tariff: PartnerTariff) {
    setForm({
      name: tariff.name, vehicleClass: tariff.vehicleClass ?? "", route: tariff.route ?? "",
      baseFare: tariff.baseFare === undefined ? "" : String(tariff.baseFare), taxTreatment: tariff.taxTreatment,
      discountKind: tariff.discount.kind, discountValue: String(tariff.discount.value),
      kickbackKind: tariff.kickback.kind, kickbackValue: String(tariff.kickback.value),
      validFrom: tariff.validFrom ?? "", validUntil: tariff.validUntil ?? "", conditions: tariff.conditions ?? ""
    });
    setEditingId(tariff.id); setError(""); setOpen(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const baseFare = form.baseFare.trim() === "" ? undefined : Number(form.baseFare);
    const discount = { kind: form.discountKind, value: form.discountKind === "none" ? 0 : Number(form.discountValue) };
    const kickback = { kind: form.kickbackKind, value: form.kickbackKind === "none" ? 0 : Number(form.kickbackValue) };
    if (!form.name.trim()) { setError("タリフ名を入力してください。"); return; }
    if (baseFare !== undefined && (!Number.isSafeInteger(baseFare) || baseFare < 0 || baseFare > 9999999999)) {
      setError("基本料金は0〜9,999,999,999円の整数で入力してください。"); return;
    }
    if (!validAdjustment(discount) || !validAdjustment(kickback) ||
        (form.discountKind !== "none" && !form.discountValue.trim()) ||
        (form.kickbackKind !== "none" && !form.kickbackValue.trim())) {
      setError("値引き・キックバックは円単位の整数、または0〜100%（小数2桁まで）で入力してください。"); return;
    }
    if (form.validFrom && form.validUntil && form.validFrom > form.validUntil) {
      setError("適用終了日は適用開始日以降にしてください。"); return;
    }
    if (editingId && !tariffs.some(tariff => tariff.id === editingId)) {
      setError("編集対象が更新されています。一度キャンセルして確認してください。"); return;
    }
    const tariff: PartnerTariff = {
      id: editingId ?? crypto.randomUUID(), name: form.name.trim(), baseFare,
      vehicleClass: form.vehicleClass.trim() || undefined, route: form.route.trim() || undefined,
      taxTreatment: form.taxTreatment, discount, kickback,
      validFrom: form.validFrom || undefined, validUntil: form.validUntil || undefined,
      conditions: form.conditions.trim() || undefined
    };
    onSave(editingId ? tariffs.map(item => item.id === editingId ? tariff : item) : [...tariffs, tariff]);
    reset();
  }

  return <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5" aria-label="取引先別タリフ">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold text-slate-900">タリフ・取引条件</h3><p className="mt-1 text-xs text-slate-500">{partner.displayName}専用の料金と金銭条件</p></div>
      <button type="button" onClick={() => { reset(); setOpen(true); }} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">タリフを追加</button>
    </div>
    {tariffs.length === 0 && <p className="py-5 text-sm text-slate-500">タリフはまだ登録されていません。</p>}
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {tariffs.map(tariff => <article key={tariff.id} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3"><h4 className="font-semibold">{tariff.name}</h4><button type="button" onClick={() => edit(tariff)} className="shrink-0 text-sm font-semibold text-sky-700">編集</button></div>
        <p className="mt-2 text-xl font-bold text-slate-900">{tariff.baseFare === undefined ? "都度見積" : `${tariff.baseFare.toLocaleString("ja-JP")}円`} <span className="text-xs font-normal text-slate-500">{taxLabels[tariff.taxTreatment]}</span></p>
        <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm text-slate-600">
          <dt>車両区分</dt><dd>{tariff.vehicleClass || "指定なし"}</dd>
          <dt>区間・サービス</dt><dd className="break-words">{tariff.route || "指定なし"}</dd>
          <dt>値引き</dt><dd>{formatAdjustment(tariff.discount)}</dd>
          <dt>キックバック</dt><dd>{formatAdjustment(tariff.kickback)}</dd>
          <dt>適用期間</dt><dd>{tariff.validFrom || "開始指定なし"} 〜 {tariff.validUntil || "終了指定なし"}</dd>
        </dl>
        {tariff.conditions && <p className="mt-3 whitespace-pre-wrap break-words border-t border-slate-100 pt-3 text-sm text-slate-600">{tariff.conditions}</p>}
      </article>)}
    </div>
    {open && <form onSubmit={submit} className="mt-5 space-y-4 rounded-2xl border border-sky-200 bg-white p-4" aria-label={editingId ? "タリフを編集" : "新規タリフ"}>
      <h4 className="font-semibold">{editingId ? "タリフを編集" : "新規タリフ"}</h4>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-slate-600">タリフ名（必須）<input required maxLength={200} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={fieldClass} placeholder="例：空港送迎・通常料金" /></label>
        <label className="text-xs text-slate-600">車両区分<input maxLength={80} value={form.vehicleClass} onChange={e => setForm({ ...form, vehicleClass: e.target.value })} className={fieldClass} placeholder="例：アルファード" /></label>
        <label className="text-xs text-slate-600">区間・サービス<input maxLength={200} value={form.route} onChange={e => setForm({ ...form, route: e.target.value })} className={fieldClass} placeholder="例：新千歳空港〜ニセコ" /></label>
        <label className="text-xs text-slate-600">基本料金（円・空欄は都度見積）<input type="number" min="0" max="9999999999" step="1" value={form.baseFare} onChange={e => setForm({ ...form, baseFare: e.target.value })} className={fieldClass} /></label>
        <label className="text-xs text-slate-600">基本料金の税区分<select value={form.taxTreatment} onChange={e => setForm({ ...form, taxTreatment: e.target.value as PartnerTariff["taxTreatment"] })} className={fieldClass}>{Object.entries(taxLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {(["discount", "kickback"] as const).map(key => {
          const kind = form[`${key}Kind`];
          return <fieldset key={key} className="rounded-xl border border-slate-200 p-3"><legend className="px-1 text-sm font-semibold">{key === "discount" ? "値引き" : "キックバック"}</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-600">単位<select value={kind} className={fieldClass} onChange={e => setForm({ ...form, [`${key}Kind`]: e.target.value, [`${key}Value`]: "" })}><option value="none">なし</option><option value="percent">率（%）</option><option value="yen">定額（円）</option></select></label>
              <label className="text-xs text-slate-600">{kind === "percent" ? "率（%）" : "金額（円）"}<input type="number" disabled={kind === "none"} required={kind !== "none"} min="0" max={kind === "percent" ? "100" : "9999999999"} step={kind === "percent" ? "0.01" : "1"} value={form[`${key}Value`]} onChange={e => setForm({ ...form, [`${key}Value`]: e.target.value })} className={`${fieldClass} disabled:bg-slate-100`} /></label>
            </div>
          </fieldset>;
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-600">適用開始日<input type="date" value={form.validFrom} onChange={e => setForm({ ...form, validFrom: e.target.value })} className={fieldClass} /></label>
        <label className="text-xs text-slate-600">適用終了日<input type="date" min={form.validFrom || undefined} value={form.validUntil} onChange={e => setForm({ ...form, validUntil: e.target.value })} className={fieldClass} /></label>
      </div>
      <label className="block text-xs text-slate-600">条件・計算基準の補足<textarea rows={3} maxLength={20000} value={form.conditions} onChange={e => setForm({ ...form, conditions: e.target.value })} className={fieldClass} placeholder="例：キックバックは値引き後の税抜運賃を基準。高速代・駐車場代は対象外。" /></label>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex gap-3"><button type="submit" className="rounded-full bg-sky-700 px-4 py-2 text-sm font-semibold text-white">タリフを保存</button><button type="button" onClick={reset} className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-600">キャンセル</button></div>
    </form>}
  </section>;
}
