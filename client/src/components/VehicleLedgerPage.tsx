import { useMemo } from "react";
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
  onBackToDispatch?: () => void;
};

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
  maintenanceRecords,
  onBackToDispatch
}: VehicleLedgerPageProps) {
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

  return (
    <div className="min-h-full bg-slate-100 pb-12">
      <div className="mx-auto w-full max-w-6xl px-6 pt-10">
        <div className="flex flex-col gap-4 pb-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vehicle Ledger</p>
              <h1 className="text-2xl font-bold text-slate-900">車両台帳</h1>
              <p className="mt-1 text-sm text-slate-600">
                車両情報ページで登録した全車両の基本情報と整備履歴を一覧で確認できます。
              </p>
            </div>
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
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">登録台数</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{vehicles.length} 台</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">本日車検期限の車両</p>
              <p className="mt-1 text-2xl font-semibold text-amber-600">
                {
                  vehicles.filter((vehicle) => {
                    const expiry = new Date(vehicle.shakenExpiry);
                    const today = new Date();
                    return (
                      !Number.isNaN(expiry.getTime()) &&
                      expiry.getFullYear() === today.getFullYear() &&
                      expiry.getMonth() === today.getMonth() &&
                      expiry.getDate() === today.getDate()
                    );
                  }).length
                }
                台
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs uppercase text-slate-500">整備履歴件数</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{maintenanceRecords.length} 件</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {vehicles.map((vehicle) => {
            const summary = expiryStatus(vehicle.shakenExpiry);
            const inspection = expiryStatus(vehicle.inspection3mExpiry);
            const records = maintenanceByVehicle.get(vehicle.id) ?? [];

            return (
              <section
                key={vehicle.id}
                className="rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
              >
                <div className="border-b border-slate-100 px-6 py-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">{vehicle.vehiclesId}</p>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <h2 className="text-xl font-semibold text-slate-900">{vehicle.name}</h2>
                        <span className="text-sm text-slate-600">{vehicle.plateNo}</span>
                        <span className="text-xs text-slate-500">VIN: {vehicle.vin}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        所属営業所: <span className="font-medium text-slate-800">{vehicle.officeId}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {supportLabels.map(({ key, label }) => {
                        const active = vehicle.appsSupported[key];
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
                </div>

                <div className="space-y-6 px-6 py-6">
                  <div className="space-y-4 text-sm text-slate-700">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">車両区分</p>
                        <p className="mt-1 text-base font-medium text-slate-800">
                          {vehicleClassLabels[vehicle.class] ?? vehicle.class}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">乗車定員</p>
                        <p className="mt-1 text-base font-medium text-slate-800">{vehicle.seats} 名</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">保有区分</p>
                        <p className="mt-1 text-base font-medium text-slate-800">{vehicle.ownerType}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">点検メモ</p>
                        <p className="mt-1 text-base text-slate-700">
                          {vehicle.maintenanceNotes ?? "メモなし"}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">車検満了日</p>
                        <span className={`mt-1 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${summary.className}`}>
                          {summary.label}
                        </span>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-500">3ヶ月点検期限</p>
                        <span className={`mt-1 inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${inspection.className}`}>
                          {inspection.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-800">整備履歴</h3>
                      <span className="text-xs text-slate-500">{records.length} 件</span>
                    </div>
                    <div className="mt-3 space-y-3">
                      {records.length === 0 ? (
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
                              {records.map((record) => (
                                <tr key={record.id} className="align-top">
                                  <td className="py-2 font-medium text-slate-700">{record.type}</td>
                                  <td className="py-2">{formatDate(record.performedAt)}</td>
                                  <td className="py-2">{formatOdometer(record.odometer)}</td>
                                  <td className="py-2">
                                    {record.vendorName ?? record.vendorId ?? "-"}
                                  </td>
                                  <td className="py-2 text-slate-700">
                                    {record.notes ?? "-"}
                                  </td>
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
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
