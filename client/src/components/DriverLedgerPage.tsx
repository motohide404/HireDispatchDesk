import { FormEvent, useEffect, useMemo, useState } from "react";
import type {
  DriverDocumentInput,
  DriverDocumentType,
  DriverLedgerEntry,
  DriverLedgerInput
} from "../data/drivers";

const documentTypeLabels: Record<DriverDocumentType, string> = {
  resume: "履歴書",
  medical: "健康診断",
  license: "免許",
  photo: "写真",
  other: "その他"
};

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function formatDate(value?: string) {
  if (!value) return "未登録";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return dateFormatter.format(date);
}

function toOptional(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

type DriverLedgerPageProps = {
  drivers: DriverLedgerEntry[];
  onAddDriver: (input: DriverLedgerInput) => void;
  onArchiveDriver: (id: number) => void;
  onRestoreDriver: (id: number) => void;
  onAddDocument: (driverId: number, document: DriverDocumentInput) => void;
  onBackToDispatch?: () => void;
};

type NewDriverFormState = {
  tenantId: string;
  officeId: string;
  code: string;
  name: string;
  nameKana: string;
  birthDate: string;
  address: string;
  phone: string;
  email: string;
  licenseClass: string;
  licenseNumber: string;
  licenseExpiry: string;
  employmentType: string;
  lastMedicalCheckAt: string;
  medicalNotes: string;
  alcoholCheckMethod: string;
  lastAlcoholCheckAt: string;
  extUsageCountMonth: string;
  monthlyJobCount: string;
  currentDispatchNumber: string;
  notes: string;
};

const emptyNewDriverForm: NewDriverFormState = {
  tenantId: "tenant-001",
  officeId: "",
  code: "",
  name: "",
  nameKana: "",
  birthDate: "",
  address: "",
  phone: "",
  email: "",
  licenseClass: "",
  licenseNumber: "",
  licenseExpiry: "",
  employmentType: "正社員",
  lastMedicalCheckAt: "",
  medicalNotes: "",
  alcoholCheckMethod: "",
  lastAlcoholCheckAt: "",
  extUsageCountMonth: "0",
  monthlyJobCount: "0",
  currentDispatchNumber: "0",
  notes: ""
};

export default function DriverLedgerPage({
  drivers,
  onAddDriver,
  onArchiveDriver,
  onRestoreDriver,
  onAddDocument,
  onBackToDispatch
}: DriverLedgerPageProps) {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const active = drivers.find((driver) => driver.status === "active");
    return active?.id ?? drivers[0]?.id ?? null;
  });
  const [newDriverForm, setNewDriverForm] = useState<NewDriverFormState>(emptyNewDriverForm);
  const [documentForm, setDocumentForm] = useState({
    name: "",
    type: "resume" as DriverDocumentType,
    uri: "",
    uploadedAt: ""
  });
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    if (!selectedId) {
      const first = drivers.find((driver) => driver.status === "active") ?? drivers[0];
      setSelectedId(first?.id ?? null);
      return;
    }
    const exists = drivers.some((driver) => driver.id === selectedId);
    if (!exists) {
      const first = drivers.find((driver) => driver.status === "active") ?? drivers[0];
      setSelectedId(first?.id ?? null);
    }
  }, [drivers, selectedId]);

  useEffect(() => {
    setDocumentForm({ name: "", type: "resume", uri: "", uploadedAt: "" });
  }, [selectedId]);

  const filteredDrivers = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return drivers.filter((driver) => {
      if (!showArchived && driver.status === "archived") {
        return false;
      }
      if (!normalized) {
        return true;
      }
      return (
        driver.name.toLowerCase().includes(normalized) ||
        driver.nameKana.toLowerCase().includes(normalized) ||
        driver.code.toLowerCase().includes(normalized) ||
        driver.officeId.toLowerCase().includes(normalized)
      );
    });
  }, [drivers, search, showArchived]);

  useEffect(() => {
    if (!selectedId && filteredDrivers.length > 0) {
      setSelectedId(filteredDrivers[0].id);
      return;
    }
    if (selectedId && !filteredDrivers.some((driver) => driver.id === selectedId)) {
      setSelectedId(filteredDrivers[0]?.id ?? null);
    }
  }, [filteredDrivers, selectedId]);

  const activeDriverCount = useMemo(
    () => drivers.filter((driver) => driver.status === "active").length,
    [drivers]
  );
  const archivedDriverCount = useMemo(
    () => drivers.filter((driver) => driver.status === "archived").length,
    [drivers]
  );
  const expiringLicenses = useMemo(() => {
    const today = new Date();
    return drivers.filter((driver) => {
      if (!driver.licenseExpiry) return false;
      const expiry = new Date(driver.licenseExpiry);
      if (Number.isNaN(expiry.getTime())) return false;
      const diff = (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 60;
    }).length;
  }, [drivers]);

  const selectedDriver = selectedId != null ? drivers.find((driver) => driver.id === selectedId) ?? null : null;

  useEffect(() => {
    if (!selectedDriver) {
      setIsDetailOpen(false);
    }
  }, [selectedDriver]);

  const handleNewDriverChange = <K extends keyof NewDriverFormState>(field: K, value: NewDriverFormState[K]) => {
    setNewDriverForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmitNewDriver = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newDriverForm.name || !newDriverForm.code || !newDriverForm.licenseClass) {
      return;
    }
    onAddDriver({
      tenantId: newDriverForm.tenantId,
      officeId: newDriverForm.officeId,
      code: newDriverForm.code,
      name: newDriverForm.name,
      nameKana: newDriverForm.nameKana,
      birthDate: toOptional(newDriverForm.birthDate),
      address: toOptional(newDriverForm.address),
      phone: toOptional(newDriverForm.phone),
      email: toOptional(newDriverForm.email),
      licenseClass: newDriverForm.licenseClass,
      licenseNumber: toOptional(newDriverForm.licenseNumber),
      licenseExpiry: toOptional(newDriverForm.licenseExpiry),
      employmentType: newDriverForm.employmentType,
      lastMedicalCheckAt: toOptional(newDriverForm.lastMedicalCheckAt),
      medicalNotes: toOptional(newDriverForm.medicalNotes),
      alcoholCheckMethod: toOptional(newDriverForm.alcoholCheckMethod),
      lastAlcoholCheckAt: toOptional(newDriverForm.lastAlcoholCheckAt),
      extUsageCountMonth: Number(newDriverForm.extUsageCountMonth ?? "0") || 0,
      monthlyJobCount: Number(newDriverForm.monthlyJobCount ?? "0") || 0,
      currentDispatchNumber: Number(newDriverForm.currentDispatchNumber ?? "0") || 0,
      notes: toOptional(newDriverForm.notes)
    });
    setNewDriverForm(emptyNewDriverForm);
    setSearch("");
  };

  const handleAddDocument = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDriver) return;
    if (!documentForm.name.trim()) return;
    onAddDocument(selectedDriver.id, {
      name: documentForm.name.trim(),
      type: documentForm.type,
      uri: toOptional(documentForm.uri ?? ""),
      uploadedAt: documentForm.uploadedAt?.trim() || new Date().toISOString().slice(0, 10)
    });
    setDocumentForm({ name: "", type: "resume", uri: "", uploadedAt: "" });
  };

  return (
    <div className="min-h-full bg-slate-100 pb-12">
      <div className="mx-auto w-full max-w-6xl px-6 pt-10">
        <div className="flex flex-col gap-4 pb-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Driver Ledger</p>
              <h1 className="text-2xl font-bold text-slate-900">運転者台帳</h1>
              <p className="mt-1 text-sm text-slate-600">
                ドライバーの基本情報・免許・点呼記録・資料を一元管理し、配車ボードと連携します。
              </p>
            </div>
            <div className="flex gap-2">
              {onBackToDispatch && (
                <button
                  type="button"
                  onClick={onBackToDispatch}
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:text-slate-800"
                >
                  配車ボードに戻る
                </button>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">在籍ドライバー</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{activeDriverCount} 名</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">アーカイブ済</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{archivedDriverCount} 名</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">免許期限 60日以内</p>
              <p className="mt-1 text-2xl font-semibold text-amber-600">{expiringLicenses} 名</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold text-slate-800">運転者リスト</h2>
                  <label className="flex items-center gap-1 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-slate-600 focus:ring-slate-500"
                      checked={showArchived}
                      onChange={(e) => setShowArchived(e.target.checked)}
                    />
                    アーカイブも表示
                  </label>
                </div>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="氏名・カナ・コード・所属で検索"
                  className="w-full rounded-2xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>
            <ul className="max-h-[560px] space-y-1 overflow-auto px-2 py-3">
              {filteredDrivers.length === 0 && (
                <li className="px-3 py-12 text-center text-sm text-slate-500">該当するドライバーが見つかりません。</li>
              )}
            {filteredDrivers.map((driver) => {
              const isSelected = driver.id === selectedId;
              const statusLabel = driver.status === "archived" ? "アーカイブ" : "稼働中";
              return (
                <li key={driver.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(driver.id);
                        setIsDetailOpen(true);
                      }}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? "border-slate-600 bg-slate-900 text-white shadow"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold">{driver.name}</p>
                          <p className={`text-xs ${isSelected ? "text-slate-200" : "text-slate-500"}`}>
                            {driver.nameKana} ／ {driver.code} ／ {driver.officeId || "所属未設定"}
                          </p>
                        </div>
                        <span
                          className={`text-[11px] font-semibold ${
                            driver.status === "archived"
                              ? "rounded-full bg-slate-200 px-2 py-0.5 text-slate-600"
                              : "rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    </button>
                  </li>
              );
            })}
          </ul>
        </section>

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-5">
              <h2 className="text-lg font-semibold text-slate-800">新規ドライバー登録</h2>
              <p className="text-xs text-slate-500">基本情報と免許・健康情報を入力し、ドライバープールへ追加します。</p>
            </div>
            <form className="max-h-[720px] space-y-4 overflow-auto px-6 py-6" onSubmit={handleSubmitNewDriver}>
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-code">
                      ドライバーコード
                    </label>
                    <input
                      id="new-code"
                      type="text"
                      value={newDriverForm.code}
                      onChange={(e) => handleNewDriverChange("code", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-office">
                      所属営業所
                    </label>
                    <input
                      id="new-office"
                      type="text"
                      value={newDriverForm.officeId}
                      onChange={(e) => handleNewDriverChange("officeId", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      placeholder="例）tokyo-hq"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-name">
                      氏名
                    </label>
                    <input
                      id="new-name"
                      type="text"
                      value={newDriverForm.name}
                      onChange={(e) => handleNewDriverChange("name", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      placeholder="例）山田 太郎"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-kana">
                      氏名（カナ）
                    </label>
                    <input
                      id="new-kana"
                      type="text"
                      value={newDriverForm.nameKana}
                      onChange={(e) => handleNewDriverChange("nameKana", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      placeholder="ヤマダ タロウ"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-birth">
                      生年月日
                    </label>
                    <input
                      id="new-birth"
                      type="date"
                      value={newDriverForm.birthDate}
                      onChange={(e) => handleNewDriverChange("birthDate", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-employment">
                      就業区分
                    </label>
                    <select
                      id="new-employment"
                      value={newDriverForm.employmentType}
                      onChange={(e) => handleNewDriverChange("employmentType", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      <option value="正社員">正社員</option>
                      <option value="嘱託">嘱託</option>
                      <option value="契約">契約</option>
                      <option value="業務委託">業務委託</option>
                      <option value="アルバイト">アルバイト</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-address">
                    住所
                  </label>
                  <input
                    id="new-address"
                    type="text"
                    value={newDriverForm.address}
                    onChange={(e) => handleNewDriverChange("address", e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-phone">
                      電話番号
                    </label>
                    <input
                      id="new-phone"
                      type="tel"
                      value={newDriverForm.phone}
                      onChange={(e) => handleNewDriverChange("phone", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-email">
                      メールアドレス
                    </label>
                    <input
                      id="new-email"
                      type="email"
                      value={newDriverForm.email}
                      onChange={(e) => handleNewDriverChange("email", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-license-class">
                      免許区分
                    </label>
                    <input
                      id="new-license-class"
                      type="text"
                      value={newDriverForm.licenseClass}
                      onChange={(e) => handleNewDriverChange("licenseClass", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      placeholder="例）第二種中型"
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-license-number">
                      免許証番号
                    </label>
                    <input
                      id="new-license-number"
                      type="text"
                      value={newDriverForm.licenseNumber}
                      onChange={(e) => handleNewDriverChange("licenseNumber", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-license-expiry">
                      免許有効期限
                    </label>
                    <input
                      id="new-license-expiry"
                      type="date"
                      value={newDriverForm.licenseExpiry}
                      onChange={(e) => handleNewDriverChange("licenseExpiry", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-medical-date">
                      最終健康診断日
                    </label>
                    <input
                      id="new-medical-date"
                      type="date"
                      value={newDriverForm.lastMedicalCheckAt}
                      onChange={(e) => handleNewDriverChange("lastMedicalCheckAt", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-medical-notes">
                    健康メモ
                  </label>
                  <textarea
                    id="new-medical-notes"
                    value={newDriverForm.medicalNotes}
                    onChange={(e) => handleNewDriverChange("medicalNotes", e.target.value)}
                    className="h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-alcohol-method">
                      点呼（アルコール）方法
                    </label>
                    <input
                      id="new-alcohol-method"
                      type="text"
                      value={newDriverForm.alcoholCheckMethod}
                      onChange={(e) => handleNewDriverChange("alcoholCheckMethod", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                      placeholder="例）アルコールチェッカー"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-alcohol-date">
                      最終点呼日
                    </label>
                    <input
                      id="new-alcohol-date"
                      type="date"
                      value={newDriverForm.lastAlcoholCheckAt}
                      onChange={(e) => handleNewDriverChange("lastAlcoholCheckAt", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-ext-usage">
                      当月拡張使用回数
                    </label>
                    <input
                      id="new-ext-usage"
                      type="number"
                      min={0}
                      value={newDriverForm.extUsageCountMonth}
                      onChange={(e) => handleNewDriverChange("extUsageCountMonth", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-monthly-jobs">
                      今月ジョブ実績
                    </label>
                    <input
                      id="new-monthly-jobs"
                      type="number"
                      min={0}
                      value={newDriverForm.monthlyJobCount}
                      onChange={(e) => handleNewDriverChange("monthlyJobCount", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-current-dispatch">
                      拘束（稼働）件数
                    </label>
                    <input
                      id="new-current-dispatch"
                      type="number"
                      min={0}
                      value={newDriverForm.currentDispatchNumber}
                      onChange={(e) => handleNewDriverChange("currentDispatchNumber", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="new-notes">
                    備考
                  </label>
                  <textarea
                    id="new-notes"
                    value={newDriverForm.notes}
                    onChange={(e) => handleNewDriverChange("notes", e.target.value)}
                    className="h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>
              <div className="pt-2">
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-slate-700"
                >
                  ドライバーを登録
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
      {selectedDriver && isDetailOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4 py-6"
          role="dialog"
          aria-modal="true"
          aria-label="ドライバー詳細"
          onClick={() => setIsDetailOpen(false)}
        >
          <div
            className="relative flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">台帳詳細</h2>
                <p className="text-xs text-slate-500">選択したドライバーの詳細情報と資料フォルダーを表示します。</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedDriver.status === "active" ? (
                  <button
                    type="button"
                    onClick={() => onArchiveDriver(selectedDriver.id)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-rose-400 hover:text-rose-600"
                  >
                    アーカイブ
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onRestoreDriver(selectedDriver.id)}
                    className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-100"
                  >
                    復帰
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsDetailOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                  aria-label="閉じる"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">基本情報</h3>
                    <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-2 text-sm text-slate-700">
                      <dt className="text-slate-500">コード</dt>
                      <dd>{selectedDriver.code}</dd>
                      <dt className="text-slate-500">氏名</dt>
                      <dd>{selectedDriver.name}</dd>
                      <dt className="text-slate-500">カナ</dt>
                      <dd>{selectedDriver.nameKana}</dd>
                      <dt className="text-slate-500">所属</dt>
                      <dd>{selectedDriver.officeId || "未設定"}</dd>
                      <dt className="text-slate-500">電話</dt>
                      <dd>{selectedDriver.phone || "未登録"}</dd>
                      <dt className="text-slate-500">メール</dt>
                      <dd>{selectedDriver.email || "未登録"}</dd>
                      <dt className="text-slate-500">住所</dt>
                      <dd>{selectedDriver.address || "未登録"}</dd>
                      <dt className="text-slate-500">生年月日</dt>
                      <dd>{formatDate(selectedDriver.birthDate)}</dd>
                      <dt className="text-slate-500">就業区分</dt>
                      <dd>{selectedDriver.employmentType}</dd>
                    </dl>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">免許・点呼情報</h3>
                    <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-2 text-sm text-slate-700">
                      <dt className="text-slate-500">免許区分</dt>
                      <dd>{selectedDriver.licenseClass}</dd>
                      <dt className="text-slate-500">免許証番号</dt>
                      <dd>{selectedDriver.licenseNumber || "未登録"}</dd>
                      <dt className="text-slate-500">免許有効期限</dt>
                      <dd>{formatDate(selectedDriver.licenseExpiry)}</dd>
                      <dt className="text-slate-500">最終健診日</dt>
                      <dd>{formatDate(selectedDriver.lastMedicalCheckAt)}</dd>
                      <dt className="text-slate-500">健診メモ</dt>
                      <dd>{selectedDriver.medicalNotes || "-"}</dd>
                      <dt className="text-slate-500">点呼方法</dt>
                      <dd>{selectedDriver.alcoholCheckMethod || "未設定"}</dd>
                      <dt className="text-slate-500">最終点呼</dt>
                      <dd>{formatDate(selectedDriver.lastAlcoholCheckAt)}</dd>
                    </dl>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">稼働状況</h3>
                    <div className="mt-2 grid grid-cols-3 gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                        <p className="text-[11px] text-slate-500">今月拡張</p>
                        <p className="text-base font-semibold text-slate-800">{selectedDriver.extUsageCountMonth} 回</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                        <p className="text-[11px] text-slate-500">今月実績</p>
                        <p className="text-base font-semibold text-slate-800">{selectedDriver.monthlyJobCount} 件</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center">
                        <p className="text-[11px] text-slate-500">稼働回数</p>
                        <p className="text-base font-semibold text-slate-800">{selectedDriver.currentDispatchNumber} 件</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">資料フォルダー</h3>
                    <div className="mt-2 space-y-3">
                      <ul className="space-y-2 text-sm text-slate-700">
                        {selectedDriver.documents.length === 0 && (
                          <li className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                            添付資料は登録されていません。
                          </li>
                        )}
                        {selectedDriver.documents.map((doc) => (
                          <li
                            key={doc.id}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-800">{doc.name}</p>
                                <p className="text-xs text-slate-500">
                                  {documentTypeLabels[doc.type]} ／ 登録日：{formatDate(doc.uploadedAt)}
                                </p>
                                {doc.notes && <p className="mt-1 text-xs text-slate-500">メモ：{doc.notes}</p>}
                                {doc.uri && (
                                  <a
                                    href={doc.uri}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 inline-block text-xs font-medium text-sky-600 hover:text-sky-700"
                                  >
                                    資料を開く
                                  </a>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <form className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleAddDocument}>
                        <h4 className="text-sm font-semibold text-slate-700">資料を追加</h4>
                        <div className="mt-3 grid gap-3">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="doc-name">
                                資料名
                              </label>
                              <input
                                id="doc-name"
                                type="text"
                                value={documentForm.name}
                                onChange={(e) => setDocumentForm((prev) => ({ ...prev, name: e.target.value }))}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                                placeholder="例）履歴書 2024"
                                required
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="doc-type">
                                区分
                              </label>
                              <select
                                id="doc-type"
                                value={documentForm.type}
                                onChange={(e) =>
                                  setDocumentForm((prev) => ({
                                    ...prev,
                                    type: e.target.value as DriverDocumentType
                                  }))
                                }
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                              >
                                {Object.entries(documentTypeLabels).map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="doc-uploaded">
                                登録日
                              </label>
                              <input
                                id="doc-uploaded"
                                type="date"
                                value={documentForm.uploadedAt}
                                onChange={(e) => setDocumentForm((prev) => ({ ...prev, uploadedAt: e.target.value }))}
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="doc-uri">
                                閲覧リンク（任意）
                              </label>
                              <input
                                id="doc-uri"
                                type="url"
                                value={documentForm.uri}
                                onChange={(e) => setDocumentForm((prev) => ({ ...prev, uri: e.target.value }))}
                                placeholder="https://..."
                                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                              />
                            </div>
                          </div>
                          <button
                            type="submit"
                            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700"
                          >
                            資料を保存
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                  {selectedDriver.notes && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      <h4 className="text-sm font-semibold text-slate-700">備考</h4>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{selectedDriver.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
