import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

const hours = Array.from({ length: 25 }, (_, i) => i);
const DRIVER_POOL_WIDTH_INIT = 240;
const DRIVER_POOL_WIDTH_MIN = 200;
const DRIVER_POOL_WIDTH_MAX = 360;
const DEFAULT_PX_PER_MIN = 2;
const MIN_PX_PER_MIN = 0.3;
const BUFFER_MINUTES = 15;

const VEHICLES = [
  { id: 11, name: "セダンA", plate: "品川300 あ 12-34", class: "sedan" },
  { id: 12, name: "ワゴンB", plate: "品川300 い 56-78", class: "van" },
  { id: 13, name: "ハイグレードC", plate: "品川300 う 90-12", class: "luxury" },
  { id: 14, name: "ワゴンD", plate: "品川300 え 34-56", class: "van" }
];
const DRIVERS = [
  { id: 1, name: "田中", code: "D-01", extUsed: 2 },
  { id: 2, name: "佐藤", code: "D-02", extUsed: 0 },
  { id: 3, name: "鈴木", code: "D-03", extUsed: 6 },
  { id: 4, name: "高橋", code: "D-04", extUsed: 1 }
];
const driverMap = new Map(DRIVERS.map((d) => [d.id, d]));

const APP_DUTIES_INIT = [
  { id: "A1", vehicleId: 14, driverId: 1, service: "Uber", start: "2025-10-03T08:00:00+09:00", end: "2025-10-03T16:00:00+09:00" },
  { id: "A2", vehicleId: 12, driverId: null, service: "GO", start: "2025-10-03T06:00:00+09:00", end: "2025-10-03T09:00:00+09:00" },
  { id: "A3", vehicleId: 12, driverId: 4, service: "nearMe", start: "2025-10-03T20:00:00+09:00", end: "2025-10-03T23:30:00+09:00" }
];

const BOOKINGS = [
  { id: 201, vehicleId: 11, driverId: 1, client: { type: "個人", name: "山田様" }, title: "羽田→帝国ホテル", start: "2025-10-03T09:30:00+09:00", end: "2025-10-03T11:00:00+09:00", status: "ok" },
  { id: 202, vehicleId: 11, driverId: null, client: { type: "ホテル", name: "帝国ホテル" }, title: "丸の内→品川(待機)", start: "2025-10-03T12:00:00+09:00", end: "2025-10-03T15:00:00+09:00", status: "warn", note: "ドライバー未割当" },
  { id: 203, vehicleId: 12, driverId: 2, client: { type: "代理店", name: "ABCトラベル" }, title: "成田→都内(ワゴン)", start: "2025-10-03T10:00:00+09:00", end: "2025-10-03T13:30:00+09:00", status: "ok" },
  { id: 205, vehicleId: 13, driverId: 3, client: { type: "個人", name: "佐々木様" }, title: "成田→都内 深夜送迎", start: "2025-10-03T22:30:00+09:00", end: "2025-10-04T02:00:00+09:00", status: "ok" },
  { id: 204, vehicleId: 13, driverId: null, client: { type: "ハイヤー会社", name: "XYZハイヤー" }, title: "銀座→横浜・往復", start: "2025-10-03T18:30:00+09:00", end: "2025-10-03T23:30:00+09:00", status: "hard", note: "休息不足の恐れ" },
  { id: 206, vehicleId: 12, driverId: 4, client: { type: "個人", name: "前日ナイト" }, title: "前日22:00→当日送迎", start: "2025-10-02T22:00:00+09:00", end: "2025-10-03T02:00:00+09:00", status: "ok" }
];

const UNASSIGNED_JOBS = [
  { id: "J101", title: "ホテル→東京駅", client: { type: "ホテル", name: "パレスホテル" }, start: "2025-10-03T14:00:00+09:00", end: "2025-10-03T15:00:00+09:00", preferClass: "sedan" },
  { id: "J102", title: "羽田→赤坂", client: { type: "個人", name: "佐藤様" }, start: "2025-10-03T20:30:00+09:00", end: "2025-10-03T21:30:00+09:00", preferClass: "luxury" }
];

type Booking = (typeof BOOKINGS)[number];
type AppDuty = (typeof APP_DUTIES_INIT)[number];
type Job = (typeof UNASSIGNED_JOBS)[number];

type DrawerItem =
  | { kind: "booking"; item: Booking; issues: string[] }
  | { kind: "duty"; item: AppDuty; issues: string[] }
  | { kind: "job"; item: Job; issues: string[] };

type Selected = { type: "booking" | "duty" | "job"; id: string | number } | null;

type StatusStyle = { bg: string; text: string; border: string };

const STATUS_STYLES: Record<string, StatusStyle> = {
  ok: { bg: "bg-emerald-500/15", text: "text-emerald-900", border: "border-emerald-500/40" },
  warn: { bg: "bg-amber-400/20", text: "text-amber-900", border: "border-amber-500/50" },
  hard: { bg: "bg-rose-500/15", text: "text-rose-900", border: "border-rose-500/50" }
};

const VEHICLE_LABEL_WIDTH = 200;

export function minutesOf(t: string): number {
  const [hhRaw, mmRaw] = t.split(":");
  const hh = Number(hhRaw || 0);
  const mm = Number(mmRaw || 0);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
  return hh * 60 + mm;
}

export function overlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const aS = new Date(aStart),
    aE = new Date(aEnd),
    bS = new Date(bStart),
    bE = new Date(bEnd);
  if (aE <= aS) aE.setDate(aE.getDate() + 1);
  if (bE <= bS) bE.setDate(bE.getDate() + 1);
  return aS < bE && bS < aE;
}

export function rangeForDay(startISO: string, endISO: string, viewDate: string, pxPerMin: number) {
  const vs = new Date(`${viewDate}T00:00:00+09:00`);
  const ve = new Date(vs.getTime() + 24 * 60 * 60 * 1000);
  let s = new Date(startISO);
  let e = new Date(endISO);
  if (e <= s) e = new Date(e.getTime() + 24 * 60 * 60 * 1000);
  const leftClip = s < vs;
  const rightClip = e > ve;
  const clipS = s < vs ? vs : s;
  const clipE = e > ve ? ve : e;
  if (clipE <= clipS) {
    return { left: 0, width: 0, clipL: leftClip, clipR: rightClip, overnight: e.getDate() !== s.getDate() };
  }
  const minutesFromStart = (clipS.getTime() - vs.getTime()) / 60000;
  const widthMin = (clipE.getTime() - clipS.getTime()) / 60000;
  return {
    left: minutesFromStart * pxPerMin,
    width: Math.max(6, widthMin * pxPerMin),
    clipL: leftClip,
    clipR: rightClip,
    overnight: e.getDate() !== s.getDate()
  };
}

export function crossWidth(startMin: number, endMin: number, pxPerMin: number) {
  const s = Math.max(0, startMin);
  const e = Math.min(24 * 60, endMin);
  const width = Math.max(0, e - s) * pxPerMin;
  const left = Math.max(0, startMin) * pxPerMin;
  return { left, width };
}

function bookingToJob(b: Booking): Job {
  const vehicle = VEHICLES.find((v) => v.id === b.vehicleId);
  return { id: `J${b.id}`, title: b.title, client: b.client, start: b.start, end: b.end, preferClass: vehicle?.class || "sedan" };
}

function applyBookingMove(b: Booking, destVehicleId: number, originVehicleId?: number | null, originalDriverId?: number | null) {
  const origin = originVehicleId == null || Number.isNaN(originVehicleId) ? b.vehicleId : originVehicleId;
  const crossed = destVehicleId !== origin;
  return { ...b, vehicleId: destVehicleId, driverId: crossed ? null : originalDriverId ?? b.driverId ?? null };
}

function isSameVehicleOverlap(all: Booking[], cand: Booking): boolean {
  return all.some((o) => o.id !== cand.id && o.vehicleId === cand.vehicleId && overlap(cand.start, cand.end, o.start, o.end));
}
function hasDriverTimeConflict(all: Booking[], cand: Booking): boolean {
  if (cand.driverId == null) return false;
  return all.some((o) => o.id !== cand.id && o.driverId === cand.driverId && overlap(cand.start, cand.end, o.start, o.end));
}
function minutesBetween(aEndISO: string, bStartISO: string) {
  return Math.round((new Date(bStartISO).getTime() - new Date(aEndISO).getTime()) / 60000);
}
function bufferWarn(all: Booking[], cand: Booking): boolean {
  const same = all
    .filter((o) => o.id !== cand.id && o.vehicleId === cand.vehicleId)
    .sort((x, y) => new Date(x.start).getTime() - new Date(y.start).getTime());
  const sT = new Date(cand.start).getTime();
  let prev: Booking | null = null,
    next: Booking | null = null;
  for (const o of same) {
    const t = new Date(o.start).getTime();
    if (t <= sT) prev = o;
    else {
      next = o;
      break;
    }
  }
  const prevGapOk = !prev || minutesBetween(prev.end, cand.start) >= BUFFER_MINUTES;
  const nextGapOk = !next || minutesBetween(cand.end, next.start) >= BUFFER_MINUTES;
  return !(prevGapOk && nextGapOk);
}
function violatesAppDuty(cand: Booking, duties: AppDuty[]): boolean {
  return duties.some((d) => d.vehicleId === cand.vehicleId && overlap(cand.start, cand.end, d.start, d.end));
}
function dutyConflictsWithBookings(bookings: Booking[], duty: AppDuty): boolean {
  return bookings.some((b) => b.vehicleId === duty.vehicleId && overlap(duty.start, duty.end, b.start, b.end));
}
function vehicleIdAtPoint(clientX: number, clientY: number): number | null {
  let el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  while (el) {
    const v = (el as any).dataset?.vehicleId;
    if (v != null) {
      const id = Number(v);
      if (!Number.isNaN(id)) return id;
    }
    el = el.parentElement as HTMLElement | null;
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatRange(startISO: string, endISO: string) {
  return `${formatTime(startISO)}〜${formatTime(endISO)}`;
}

function bookingIssues(all: Booking[], cand: Booking, duties: AppDuty[]) {
  const issues: string[] = [];
  if (isSameVehicleOverlap(all, cand)) issues.push("同じ車両で重複しています");
  if (hasDriverTimeConflict(all, cand)) issues.push("ドライバーが他予定と重複しています");
  if (bufferWarn(all, cand)) issues.push("前後の予定との間隔が15分未満です");
  if (violatesAppDuty(cand, duties)) issues.push("アプリ業務と競合しています");
  return issues;
}

function dutyIssues(bookings: Booking[], duty: AppDuty) {
  const issues: string[] = [];
  if (dutyConflictsWithBookings(bookings, duty)) issues.push("車両予約と時間が重なっています");
  return issues;
}

export default function VehicleDispatchBoardMock() {
  const [fullView, setFullView] = useState(false);
  const [pxPerMin, setPxPerMin] = useState(DEFAULT_PX_PER_MIN);
  const [driverWidth, setDriverWidth] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = Number(localStorage.getItem("driverWidth"));
      if (!Number.isNaN(saved)) return clamp(saved, DRIVER_POOL_WIDTH_MIN, DRIVER_POOL_WIDTH_MAX);
    }
    return DRIVER_POOL_WIDTH_INIT;
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<DrawerItem | null>(null);
  const [selected, setSelected] = useState<Selected>(null);
  const [bookings, setBookings] = useState<Booking[]>(BOOKINGS);
  const [appDuties] = useState<AppDuty[]>(APP_DUTIES_INIT);
  const [jobPool, setJobPool] = useState<Job[]>(UNASSIGNED_JOBS);
  const centerRef = useRef<HTMLDivElement | null>(null);
  const dateStr = "2025-10-03";

  useEffect(() => {
    if (!fullView) return;
    const el = centerRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth - VEHICLE_LABEL_WIDTH;
      if (w <= 0) return;
      const p = Math.max(MIN_PX_PER_MIN, w / (24 * 60));
      setPxPerMin(p);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullView]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("driverWidth", String(driverWidth));
  }, [driverWidth]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const CONTENT_WIDTH = Math.round(24 * 60 * pxPerMin);
  const bookingsByVehicle = useMemo(() => {
    const map = new Map<number, Booking[]>();
    VEHICLES.forEach((v) => map.set(v.id, []));
    bookings.forEach((b) => {
      if (!map.has(b.vehicleId)) map.set(b.vehicleId, []);
      map.get(b.vehicleId)!.push(b);
    });
    return map;
  }, [bookings]);
  const appDutiesByVehicle = useMemo(() => {
    const map = new Map<number, AppDuty[]>();
    VEHICLES.forEach((v) => map.set(v.id, []));
    appDuties.forEach((a) => {
      if (!map.has(a.vehicleId)) map.set(a.vehicleId, []);
      map.get(a.vehicleId)!.push(a);
    });
    return map;
  }, [appDuties]);

  const handleSelect = (item: DrawerItem) => {
    setDrawerItem(item);
    setDrawerOpen(true);
    setSelected({ type: item.kind, id: item.item.id });
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerItem(null);
    setSelected(null);
  };

  const handleAddJobFromBooking = (booking: Booking) => {
    const job = bookingToJob(booking);
    setBookings((prev) => prev.filter((b) => b.id !== booking.id));
    setJobPool((prev) => {
      if (prev.some((j) => j.id === job.id)) return prev;
      return [...prev, job];
    });
    handleSelect({ kind: "job", item: job, issues: [] });
  };

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-800">
      <aside
        className="flex h-full max-h-screen min-h-[600px] flex-col gap-6 border-r border-slate-200 bg-white/70 p-6 shadow-sm"
        style={{ width: driverWidth }}
      >
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">ドライバー</h2>
            <label className="text-xs text-slate-500">
              幅
              <input
                className="ml-2 align-middle"
                type="range"
                min={DRIVER_POOL_WIDTH_MIN}
                max={DRIVER_POOL_WIDTH_MAX}
                value={driverWidth}
                onChange={(event) => setDriverWidth(Number(event.target.value))}
              />
            </label>
          </div>
          <ul className="mt-4 space-y-3 text-sm">
            {DRIVERS.map((driver) => (
              <li key={driver.id} className="rounded-md border border-slate-200/70 bg-white p-3 shadow-sm">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{driver.name}</span>
                  <span className="text-xs text-slate-500">{driver.code}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span>アサイン数</span>
                  <span className="font-medium text-slate-700">{driver.extUsed}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold">未割当ジョブ</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {jobPool.map((job) => (
              <li key={job.id} className="rounded-md border border-dashed border-slate-300 bg-white/70 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{job.title}</span>
                  <span className="text-xs text-slate-500">{job.preferClass.toUpperCase()}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {job.client.type}・{job.client.name}
                </div>
                <div className="mt-1 text-xs text-slate-500">{formatRange(job.start, job.end)}</div>
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                  onClick={() => handleSelect({ kind: "job", item: job, issues: [] })}
                >
                  詳細
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          <p className="font-semibold text-slate-700">凡例</p>
          <ul className="mt-2 space-y-2">
            <li className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-emerald-500/40" /> 通常運行
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-amber-400/50" /> 要確認
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm bg-rose-400/40" /> 要調整
            </li>
          </ul>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h1 className="text-2xl font-semibold">配車ボード (モック)</h1>
            <p className="text-sm text-slate-500">{dateStr} の予定</p>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <label className="flex items-center gap-2">
              ズーム
              <input
                type="range"
                min={MIN_PX_PER_MIN}
                max={4}
                step={0.1}
                value={pxPerMin}
                onChange={(event) => {
                  setPxPerMin(Number(event.target.value));
                  setFullView(false);
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => setFullView((prev) => !prev)}
              className="rounded border border-slate-300 px-3 py-1 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-100"
            >
              {fullView ? "カスタム" : "全体表示"}
            </button>
          </div>
        </header>

        <div className="flex flex-1">
          <div ref={centerRef} className="relative flex-1 overflow-auto">
            <div className="min-w-max">
              <div className="sticky top-0 z-20 flex bg-white">
                <div className="flex h-12 w-[200px] items-center border-b border-r border-slate-200 px-4 text-sm font-semibold text-slate-600">
                  車両 / ナンバー
                </div>
                <div className="border-b border-slate-200" style={{ width: CONTENT_WIDTH }}>
                  <div className="flex h-12" style={{ width: CONTENT_WIDTH }}>
                    {hours.map((h) => (
                      <div
                        key={h}
                        className="flex h-full items-center justify-end border-l border-slate-200 pr-2 text-[11px] text-slate-500"
                        style={{ width: 60 * pxPerMin }}
                      >
                        {String(h).padStart(2, "0")}:00
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {VEHICLES.map((vehicle) => {
                const vehicleBookings = bookingsByVehicle.get(vehicle.id) ?? [];
                const vehicleDuties = appDutiesByVehicle.get(vehicle.id) ?? [];
                return (
                  <div key={vehicle.id} className="flex" data-vehicle-id={vehicle.id}>
                    <div className="flex w-[200px] flex-col justify-center border-b border-r border-slate-200 bg-white px-4 py-3 text-sm">
                      <span className="font-semibold">{vehicle.name}</span>
                      <span className="text-xs text-slate-500">{vehicle.plate}</span>
                    </div>
                    <div className="relative border-b border-slate-200" style={{ width: CONTENT_WIDTH }}>
                      <div className="relative h-28">
                        {vehicleBookings.map((booking) => {
                          const range = rangeForDay(booking.start, booking.end, dateStr, pxPerMin);
                          if (range.width <= 0) return null;
                          const issues = bookingIssues(bookings, booking, appDuties);
                          const hasIssue = issues.length > 0;
                          const style = STATUS_STYLES[booking.status] ?? STATUS_STYLES.ok;
                          const isSelected = selected?.type === "booking" && selected.id === booking.id;
                          return (
                            <div
                              key={booking.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleSelect({ kind: "booking", item: booking, issues })}
                              onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  handleSelect({ kind: "booking", item: booking, issues });
                                }
                              }}
                              className={[
                                "absolute overflow-hidden rounded-lg border px-3 py-2 text-left text-xs shadow-sm transition-all focus:outline-none",
                                style.bg,
                                style.text,
                                isSelected ? "ring-2 ring-sky-500" : hasIssue ? "ring-2 ring-amber-400" : style.border
                              ].join(" ")}
                              style={{ left: range.left, width: range.width }}
                            >
                              <div className="flex items-center justify-between text-[11px] font-medium">
                                <span>{formatRange(booking.start, booking.end)}</span>
                                {booking.driverId ? (
                                  <span>{driverMap.get(booking.driverId)?.name ?? "未割当"}</span>
                                ) : (
                                  <span className="text-rose-600">未割当</span>
                                )}
                              </div>
                              <div className="mt-1 text-sm font-semibold">{booking.title}</div>
                              <div className="mt-1 text-[11px] text-slate-600">
                                {booking.client.type}・{booking.client.name}
                              </div>
                              {booking.note ? <div className="mt-1 text-[11px] text-rose-700">{booking.note}</div> : null}
                              {hasIssue ? (
                                <div className="mt-2 space-y-1 text-[11px] text-amber-700">
                                  {issues.map((issue) => (
                                    <div key={issue}>⚠️ {issue}</div>
                                  ))}
                                </div>
                              ) : null}
                              {booking.status === "warn" ? (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className="mt-2 inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-100 px-2 py-1 text-[10px] text-amber-800 hover:bg-amber-200"
                                  onClick={(event: MouseEvent<HTMLSpanElement>) => {
                                    event.stopPropagation();
                                    handleAddJobFromBooking(booking);
                                  }}
                                  onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      handleAddJobFromBooking(booking);
                                    }
                                  }}
                                >
                                  ジョブプールへ
                                </span>
                              ) : null}
                            </div>
                          );
                        })}

                        {vehicleDuties.map((duty: AppDuty) => {
                          const range = rangeForDay(duty.start, duty.end, dateStr, pxPerMin);
                          if (range.width <= 0) return null;
                          const issues = dutyIssues(bookings, duty);
                          const isSelected = selected?.type === "duty" && selected.id === duty.id;
                          return (
                            <div
                              key={duty.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleSelect({ kind: "duty", item: duty, issues })}
                              onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  handleSelect({ kind: "duty", item: duty, issues });
                                }
                              }}
                              className={[
                                "absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-md border border-indigo-400/60 bg-indigo-100/80 px-2 py-1 text-left text-[11px] text-indigo-900 shadow-sm transition-all focus:outline-none",
                                isSelected ? "ring-2 ring-sky-500" : issues.length > 0 ? "ring-2 ring-amber-400" : ""
                              ].join(" ")}
                              style={{ left: range.left, width: range.width }}
                            >
                              <div className="flex items-center justify-between font-semibold">
                                <span>{duty.service}</span>
                                <span>{duty.driverId ? driverMap.get(duty.driverId)?.name ?? "" : "未割当"}</span>
                              </div>
                              <div className="text-[10px]">{formatRange(duty.start, duty.end)}</div>
                              {issues.length > 0 ? (
                                <div className="mt-1 space-y-1 text-[10px] text-amber-700">
                                  {issues.map((issue: string) => (
                                    <div key={issue}>⚠️ {issue}</div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}

                        <div className="pointer-events-none absolute inset-0">
                          {hours.map((h) => (
                            <div
                              key={h}
                              className="absolute top-0 bottom-0 border-l border-slate-200"
                              style={{ left: h * 60 * pxPerMin, width: 60 * pxPerMin }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {drawerOpen && drawerItem ? (
            <aside className="flex w-80 flex-col border-l border-slate-200 bg-white shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <h2 className="text-lg font-semibold">詳細</h2>
                <button
                  type="button"
                  className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
                  onClick={closeDrawer}
                >
                  閉じる
                </button>
              </div>
              <div className="flex-1 space-y-4 overflow-auto px-5 py-4 text-sm text-slate-600">
                {drawerItem.kind === "booking" ? (
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">予約</p>
                      <p className="text-lg font-semibold text-slate-800">{drawerItem.item.title}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">時間</p>
                      <p>{formatRange(drawerItem.item.start, drawerItem.item.end)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">車両</p>
                      <p>{VEHICLES.find((v) => v.id === drawerItem.item.vehicleId)?.name ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">ドライバー</p>
                      <p>{drawerItem.item.driverId ? driverMap.get(drawerItem.item.driverId)?.name ?? "-" : "未割当"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">顧客</p>
                      <p>
                        {drawerItem.item.client.type}・{drawerItem.item.client.name}
                      </p>
                    </div>
                    {drawerItem.item.note ? (
                      <div>
                        <p className="text-xs text-slate-400">メモ</p>
                        <p className="text-rose-700">{drawerItem.item.note}</p>
                      </div>
                    ) : null}
                    {drawerItem.issues.length > 0 ? (
                      <div>
                        <p className="text-xs text-slate-400">注意事項</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-700">
                          {drawerItem.issues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-600">問題は検出されていません。</p>
                    )}
                  </div>
                ) : null}

                {drawerItem.kind === "duty" ? (
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">アプリ業務</p>
                      <p className="text-lg font-semibold text-slate-800">{drawerItem.item.service}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">時間</p>
                      <p>{formatRange(drawerItem.item.start, drawerItem.item.end)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">車両</p>
                      <p>{VEHICLES.find((v) => v.id === drawerItem.item.vehicleId)?.name ?? "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">ドライバー</p>
                      <p>{drawerItem.item.driverId ? driverMap.get(drawerItem.item.driverId)?.name ?? "-" : "未割当"}</p>
                    </div>
                    {drawerItem.issues.length > 0 ? (
                      <div>
                        <p className="text-xs text-slate-400">注意事項</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-700">
                          {drawerItem.issues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-xs text-emerald-600">競合はありません。</p>
                    )}
                  </div>
                ) : null}

                {drawerItem.kind === "job" ? (
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">ジョブ</p>
                      <p className="text-lg font-semibold text-slate-800">{drawerItem.item.title}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">顧客</p>
                      <p>
                        {drawerItem.item.client.type}・{drawerItem.item.client.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">希望車種</p>
                      <p className="uppercase">{drawerItem.item.preferClass}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">希望時間</p>
                      <p>{formatRange(drawerItem.item.start, drawerItem.item.end)}</p>
                    </div>
                    {drawerItem.issues.length > 0 ? (
                      <div>
                        <p className="text-xs text-slate-400">注意事項</p>
                        <ul className="mt-1 list-disc space-y-1 pl-4 text-amber-700">
                          {drawerItem.issues.map((issue) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Helpers exported for potential reuse/testing
export const __testUtils = {
  applyBookingMove,
  bookingToJob,
  bufferWarn,
  bookingIssues,
  dutyIssues,
  vehicleIdAtPoint
};
