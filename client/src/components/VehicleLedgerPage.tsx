import { useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import type {
  VehicleClass,
  VehicleLedgerVehicle,
  VehicleMaintenanceRecord
} from "../data/vehicles";

const supportLabels: { key: keyof VehicleLedgerVehicle["appsSupported"]; label: string }[] = [
  { key: "uber", label: "Uber" },
  { key: "go", label: "GO" },
  { key: "diDi", label: "DiDi" },
  { key: "nearMe", label: "nearMe" }
];

type ModalProps = {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
};

function Modal({ title, description, onClose, children }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      <div
        className="relative w-full max-w-5xl rounded-3xl bg-white p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
            {description ? (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
          >
            閉じる
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

const vehicleClassLabels: Record<VehicleClass, string> = {
  sedan: "セダン",
  van: "ワゴン",
  luxury: "ハイグレード",
  suv: "SUV",
  minibus: "マイクロバス"
};

type VehicleLedgerPageProps = {
  vehicles: VehicleLedgerVehicle[];
  maintenanceRecords: VehicleMaintenanceRecord[];
};

type NewVehicleFormState = {
  name: string;
  vehiclesId: string;
  officeId: string;
  class: VehicleClass;
  seats: string;
  vin: string;
  plateNo: string;
  shakenExpiry: string;
  inspection3mExpiry: string;
};

const createEmptyVehicleForm = (): NewVehicleFormState => ({
  name: "",
  vehiclesId: "",
  officeId: "",
  class: "sedan",
  seats: "",
  vin: "",
  plateNo: "",
  shakenExpiry: "",
  inspection3mExpiry: ""
});

const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function formatDate(value?: string) {
  if (!value) {
    return "未設定";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return dateFormatter.format(date);
}

function expiryStatus(dateString: string) {
  const now = new Date();
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return {
      label: "未設定",
      className: "bg-slate-100 text-slate-500 border border-slate-200"
    };
  }
  const diffDays = Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return {
      label: `${formatDate(dateString)}（期限切れ）`,
      className: "bg-rose-100 text-rose-700 border border-rose-200"
    };
  }
  if (diffDays <= 30) {
    return {
      label: `${formatDate(dateString)}（残り${diffDays}日）`,
      className: "bg-amber-100 text-amber-700 border border-amber-200"
    };
  }
  return {
    label: formatDate(dateString),
    className: "bg-emerald-100 text-emerald-700 border border-emerald-200"
  };
}

function formatOdometer(value: number | undefined) {
  if (value == null) {
    return "-";
  }
  return `${value.toLocaleString()} km`;
}

export default function VehicleLedgerPage({
  vehicles,
  maintenanceRecords
}: VehicleLedgerPageProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newVehicleForm, setNewVehicleForm] = useState<NewVehicleFormState>(createEmptyVehicleForm);

  const handleNewVehicleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = event.target;
    setNewVehicleForm((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const resetNewVehicleForm = () => {
    setNewVehicleForm(createEmptyVehicleForm());
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
    resetNewVehicleForm();
  };

  const handleCreateVehicleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    console.log("New vehicle", newVehicleForm);
    handleCloseCreateModal();
  };

  const maintenanceByVehicle = useMemo(() => {
    const map = new Map<number, VehicleMaintenanceRecord[]>();
    for (const record of maintenanceRecords) {
      const list = map.get(record.vehicleId);
      if (list) {
        list.push(record);
      } else {
        map.set(record.vehicleId, [record]);
      }
    }
    for (const [, list] of map) {
      list.sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());
    }
    return map;
  }, [maintenanceRecords]);

  const shakenExpiryThisMonthCount = useMemo(() => {
    const today = new Date();
    const targetYear = today.getFullYear();
    const targetMonth = today.getMonth();
    return vehicles.filter((vehicle) => {
      const expiry = new Date(vehicle.shakenExpiry);
      if (Number.isNaN(expiry.getTime())) {
        return false;
      }
      return expiry.getFullYear() === targetYear && expiry.getMonth() === targetMonth;
    }).length;
  }, [vehicles]);

  const selectedVehicle = useMemo(() => {
    if (selectedVehicleId == null) {
      return null;
    }
    return vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
  }, [selectedVehicleId, vehicles]);

  const selectedRecords = selectedVehicle
    ? maintenanceByVehicle.get(selectedVehicle.id) ?? []
    : [];
  const selectedSummary = selectedVehicle ? expiryStatus(selectedVehicle.shakenExpiry) : null;
  const selectedInspection = selectedVehicle
    ? expiryStatus(selectedVehicle.inspection3mExpiry)
    : null;

  return (
    <div className="min-h-full bg-slate-100 pb-12">
      <div className="mx-auto w-full max-w-6xl px-6 pt-10">
        <div className="flex flex-col gap-4 pb-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vehicle Ledger</p>
              <h1 className="text-2xl font-bold text-slate-900">車両台帳</h1>
              <p className="mt-1 text-sm text-slate-600">
                車両情報ページで登録した全車両の基本情報と整備履歴を一覧で確認できます。
              </p>
            </div>
            <div className="flex items-center gap-3 self-start md:self-center">
              <button
                type="button"
                onClick={() => {
                  resetNewVehicleForm();
                  setIsCreateModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500"
              >
                <span aria-hidden>＋</span>
                車両を追加
              </button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">登録台数</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{vehicles.length} 台</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">今月車検期限の車両</p>
              <p className="mt-1 text-2xl font-semibold text-amber-600">
                {shakenExpiryThisMonthCount} 台
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">整備履歴件数</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{maintenanceRecords.length} 件</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    管理ID
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    車両名 / VIN
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    車両情報
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    営業所
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    車検満了日
                  </th>
                  <th scope="col" className="px-4 py-3 text-left font-semibold">
                    3ヶ月点検期限
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    整備履歴
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {vehicles.map((vehicle) => {
                  const summary = expiryStatus(vehicle.shakenExpiry);
                  const inspection = expiryStatus(vehicle.inspection3mExpiry);
                  const records = maintenanceByVehicle.get(vehicle.id) ?? [];

                  return (
                    <tr
                      key={vehicle.id}
                      onClick={() => setSelectedVehicleId(vehicle.id)}
                      className="cursor-pointer bg-white transition hover:bg-sky-50"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">{vehicle.vehiclesId}</td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{vehicle.name}</div>
                        <div className="text-xs text-slate-500">VIN: {vehicle.vin}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-slate-700">{vehicle.plateNo}</div>
                        <div className="text-xs text-slate-500">
                          {vehicleClassLabels[vehicle.class] ?? vehicle.class} / {vehicle.seats}名
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{vehicle.officeId}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${summary.className}`}
                        >
                          {summary.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${inspection.className}`}
                        >
                          {inspection.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500">
                        {records.length} 件
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedVehicle ? (
        <Modal
          title={`${selectedVehicle.name}`}
          description={`${selectedVehicle.plateNo} ・ ${selectedVehicle.vehiclesId}`}
          onClose={() => setSelectedVehicleId(null)}
        >
          <div className="space-y-6 text-sm text-slate-700">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">所属営業所</p>
                <p className="mt-1 text-base font-medium text-slate-800">{selectedVehicle.officeId}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">車両区分</p>
                <p className="mt-1 text-base font-medium text-slate-800">
                  {vehicleClassLabels[selectedVehicle.class] ?? selectedVehicle.class}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">乗車定員</p>
                <p className="mt-1 text-base font-medium text-slate-800">{selectedVehicle.seats} 名</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">有区分</p>
                <p className="mt-1 text-base font-medium text-slate-800">{selectedVehicle.ownerType}</p>
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">対応アプリ</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {supportLabels.map(({ key, label }) => {
                  const active = selectedVehicle.appsSupported[key];
                  return (
                    <span
                      key={key}
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                        active
                          ? "border-sky-300 bg-sky-50 text-sky-700"
                          : "border-slate-200 bg-slate-100 text-slate-400"
                      }`}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">車検満了日</p>
                {selectedSummary ? (
                  <span
                    className={`mt-1 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${selectedSummary.className}`}
                  >
                    {selectedSummary.label}
                  </span>
                ) : (
                  <span className="mt-1 inline-flex w-fit items-center rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500">
                    未設定
                  </span>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">3ヶ月点検期限</p>
                {selectedInspection ? (
                  <span
                    className={`mt-1 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${selectedInspection.className}`}
                  >
                    {selectedInspection.label}
                  </span>
                ) : (
                  <span className="mt-1 inline-flex w-fit items-center rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500">
                    未設定
                  </span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">点検メモ</p>
              <p className="mt-1 whitespace-pre-wrap text-base text-slate-700">
                {selectedVehicle.maintenanceNotes ?? "メモなし"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800">整備履歴</h3>
                <span className="text-xs text-slate-500">{selectedRecords.length} 件</span>
              </div>
              <div className="mt-3 space-y-3">
                {selectedRecords.length === 0 ? (
                  <p className="text-xs text-slate-500">整備記録がまだ登録されていません。</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full table-auto text-xs text-slate-600">
                      <thead className="text-[11px] uppercase tracking-wide text-slate-500">
                        <tr className="text-left">
                          <th className="w-[70px] pb-2">区分</th>
                          <th className="w-[96px] pb-2">実施日</th>
                          <th className="w-[90px] pb-2">走行距離</th>
                          <th className="w-[140px] pb-2">業者</th>
                          <th className="pb-2">内容</th>
                          <th className="w-[120px] pb-2">次回予定</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {selectedRecords.map((record) => (
                          <tr key={record.id} className="align-top">
                            <td className="py-2 font-medium text-slate-700">{record.type}</td>
                            <td className="py-2">{formatDate(record.performedAt)}</td>
                            <td className="py-2">{formatOdometer(record.odometer)}</td>
                            <td className="py-2">{record.vendorName ?? record.vendorId ?? "-"}</td>
                            <td className="py-2 text-slate-700">{record.notes ?? "-"}</td>
                            <td className="py-2">{formatDate(record.nextDueAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {isCreateModalOpen ? (
        <Modal
          title="車両を追加"
          description="新しい車両の基本情報を入力してください。"
          onClose={handleCloseCreateModal}
        >
          <form className="space-y-6" onSubmit={handleCreateVehicleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-slate-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">車両名</span>
                <input
                  name="name"
                  value={newVehicleForm.name}
                  onChange={handleNewVehicleChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="例：アルファード"
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">管理ID</span>
                <input
                  name="vehiclesId"
                  value={newVehicleForm.vehiclesId}
                  onChange={handleNewVehicleChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="例：VH-1001"
                  required
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">所属営業所</span>
                <input
                  name="officeId"
                  value={newVehicleForm.officeId}
                  onChange={handleNewVehicleChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="例：新宿"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">車両区分</span>
                <select
                  name="class"
                  value={newVehicleForm.class}
                  onChange={handleNewVehicleChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                >
                  {Object.entries(vehicleClassLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">乗車定員</span>
                <input
                  name="seats"
                  value={newVehicleForm.seats}
                  onChange={handleNewVehicleChange}
                  type="number"
                  min="1"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="例：7"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">VIN</span>
                <input
                  name="vin"
                  value={newVehicleForm.vin}
                  onChange={handleNewVehicleChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="17桁の英数字"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">ナンバー</span>
                <input
                  name="plateNo"
                  value={newVehicleForm.plateNo}
                  onChange={handleNewVehicleChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                  placeholder="例：新宿 300 あ 12-34"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">車検満了日</span>
                <input
                  name="shakenExpiry"
                  value={newVehicleForm.shakenExpiry}
                  onChange={handleNewVehicleChange}
                  type="date"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-700">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">3ヶ月点検期限</span>
                <input
                  name="inspection3mExpiry"
                  value={newVehicleForm.inspection3mExpiry}
                  onChange={handleNewVehicleChange}
                  type="date"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseCreateModal}
                className="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="inline-flex items-center rounded-full bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500"
              >
                保存する
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

