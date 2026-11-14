import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DriverAptitudeRecord, DriverCompliancePatch, DriverLedgerEntry } from "../data/drivers";
import { aptitudeDueStatus, todayInJapan } from "../lib/ledger";

const fieldClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm";
const buttonClass = "rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
const emptyRecord = () => ({ assessedAt: todayInJapan(), type: "一般診断", institution: "", notes: "", nextDueAt: "" });

export function AptitudeDue({ records }: { records?: DriverAptitudeRecord[] }) {
  const due = aptitudeDueStatus(records);
  return <span className={`inline-flex flex-wrap gap-1 rounded-lg px-2 py-1 text-xs font-medium ${due.tone === "overdue" ? "bg-rose-100 text-rose-800" : due.tone === "soon" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
    次回適性診断：{due.date ?? "未設定"}{due.date && `（${due.label}）`}
  </span>;
}

export default function DriverCompliancePanel({ driver, onUpdate }: {
  driver: DriverLedgerEntry;
  onUpdate: (id: number, patch: DriverCompliancePatch) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; url: string } | null>(null);
  const [confirmPhoto, setConfirmPhoto] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoSelection = useRef(0);
  const mounted = useRef(true);
  const [form, setForm] = useState(emptyRecord);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const records = driver.aptitudeRecords ?? [];

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; photoSelection.current++; };
  }, []);
  useEffect(() => () => {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.url);
  }, [pendingPhoto]);

  function cancelPhoto() {
    photoSelection.current++;
    setPendingPhoto(null);
    setConfirmPhoto(false);
    setPhotoError("");
  }

  async function selectPhoto(file: File) {
    const selection = ++photoSelection.current;
    setPhotoError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setPhotoError("JPEG・PNG・WebPの画像を5MB以内で選んでください。"); return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      bitmap.close();
      if (!mounted.current || selection !== photoSelection.current) return;
      setPendingPhoto({ file, url: URL.createObjectURL(file) });
      setConfirmPhoto(false);
    } catch {
      if (mounted.current && selection === photoSelection.current) setPhotoError("写真を読み込めませんでした。別の画像を選んでください。");
    }
  }

  async function savePhoto() {
    if (!pendingPhoto || busy || !confirmPhoto) return;
    setPhotoError("");
    setBusy(true);
    const file = pendingPhoto.file;
    try {
      const response = await fetch("/api/files", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": file.type, "X-Filename": encodeURIComponent(file.name) }, body: file
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "写真を保存できませんでした。");
      // A response after closing this driver's detail must not change its photo.
      if (!mounted.current) return;
      onUpdate(driver.id, { facePhoto: { id: result.id, type: "photo", name: result.name, uri: `${result.url}?inline=1`, uploadedAt: result.addedAt } });
      cancelPhoto();
    } catch (cause) {
      if (mounted.current) setPhotoError(cause instanceof Error ? cause.message : "写真を保存できませんでした。");
    } finally { if (mounted.current) setBusy(false); }
  }

  function reset() { setEditingId(null); setForm(emptyRecord()); setError(""); }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.type.trim() || !form.assessedAt || form.assessedAt > todayInJapan()) {
      setError("診断区分と受診日を確認してください。"); return;
    }
    if (form.nextDueAt && form.nextDueAt < form.assessedAt) {
      setError("次回予定日は受診日以降にしてください。"); return;
    }
    if (editingId && !records.some(record => record.id === editingId)) {
      setError("編集対象の記録が更新されています。一度キャンセルして確認してください。"); return;
    }
    const entry: DriverAptitudeRecord = {
      id: editingId ?? crypto.randomUUID(), type: form.type.trim(), assessedAt: form.assessedAt,
      institution: form.institution.trim() || undefined, notes: form.notes.trim() || undefined,
      nextDueAt: form.nextDueAt || undefined
    };
    onUpdate(driver.id, { aptitudeRecords: editingId ? records.map(record => record.id === editingId ? entry : record) : [...records, entry] });
    reset();
  }

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4" aria-label="顔写真">
      <h3 className="text-sm font-semibold text-slate-800">顔写真</h3>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {driver.facePhoto?.uri ? <img src={driver.facePhoto.uri} alt={`${driver.name}の顔写真`} className="h-36 w-28 rounded-xl border border-slate-200 bg-white object-contain" />
          : <div className="flex h-36 w-28 items-center justify-center rounded-xl border border-dashed border-slate-300 text-xs text-slate-500">写真未登録</div>}
        <div className="min-w-0 flex-1 space-y-2 text-xs text-slate-500">
          <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="顔写真を選択" disabled={busy} className="hidden" onChange={event => {
              const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
              if (file) void selectPhoto(file);
            }} />
          {!confirmPhoto && <button type="button" disabled={busy} className={buttonClass} onClick={() => photoInput.current?.click()}>
            {pendingPhoto ? "別の写真を選ぶ" : driver.facePhoto ? "写真を変更" : "顔写真を登録"}
          </button>}
          <p>JPEG・PNG・WebP、5MBまで</p>
          {driver.facePhoto?.uploadedAt && <p>登録日：{driver.facePhoto.uploadedAt.slice(0, 10)}</p>}
          {busy && <p role="status">写真を保存中…</p>}
          {photoError && <p role="alert" className="text-rose-700">{photoError}</p>}
        </div>
      </div>
      {pendingPhoto && <div className="mt-4 rounded-xl border border-slate-300 bg-white p-4" role="region" aria-label={confirmPhoto ? "顔写真の保存確認" : "選択した写真"}>
        <h4 className="text-sm font-semibold text-slate-900">{confirmPhoto ? driver.facePhoto ? "この変更を保存しますか？" : "この写真を登録しますか？" : "選択した写真を確認"}</h4>
        <p className="mt-1 text-sm text-slate-600">{driver.name}</p>
        <div className="mt-3 flex flex-wrap gap-5">
          {confirmPhoto && driver.facePhoto?.uri && <div>
            <p className="mb-2 text-xs text-slate-600">現在の写真</p>
            <img src={driver.facePhoto.uri} alt="変更前の顔写真" className="h-36 w-28 rounded-xl border border-slate-200 object-contain" />
          </div>}
          <div>
            <p className="mb-2 text-xs text-slate-600">{driver.facePhoto ? "変更後の写真" : "登録する写真"}</p>
            <img src={pendingPhoto.url} alt="選択した顔写真のプレビュー" className="h-36 w-28 rounded-xl border border-slate-200 object-contain" />
          </div>
        </div>
        <p className="mt-2 break-all text-xs text-slate-500">{pendingPhoto.file.name}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {confirmPhoto ? <>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => void savePhoto()}>保存する</button>
            <button type="button" disabled={busy} className="text-sm text-slate-600 disabled:opacity-50" onClick={() => { setConfirmPhoto(false); setPhotoError(""); }}>戻る</button>
          </> : <button type="button" className={buttonClass} onClick={() => setConfirmPhoto(true)}>確認へ進む</button>}
          <button type="button" disabled={busy} className="text-sm text-slate-600 disabled:opacity-50" onClick={cancelPhoto}>キャンセル</button>
        </div>
      </div>}
    </section>

    <section className="rounded-2xl border border-slate-200 p-4" aria-label="適性診断">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-800">適性診断</h3>
        <AptitudeDue records={records} />
      </div>
      <p className="mt-2 text-xs text-slate-500">最新の受診記録に登録した次回予定日を表示します。</p>
      {records.length === 0 && <p className="py-4 text-sm text-slate-500">受診記録はまだありません。</p>}
      <ul className="mt-3 space-y-3">
        {[...records].reverse().sort((a, b) => b.assessedAt.localeCompare(a.assessedAt)).map(record => <li key={record.id} className="rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">{record.assessedAt} ／ {record.type}</p>
              <p className="mt-1 text-xs text-slate-600">受診機関：{record.institution || "未登録"} ／ 次回：{record.nextDueAt || "未設定"}</p>
              {record.notes && <p className="mt-2 whitespace-pre-wrap break-words text-slate-600">{record.notes}</p>}
            </div>
            <button type="button" className="shrink-0 text-sm font-semibold text-sky-700" onClick={() => {
              setEditingId(record.id); setError("");
              setForm({ assessedAt: record.assessedAt, type: record.type, institution: record.institution ?? "", notes: record.notes ?? "", nextDueAt: record.nextDueAt ?? "" });
            }}>編集</button>
          </div>
        </li>)}
      </ul>
      <form onSubmit={submit} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
        <h4 className="text-sm font-semibold">{editingId ? "受診記録を編集" : "受診記録を追加"}</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">受診日<input type="date" required max={todayInJapan()} className={fieldClass} value={form.assessedAt} onChange={e => setForm({ ...form, assessedAt: e.target.value })} /></label>
          <label className="text-xs text-slate-600">診断区分<input required maxLength={80} list="aptitude-types" className={fieldClass} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} /></label>
          <datalist id="aptitude-types">{["一般診断", "初任診断", "適齢診断", "特定診断Ⅰ", "特定診断Ⅱ"].map(type => <option key={type} value={type} />)}</datalist>
          <label className="text-xs text-slate-600">受診機関<input maxLength={200} className={fieldClass} value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })} /></label>
          <label className="text-xs text-slate-600">次回予定日<input type="date" min={form.assessedAt} className={fieldClass} value={form.nextDueAt} onChange={e => setForm({ ...form, nextDueAt: e.target.value })} /></label>
        </div>
        <label className="block text-xs text-slate-600">結果・所見・対応メモ<textarea rows={3} maxLength={20000} className={fieldClass} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex gap-3">
          <button className={buttonClass} type="submit">{editingId ? "受診記録を更新" : "受診記録を保存"}</button>
          {editingId && <button type="button" onClick={reset} className="text-sm text-slate-600">キャンセル</button>}
        </div>
      </form>
    </section>
  </div>;
}
