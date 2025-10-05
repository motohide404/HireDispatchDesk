import { useEffect, useMemo, useState } from "react";
import Navbar from "./components/Navbar";
import Card, { CardContent, CardFooter, CardHeader } from "./components/Card";
import StatusBadge, { STATUS_LABELS, type DispatchStatus } from "./components/StatusBadge";
import type { Driver, Job, Reservation } from "./data/mockData";
import { mockDrivers, mockJobs, mockReservations } from "./data/mockData";

type Tab = "home" | "booking" | "dispatch";

type BookingFormData = {
  clientName: string;
  contact: string;
  pickup: string;
  dropoff: string;
  date: string;
  time: string;
  passengers: string;
  vehicleType: string;
  notes: string;
};

type ToastState = {
  message: string;
  tone: "success" | "error";
} | null;

type DispatchRow = {
  id: string;
  reservation: Reservation | null;
  job: Job | null;
  driverId: string;
  status: DispatchStatus;
};

const statusOptions: DispatchStatus[] = ["queued", "assigned", "on-route", "completed", "canceled"];

const bookingInitialState: BookingFormData = {
  clientName: "",
  contact: "",
  pickup: "",
  dropoff: "",
  date: "",
  time: "",
  passengers: "1",
  vehicleType: "",
  notes: ""
};

const requiredBookingFields: Array<keyof BookingFormData> = [
  "clientName",
  "pickup",
  "dropoff",
  "date",
  "time"
];

const buildInitialDispatchRows = (): DispatchRow[] => {
  const jobMap = new Map(mockJobs.map((job) => [job.id, job]));
  const rows: DispatchRow[] = mockReservations.map((reservation, index) => {
    const job = reservation.jobId ? jobMap.get(reservation.jobId) ?? null : null;
    let status: DispatchStatus;
    if (!job) {
      status = "queued";
    } else if (!reservation.driverId) {
      status = "assigned";
    } else {
      status = index % 2 === 0 ? "on-route" : "completed";
    }
    return {
      id: reservation.id,
      reservation,
      job,
      driverId: reservation.driverId ?? "",
      status
    };
  });

  const reservationJobIds = new Set(mockReservations.map((reservation) => reservation.jobId).filter(Boolean) as string[]);
  const openJobs = mockJobs
    .filter((job) => !reservationJobIds.has(job.id))
    .map((job, index) => ({
      id: `job-${job.id}`,
      reservation: null,
      job,
      driverId: "",
      status: (index === 0 ? "queued" : "canceled") as DispatchStatus
    }));

  return [...rows, ...openJobs];
};

const formatWindow = (row: DispatchRow) => {
  if (row.reservation) {
    return `${row.reservation.start} – ${row.reservation.end}`;
  }
  if (row.job) {
    return `${row.job.windowStart} – ${row.job.windowEnd}`;
  }
  return "—";
};

const App = () => {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [formData, setFormData] = useState<BookingFormData>(bookingInitialState);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof BookingFormData, string>>>({});
  const [touched, setTouched] = useState<Record<keyof BookingFormData, boolean>>({
    clientName: false,
    contact: false,
    pickup: false,
    dropoff: false,
    date: false,
    time: false,
    passengers: false,
    vehicleType: false,
    notes: false
  });
  const [submitted, setSubmitted] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [dispatchRows, setDispatchRows] = useState<DispatchRow[]>(() => buildInitialDispatchRows());

  const driverMap = useMemo(() => new Map<string, Driver>(mockDrivers.map((driver) => [driver.id, driver])), []);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const handleNavigate = (tab: Tab) => {
    setActiveTab(tab);
  };

  const handleFieldChange = (field: keyof BookingFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (submitted) {
      validateForm({ ...formData, [field]: value });
    }
  };

  const handleBlur = (field: keyof BookingFormData) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const validateForm = (data: BookingFormData) => {
    const nextErrors: Partial<Record<keyof BookingFormData, string>> = {};
    requiredBookingFields.forEach((field) => {
      if (!data[field]?.trim()) {
        nextErrors[field] = "この項目は必須です";
      }
    });
    setFormErrors(nextErrors);
    return nextErrors;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setToast({ message: "必須項目を確認してください。", tone: "error" });
      return;
    }

    setToast({ message: "予約リクエストを登録しました。", tone: "success" });
    setFormData(bookingInitialState);
    setTouched({
      clientName: false,
      contact: false,
      pickup: false,
      dropoff: false,
      date: false,
      time: false,
      passengers: false,
      vehicleType: false,
      notes: false
    });
    setSubmitted(false);
    setFormErrors({});
  };

  const handleStatusChange = (rowId: string, status: DispatchStatus) => {
    setDispatchRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, status } : row)));
  };

  const handleDriverChange = (rowId: string, driverId: string) => {
    setDispatchRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, driverId } : row)));
  };

  const renderHome = () => (
    <section className="space-y-6 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">車両配車と予約管理をシンプルに</h1>
      <p className="mx-auto max-w-3xl text-sm text-slate-600 sm:text-base">
        予約受付からドライバーの割り当てまで、日々のオペレーションをスムーズに行えるワークスペースです。
        リアルタイムの状況確認と素早いアクションで、チームの連携を高めましょう。
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => handleNavigate("booking")}
          className="w-full rounded-xl bg-slate-900 px-8 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 sm:w-auto"
        >
          Bookingを作成する
        </button>
        <button
          type="button"
          onClick={() => handleNavigate("dispatch")}
          className="w-full rounded-xl border border-slate-300 bg-white px-8 py-3 text-base font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 sm:w-auto"
        >
          Dispatchを確認する
        </button>
      </div>
    </section>
  );

  const renderBooking = () => (
    <Card>
      <CardHeader className="space-y-1">
        <h2 className="text-2xl font-semibold text-slate-900">新規Booking</h2>
        <p className="text-sm text-slate-500">必須項目を入力して配車担当者に共有します。</p>
      </CardHeader>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="space-y-5">
          {submitted && Object.keys(formErrors).length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              入力内容をご確認ください。必須項目が不足しています。
            </div>
          )}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="clientName" className="text-sm font-medium text-slate-700">
                依頼主<span className="ml-1 text-rose-500">*</span>
              </label>
              <input
                id="clientName"
                name="clientName"
                value={formData.clientName}
                onChange={(event) => handleFieldChange("clientName", event.target.value)}
                onBlur={() => handleBlur("clientName")}
                className={`mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-slate-900 focus:ring-slate-900 ${
                  formErrors.clientName && (touched.clientName || submitted) ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500" : ""
                }`}
                placeholder="例）ABC商事 山田様"
              />
              {formErrors.clientName && (touched.clientName || submitted) && (
                <p className="text-xs text-rose-500">{formErrors.clientName}</p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="contact" className="text-sm font-medium text-slate-700">
                連絡先
              </label>
              <input
                id="contact"
                name="contact"
                value={formData.contact}
                onChange={(event) => handleFieldChange("contact", event.target.value)}
                onBlur={() => handleBlur("contact")}
                className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-slate-900 focus:ring-slate-900"
                placeholder="メールまたは電話番号"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="pickup" className="text-sm font-medium text-slate-700">
                ピックアップ地点<span className="ml-1 text-rose-500">*</span>
              </label>
              <input
                id="pickup"
                name="pickup"
                value={formData.pickup}
                onChange={(event) => handleFieldChange("pickup", event.target.value)}
                onBlur={() => handleBlur("pickup")}
                className={`mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-slate-900 focus:ring-slate-900 ${
                  formErrors.pickup && (touched.pickup || submitted) ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500" : ""
                }`}
                placeholder="出発地を入力"
              />
              {formErrors.pickup && (touched.pickup || submitted) && (
                <p className="text-xs text-rose-500">{formErrors.pickup}</p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="dropoff" className="text-sm font-medium text-slate-700">
                ドロップオフ地点<span className="ml-1 text-rose-500">*</span>
              </label>
              <input
                id="dropoff"
                name="dropoff"
                value={formData.dropoff}
                onChange={(event) => handleFieldChange("dropoff", event.target.value)}
                onBlur={() => handleBlur("dropoff")}
                className={`mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-slate-900 focus:ring-slate-900 ${
                  formErrors.dropoff && (touched.dropoff || submitted) ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500" : ""
                }`}
                placeholder="到着地を入力"
              />
              {formErrors.dropoff && (touched.dropoff || submitted) && (
                <p className="text-xs text-rose-500">{formErrors.dropoff}</p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="date" className="text-sm font-medium text-slate-700">
                日付<span className="ml-1 text-rose-500">*</span>
              </label>
              <input
                type="date"
                id="date"
                name="date"
                value={formData.date}
                onChange={(event) => handleFieldChange("date", event.target.value)}
                onBlur={() => handleBlur("date")}
                className={`mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-slate-900 focus:ring-slate-900 ${
                  formErrors.date && (touched.date || submitted) ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500" : ""
                }`}
              />
              {formErrors.date && (touched.date || submitted) && (
                <p className="text-xs text-rose-500">{formErrors.date}</p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="time" className="text-sm font-medium text-slate-700">
                時刻<span className="ml-1 text-rose-500">*</span>
              </label>
              <input
                type="time"
                id="time"
                name="time"
                value={formData.time}
                onChange={(event) => handleFieldChange("time", event.target.value)}
                onBlur={() => handleBlur("time")}
                className={`mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-slate-900 focus:ring-slate-900 ${
                  formErrors.time && (touched.time || submitted) ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500" : ""
                }`}
              />
              {formErrors.time && (touched.time || submitted) && (
                <p className="text-xs text-rose-500">{formErrors.time}</p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="passengers" className="text-sm font-medium text-slate-700">
                乗車人数
              </label>
              <input
                type="number"
                min={1}
                id="passengers"
                name="passengers"
                value={formData.passengers}
                onChange={(event) => handleFieldChange("passengers", event.target.value)}
                onBlur={() => handleBlur("passengers")}
                className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-slate-900 focus:ring-slate-900"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="vehicleType" className="text-sm font-medium text-slate-700">
                希望車種
              </label>
              <select
                id="vehicleType"
                name="vehicleType"
                value={formData.vehicleType}
                onChange={(event) => handleFieldChange("vehicleType", event.target.value)}
                onBlur={() => handleBlur("vehicleType")}
                className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-slate-900 focus:ring-slate-900"
              >
                <option value="">指定なし</option>
                <option value="sedan">セダン</option>
                <option value="van">ワゴン／バン</option>
                <option value="luxury">ハイグレード</option>
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label htmlFor="notes" className="text-sm font-medium text-slate-700">
                備考
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                value={formData.notes}
                onChange={(event) => handleFieldChange("notes", event.target.value)}
                onBlur={() => handleBlur("notes")}
                className="mt-1 block w-full rounded-xl border-slate-300 shadow-sm focus:border-slate-900 focus:ring-slate-900"
                placeholder="到着時の注意点やゲスト情報など"
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 sm:w-auto"
          >
            送信する
          </button>
        </CardFooter>
      </form>
    </Card>
  );

  const renderDispatch = () => (
    <Card>
      <CardHeader className="space-y-1">
        <h2 className="text-2xl font-semibold text-slate-900">Dispatch状況</h2>
        <p className="text-sm text-slate-500">予約と車両の割り当て状況を確認できます。</p>
      </CardHeader>
      <CardContent className="px-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  予約／ジョブ
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  スケジュール
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  ドライバー
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  ステータス
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                  …
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dispatchRows.map((row) => {
                const driverName = row.driverId ? driverMap.get(row.driverId)?.name : null;
                const vehicleLabel = row.reservation?.vehicleName;
                const secondaryLine = row.job
                  ? `${row.job.pickup} → ${row.job.dropoff}`
                  : vehicleLabel
                  ? `Vehicle: ${vehicleLabel}`
                  : "Unassigned";

                return (
                  <tr key={row.id} className="transition-colors hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 align-top">
                      <div className="font-medium text-slate-800">
                        {row.job?.title ?? (vehicleLabel ? `Open Slot - ${vehicleLabel}` : "Pending Assignment")}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{secondaryLine}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top text-slate-600">{formatWindow(row)}</td>
                    <td className="whitespace-nowrap px-4 py-3 align-top text-slate-600">
                      {driverName ? (
                        driverName
                      ) : (
                        <span className="text-amber-600">未割当</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 align-top">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                        <div className="flex flex-col gap-1 text-xs text-slate-500">
                          <span className="font-medium">Status</span>
                          <select
                            id={`status-${row.id}`}
                            value={row.status}
                            onChange={(event) => handleStatusChange(row.id, event.target.value as DispatchStatus)}
                            className="w-full rounded-lg border-slate-300 text-sm focus:border-slate-900 focus:ring-slate-900 sm:w-36"
                          >
                            {statusOptions.map((option) => (
                              <option key={option} value={option}>
                                {STATUS_LABELS[option]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1 text-xs text-slate-500">
                          <span className="font-medium">Driver</span>
                          <select
                            id={`driver-${row.id}`}
                            value={row.driverId}
                            onChange={(event) => handleDriverChange(row.id, event.target.value)}
                            className="w-full rounded-lg border-slate-300 text-sm focus:border-slate-900 focus:ring-slate-900 sm:w-40"
                          >
                            <option value="">未割当</option>
                            {mockDrivers.map((driver) => (
                              <option key={driver.id} value={driver.id}>
                                {driver.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen pb-16">
      <Navbar activeTab={activeTab} onNavigate={handleNavigate} />
      <main className="pt-24">
        <div className="mx-auto max-w-5xl space-y-8 px-6">
          {activeTab === "home" && renderHome()}
          {activeTab === "booking" && renderBooking()}
          {activeTab === "dispatch" && renderDispatch()}
        </div>
      </main>
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm shadow-lg ${
            toast.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-600"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default App;
