import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";

const hours = Array.from({ length: 25 }, (_, i) => i);
const DRIVER_POOL_WIDTH_INIT = 240;
const DRIVER_POOL_WIDTH_MIN = 200;
const DRIVER_POOL_WIDTH_MAX = 360;
const DEFAULT_PX_PER_MIN = 2;
const MIN_PX_PER_MIN = 0.3;
const BUFFER_MINUTES = 15;
const LP_MS = 60;

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

export function minutesOf(t: string): number {
  const [hhRaw, mmRaw] = t.split(":");
  const hh = Number(hhRaw || 0);
  const mm = Number(mmRaw || 0);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
  return hh * 60 + mm;
}

export function overlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const aS = new Date(aStart), aE = new Date(aEnd), bS = new Date(bStart), bE = new Date(bEnd);
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

function bookingToJob(b: any): any {
  const vehicle = VEHICLES.find((v) => v.id === b.vehicleId);
  return { id: `J${b.id}`, title: b.title, client: b.client, start: b.start, end: b.end, preferClass: vehicle?.class || "sedan" };
}

function applyBookingMove(b: any, destVehicleId: number, originVehicleId?: number | null, originalDriverId?: number | null) {
  const origin = originVehicleId == null || Number.isNaN(originVehicleId) ? b.vehicleId : originVehicleId;
  const crossed = destVehicleId !== origin;
  return { ...b, vehicleId: destVehicleId, driverId: crossed ? null : originalDriverId ?? b.driverId ?? null };
}

function isSameVehicleOverlap(all: any[], cand: any): boolean {
  return all.some((o) => o.id !== cand.id && o.vehicleId === cand.vehicleId && overlap(cand.start, cand.end, o.start, o.end));
}
function hasDriverTimeConflict(all: any[], cand: any): boolean {
  if (cand.driverId == null) return false;
  return all.some((o) => o.id !== cand.id && o.driverId === cand.driverId && overlap(cand.start, cand.end, o.start, o.end));
}
function minutesBetween(aEndISO: string, bStartISO: string) {
  return Math.round((new Date(bStartISO).getTime() - new Date(aEndISO).getTime()) / 60000);
}
function bufferWarn(all: any[], cand: any): boolean {
  const same = all
    .filter((o) => o.id !== cand.id && o.vehicleId === cand.vehicleId)
    .sort((x, y) => new Date(x.start).getTime() - new Date(y.start).getTime());
  const sT = new Date(cand.start).getTime();
  let prev: any = null,
    next: any = null;
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
function violatesAppDuty(cand: any, duties: any[]): boolean {
  return duties.some((d) => d.vehicleId === cand.vehicleId && overlap(cand.start, cand.end, d.start, d.end));
}
function dutyConflictsWithBookings(bookings: any[], duty: any): boolean {
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
  const [drawerItem, setDrawerItem] = useState<any>(null);
  const [selected, setSelected] = useState<{ type: "booking" | "duty"; id: number | string } | null>(null);
  const [bookings, setBookings] = useState<any[]>(BOOKINGS);
  const [appDuties, setAppDuties] = useState(APP_DUTIES_INIT);
  const [jobPool, setJobPool] = useState(UNASSIGNED_JOBS);
  const [flashUnassignId, setFlashUnassignId] = useState<number | null>(null);
  const bookingIdRef = useRef(500);
  const centerRef = useRef<HTMLDivElement | null>(null);
  const dateStr = "2025-10-03";

  useEffect(() => {
    if (!fullView) return;
    const el = centerRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
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
    const map = new Map<number, any[]>();
    VEHICLES.forEach((v) => map.set(v.id, []));
    bookings.forEach((b) => {
      if (!map.has(b.vehicleId)) map.set(b.vehicleId, []);
      map.get(b.vehicleId)!.push(b);
    });
    return map;
  }, [bookings]);
  const appDutiesByVehicle = useMemo(() => {
    const map = new Map<number, any[]>();
    VEHICLES.forEach((v) => map.set(v.id, []));
    appDuties.forEach((a) => {
      if (!map.has(a.vehicleId)) map.set(a.vehicleId, []);
      map.get(a.vehicleId)!.push(a);
    });
    return map;
  }, [appDuties]);

  const canZoom = !fullView;
  const zoom = (delta: number) => {
    if (!canZoom) return;
    setPxPerMin((p) => Math.min(6, Math.max(0.5, p + delta)));
  };

  const openDrawer = (item: any) => {
    setDrawerItem(item);
    setSelected({ type: item.type, id: item.data.id });
    setDrawerOpen(true);
  };
  const closeDrawer = () => setDrawerOpen(false);

  const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;

  function laneHighlight(el: HTMLElement, on: boolean) {
    el.classList.toggle("ring-2", on);
    el.classList.toggle("ring-blue-300", on);
  }
  function handleLaneDragOver(e: ReactDragEvent) {
    const types = Array.from(e.dataTransfer?.types || []);
    if (types.includes("text/x-job-id") || types.includes("text/x-booking-move") || types.includes("text/x-duty-move")) {
      e.preventDefault();
      laneHighlight(e.currentTarget as HTMLElement, true);
    }
  }
  function handleLaneDragLeave(e: ReactDragEvent) {
    laneHighlight(e.currentTarget as HTMLElement, false);
  }

  const moveBookingByPointer = (bookingId: number, fromVehicleId: number, destVehicleId: number, originalDriverId: number | null) => {
    const crossed = destVehicleId !== fromVehicleId;
    let moved = false;
    setBookings((prev) => {
      const cur = prev.find((x) => x.id === bookingId);
      if (!cur) return prev;
      const cand = applyBookingMove(cur, destVehicleId, fromVehicleId, originalDriverId);
      const others = prev.filter((x) => x.id !== bookingId);
      if (isSameVehicleOverlap(others, cand)) {
        alert("時間重複のため配置できません");
        return prev;
      }
      if (violatesAppDuty(cand, appDuties)) {
        alert("アプリ稼働と重複のため配置できません");
        return prev;
      }
      const warn = bufferWarn(prev, cand);
      const finalized = warn ? { ...cand, status: cand.status === "hard" ? "hard" : "warn" } : cand;
      moved = true;
      return prev.map((x) => (x.id === bookingId ? finalized : x));
    });
    if (moved && crossed && originalDriverId != null) {
      setFlashUnassignId(bookingId);
      window.setTimeout(() => setFlashUnassignId(null), 1500);
    }
  };

  const moveDutyByPointer = (dutyId: string, fromVehicleId: number, destVehicleId: number) => {
    setAppDuties((prev) => {
      const cur = prev.find((x) => x.id === dutyId);
      if (!cur) return prev;
      const cand = { ...cur, vehicleId: destVehicleId } as any;
      const others = prev.filter((x) => x.id !== dutyId);
      if (others.some((o) => o.vehicleId === cand.vehicleId && overlap(cand.start, cand.end, o.start, o.end))) {
        alert("他のアプリ稼働と重複のため移動できません");
        return prev;
      }
      if (dutyConflictsWithBookings(bookings, cand)) {
        alert("予約と重複のため移動できません");
        return prev;
      }
      return prev.map((x) => (x.id === dutyId ? cand : x));
    });
  };

  function handleLaneDrop(vehicleId: number, e: ReactDragEvent) {
    laneHighlight(e.currentTarget as HTMLElement, false);
    const dt = e.dataTransfer;
    if (!dt) return;
    e.preventDefault();

    const movedDutyRaw = dt.getData("text/x-duty-move");
    if (movedDutyRaw) {
      const dutyId = movedDutyRaw;
      const fromRaw = dt.getData("text/x-from-vehicle-id");
      const fromVehicleId = Number(fromRaw);
      if (!Number.isNaN(fromVehicleId)) moveDutyByPointer(dutyId, fromVehicleId, vehicleId);
      return;
    }

    const movedBookingRaw = dt.getData("text/x-booking-move");
    if (movedBookingRaw) {
      const bookingId = Number(movedBookingRaw);
      const fromRaw = dt.getData("text/x-from-vehicle-id");
      const fromVehicleId = Number(fromRaw);
      const originalDriverRaw = dt.getData("text/x-original-driver-id");
      const originalDriverId = originalDriverRaw ? Number(originalDriverRaw) : null;
      moveBookingByPointer(bookingId, fromVehicleId, vehicleId, originalDriverId);
      return;
    }

    const jobId = dt.getData("text/x-job-id");
    if (!jobId) return;
    const job = jobPool.find((j) => j.id === jobId);
    if (!job) return;
    const start = new Date(job.start);
    const end = new Date(job.end);
    const newBooking = {
      id: ++bookingIdRef.current,
      vehicleId,
      driverId: null,
      client: job.client,
      title: job.title,
      start: toJstIso(start),
      end: toJstIso(end),
      status: "warn",
      note: "ドライバー未割当（ジョブから配置：カード時刻にスナップ）"
    } as any;
    if (isSameVehicleOverlap(bookings, newBooking)) {
      alert("時間重複のため配置できません");
      return;
    }
    if (violatesAppDuty(newBooking, appDuties)) {
      alert("アプリ稼働と重複のため配置できません");
      return;
    }
    const warn = bufferWarn(bookings, newBooking);
    const finalized = warn ? { ...newBooking, status: newBooking.status === "hard" ? "hard" : "warn" } : newBooking;
    setBookings((prev) => [...prev, finalized]);
    setJobPool((prev) => prev.filter((j) => j.id !== job.id));
  }

  const jobPoolRef = useRef<HTMLDivElement | null>(null);
  function jobPoolHighlight(on: boolean) {
    const el = jobPoolRef.current;
    if (!el) return;
    el.classList.toggle("ring-2", on);
    el.classList.toggle("ring-amber-300", on);
  }
  function handleJobPoolDragOver(e: ReactDragEvent) {
    const types = Array.from(e.dataTransfer?.types || []);
    if (types.includes("text/x-booking-id")) {
      e.preventDefault();
      jobPoolHighlight(true);
    }
  }
  function handleJobPoolDragLeave() {
    jobPoolHighlight(false);
  }
  function handleJobPoolDrop(e: ReactDragEvent) {
    jobPoolHighlight(false);
    const raw = e.dataTransfer.getData("text/x-booking-id");
    if (!raw) return;
    e.preventDefault();
    const bookingId = Number(raw);
    const b = bookings.find((x) => x.id === bookingId);
    if (!b) return;
    const newJob = bookingToJob(b);
    setJobPool((prev) => [newJob, ...prev]);
    setBookings((prev) => prev.filter((x) => x.id !== bookingId));
    setDrawerOpen(false);
  }

  function returnBookingToJobPool(bookingId: number) {
    const b = bookings.find((x) => x.id === bookingId);
    if (!b) return;
    const newJob = bookingToJob(b);
    setJobPool((prev) => [newJob, ...prev]);
    setBookings((prev) => prev.filter((x) => x.id !== bookingId));
    setDrawerOpen(false);
  }

  return (
    <>
      <style>{`@keyframes badge-blink{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(251,191,36,0)}50%{opacity:0;box-shadow:0 0 0 3px rgba(251,191,36,0.9)}}.blink3{animation:badge-blink 0.5s ease-in-out 3}`}</style>
      <div className="w-full h-full p-4 bg-slate-50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">配車ボード（車両軸）</h1>
            <span className="text-slate-500">{dateStr}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex border rounded overflow-hidden" role="group" aria-label="表示モード切替">
              <button
                className={`px-3 py-1 ${!fullView ? "bg-slate-200 font-medium" : ""}`}
                aria-pressed={!fullView}
                title="通常表示（見やすい拡大倍率）"
                onClick={() => {
                  if (fullView) {
                    setFullView(false);
                    setPxPerMin(DEFAULT_PX_PER_MIN);
                  }
                }}
              >
                通常表示
              </button>
              <button
                className={`px-3 py-1 border-l ${fullView ? "bg-slate-200 font-medium" : ""}`}
                aria-pressed={fullView}
                title="24時間を1画面にフィット"
                onClick={() => {
                  if (!fullView) setFullView(true);
                }}
              >
                24h 全体表示
              </button>
            </div>
            <div className="inline-flex items-center gap-2 text-xs text-slate-600">
              <span className="px-2 py-1 rounded bg-slate-100">現在: {fullView ? "24h 全体表示" : "通常表示"}</span>
            </div>
            <div className="inline-flex border rounded overflow-hidden">
              <button className={`px-3 py-1 ${canZoom ? "" : "opacity-40 cursor-not-allowed"}`} onClick={() => zoom(-0.25)}>
                -
              </button>
              <span className="px-2 py-1 text-xs text-slate-600 w-16 text-center">{pxPerMin.toFixed(2)} px/m</span>
              <button className={`px-3 py-1 ${canZoom ? "" : "opacity-40 cursor-not-allowed"}`} onClick={() => zoom(+0.25)}>
                +
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3 h-[560px]">
          <div className="bg-white rounded-2xl shadow p-3 overflow-auto relative" style={{ width: driverWidth }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-medium">ドライバープール</h2>
              <span className="text-xs text-slate-500">ドラッグで幅調整</span>
            </div>
            <ul className="space-y-2">
              {DRIVERS.map((d) => (
                <li
                  key={d.id}
                  className="border rounded-xl p-3 hover:bg-slate-50 cursor-grab active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copyMove";
                    e.dataTransfer.setData("text/x-driver-id", String(d.id));
                    e.dataTransfer.setData("text/plain", String(d.id));
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {d.name} <span className="text-slate-400 text-xs">({d.code})</span>
                      </div>
                      <div className="text-xs text-slate-500">延長使用: {d.extUsed}/7</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] px-2 py-0.5 rounded bg-slate-100">待機</div>
                      <div className="text-[10px] text-slate-500 mt-1">次空き: 今すぐ</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <ResizeHandle value={driverWidth} setValue={setDriverWidth} min={DRIVER_POOL_WIDTH_MIN} max={DRIVER_POOL_WIDTH_MAX} side="right" />
          </div>

          <div ref={centerRef} className={`flex-1 bg-white rounded-2xl shadow p-3 relative overflow-y-auto ${fullView ? "overflow-x-hidden" : "overflow-x-auto"}`}>
            <div className="flex items-center justify-between mb-2 sticky left-0 top-0 z-10 bg-white pr-2">
              <h2 className="font-medium">モータープール</h2>
              <span className="text-xs text-slate-500">00:00〜24:00（{pxPerMin.toFixed(2)} px/min）</span>
            </div>

            <div className="relative" style={{ width: CONTENT_WIDTH }}>
              <GridOverlay hourPx={60 * pxPerMin} />

              <div className="space-y-3 pt-6">
                {VEHICLES.map((v) => (
                  <div
                    key={v.id}
                    data-vehicle-id={v.id}
                    className="relative h-16 border rounded-xl bg-white overflow-hidden"
                    onDragOver={handleLaneDragOver}
                    onDragLeave={handleLaneDragLeave}
                    onDrop={(e) => handleLaneDrop(v.id, e)}
                  >
                    {(appDutiesByVehicle.get(v.id) || []).map((a: any) => (
                      <AppDutyBlock
                        key={a.id}
                        duty={a}
                        pxPerMin={pxPerMin}
                        viewDate={dateStr}
                        onClick={() => openDrawer({ type: "duty", data: a, vehicle: v })}
                        isSelected={selected?.type === "duty" && selected?.id === a.id}
                        onMoveDutyToVehicle={(dutyId, fromVehicleId, destVehicleId) => moveDutyByPointer(dutyId, fromVehicleId, destVehicleId)}
                      />
                    ))}
                    {(bookingsByVehicle.get(v.id) || []).map((b: any) => (
                      <BookingBlock
                        key={b.id}
                        booking={b}
                        pxPerMin={pxPerMin}
                        viewDate={dateStr}
                        onClick={() => openDrawer({ type: "booking", data: b, vehicle: v })}
                        isSelected={selected?.type === "booking" && selected?.id === b.id}
                        onDriverDrop={(bookingId: number, driverId: number) => {
                          const cur = bookings.find((x) => x.id === bookingId);
                          if (!cur) return;
                          const cand = { ...cur, driverId } as any;
                          if (hasDriverTimeConflict(bookings, cand)) {
                            alert("同一ドライバーの時間重複のため割当できません");
                            return;
                          }
                          setBookings((prev) => prev.map((x) => (x.id === bookingId ? { ...x, driverId } : x)));
                        }}
                        onMoveToVehicle={(bookingId, fromVehicleId, destVehicleId, originalDriverId) =>
                          moveBookingByPointer(bookingId, fromVehicleId, destVehicleId, originalDriverId)
                        }
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/x-booking-id", String(b.id));
                          e.dataTransfer.setData("text/x-booking-move", String(b.id));
                          e.dataTransfer.setData("text/x-from-vehicle-id", String(b.vehicleId));
                          e.dataTransfer.setData("text/x-original-driver-id", b.driverId != null ? String(b.driverId) : "");
                          e.dataTransfer.setData("text/plain", String(b.id));
                        }}
                        flashUnassign={flashUnassignId === b.id}
                      />
                    ))}

                    <div className="absolute left-2 top-1 text-[11px] text-slate-500 bg-white/80 rounded px-1">{v.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div ref={jobPoolRef} className="mt-3 bg-white rounded-2xl shadow p-3" onDragOver={handleJobPoolDragOver} onDragLeave={handleJobPoolDragLeave} onDrop={handleJobPoolDrop}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">ジョブプール（未割当）</h2>
            <span className="text-xs text-slate-500">{jobPool.length} 件</span>
          </div>
          {jobPool.length === 0 ? (
            <div className="text-slate-500 text-sm">未割当の仕事はありません。Excel風入力画面で登録するとここに表示されます。</div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {jobPool.map((j) => {
                const durMin = Math.round((new Date(j.end).getTime() - new Date(j.start).getTime()) / 60000);
                return (
                  <div
                    key={j.id}
                    className="min-w-[220px] border rounded-xl p-2 hover:bg-slate-50 cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "copyMove";
                      e.dataTransfer.setData("text/x-job-id", String(j.id));
                      e.dataTransfer.setData("text/plain", String(j.id));
                    }}
                    title="モータープールの車両レーンへドラッグで割当"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium truncate">{j.title}</div>
                      <span className="text-[10px] px-1 rounded bg-slate-100 text-slate-700">{j.preferClass}</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      {fmt(j.start)} - {fmt(j.end)}（{durMin}分）
                    </div>
                    <div className="text-xs text-slate-600">依頼元：{j.client?.name}</div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="text-[11px] text-slate-500 mt-2">※ 予約バーをここにドラッグするとジョブプールへ戻せます</div>
        </div>

        {drawerOpen && (
          <Drawer isMobile={isMobile} onClose={closeDrawer}>
            <DetailsPane item={drawerItem} onReturn={(id: number) => returnBookingToJobPool(id)} />
          </Drawer>
        )}
      </div>
    </>
  );
}

function EdgeFlag({ pos }: { pos: "left" | "right" }) {
  return (
    <span className={`absolute ${pos === "left" ? "left-0" : "right-0"} -top-1 text-[10px] bg-black/30 text-white px-1 rounded`}>
      {pos === "left" ? "←前" : "→翌"}
    </span>
  );
}

function GridOverlay({ hourPx }: { hourPx: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(to right, rgba(148,163,184,0.25) 0, rgba(148,163,184,0.25) 1px, transparent 1px, transparent ${hourPx}px)`
        }}
      />
      {hours.map((h) => (
        <div key={h} className="absolute top-0 text-[10px] text-slate-400" style={{ left: h * hourPx + 4 }}>
          {String(h).padStart(2, "0")}:00
        </div>
      ))}
    </div>
  );
}

function AppDutyBlock({ duty, pxPerMin, viewDate, onClick, isSelected, onMoveDutyToVehicle }: { duty: any; pxPerMin: number; viewDate: string; onClick: () => void; isSelected?: boolean; onMoveDutyToVehicle: (dutyId: string, fromVehicleId: number, destVehicleId: number) => void }) {
  const { left, width, clipL, clipR, overnight } = rangeForDay(duty.start, duty.end, viewDate, pxPerMin);
  if (width <= 0) return null;
  const driverLabel = duty.driverId ? `（${driverMap.get(duty.driverId)?.name}）` : "";

  const pId = useRef<number | null>(null);
  const longRef = useRef<any>(null);
  const draggingTouch = useRef(false);
  const hoverVid = useRef<number | null>(null);
  const clearHover = () => {
    if (hoverVid.current != null) {
      const el = document.querySelector(`[data-vehicle-id="${hoverVid.current}"]`) as HTMLElement | null;
      el?.classList.remove("ring-2", "ring-blue-300");
      hoverVid.current = null;
    }
  };
  const onPointerDown = (e: any) => {
    if (e.pointerType === "mouse") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pId.current = e.pointerId;
    longRef.current = window.setTimeout(() => {
      draggingTouch.current = true;
    }, LP_MS);
  };
  const onPointerMove = (e: any) => {
    if (!draggingTouch.current) return;
    const vid = vehicleIdAtPoint(e.clientX, e.clientY);
    if (vid !== hoverVid.current) {
      if (hoverVid.current != null) {
        const prev = document.querySelector(`[data-vehicle-id="${hoverVid.current}"]`) as HTMLElement | null;
        prev?.classList.remove("ring-2", "ring-blue-300");
      }
      if (vid != null) {
        const cur = document.querySelector(`[data-vehicle-id="${vid}"]`) as HTMLElement | null;
        cur?.classList.add("ring-2", "ring-blue-300");
      }
      hoverVid.current = vid;
    }
  };
  const onPointerUp = (e: any) => {
    if (pId.current == null) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(pId.current);
    window.clearTimeout(longRef.current);
    const vid = draggingTouch.current ? vehicleIdAtPoint(e.clientX, e.clientY) : null;
    clearHover();
    if (draggingTouch.current && vid != null && vid !== duty.vehicleId) {
      onMoveDutyToVehicle(duty.id, duty.vehicleId, vid);
    }
    draggingTouch.current = false;
    pId.current = null;
  };

  return (
    <div
      className={`absolute top-2 h-12 bg-purple-500/25 border border-purple-300/60 rounded-lg px-2 py-1 text-[11px] text-purple-900 flex items-end cursor-pointer ${isSelected ? "ring-2 ring-blue-500 shadow-lg" : ""}`}
      style={{ left, width }}
      title={`${duty.service}${driverLabel}`}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/x-duty-move", String(duty.id));
        e.dataTransfer.setData("text/x-from-vehicle-id", String(duty.vehicleId));
        e.dataTransfer.setData("text/plain", String(duty.id));
      }}
    >
      {clipL && <EdgeFlag pos="left" />}
      <div className="truncate">
        {duty.service}
        {driverLabel}：{fmt(duty.start)}-{fmt(duty.end)}
        {overnight ? "（→翌）" : ""}
      </div>
      <div className="ml-auto text-[10px] bg-white/60 px-1 rounded">アプリ稼働</div>
      {clipR && <EdgeFlag pos="right" />}
    </div>
  );
}

function BookingBlock({ booking, pxPerMin, viewDate, onClick, isSelected, onDriverDrop, draggable, onDragStart, flashUnassign, onMoveToVehicle }: { booking: any; pxPerMin: number; viewDate: string; onClick: () => void; isSelected?: boolean; onDriverDrop: (bookingId: number, driverId: number) => void; draggable?: boolean; onDragStart?: (e: any) => void; flashUnassign?: boolean; onMoveToVehicle: (bookingId: number, fromVehicleId: number, destVehicleId: number, originalDriverId: number | null) => void }) {
  const { left, width, clipL, clipR, overnight } = rangeForDay(booking.start, booking.end, viewDate, pxPerMin);
  if (width <= 0) return null;
  const color = booking.status === "ok" ? "bg-green-500/80" : booking.status === "warn" ? "bg-yellow-500/80" : "bg-red-500/80";
  const ring = booking.status === "ok" ? "ring-green-400" : booking.status === "warn" ? "ring-yellow-400" : "ring-red-400";
  const driver = booking.driverId ? driverMap.get(booking.driverId) : null;

  const [over, setOver] = useState(false);
  const handleDragOver = (e: any) => {
    e.preventDefault();
    setOver(true);
  };
  const handleDragLeave = () => setOver(false);
  const handleDrop = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(false);
    const types = Array.from(e.dataTransfer?.types || []);
    if (!types.includes("text/x-driver-id")) return;
    const raw = e.dataTransfer.getData("text/x-driver-id");
    const driverId = Number(raw);
    if (!Number.isNaN(driverId)) onDriverDrop(booking.id, driverId);
  };

  const downRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const TH = 4;
  const onMouseDown = (e: any) => {
    downRef.current = { x: e.clientX, y: e.clientY };
    draggedRef.current = false;
  };
  const onMouseMove = (e: any) => {
    if (!downRef.current) return;
    const dx = Math.abs(e.clientX - downRef.current.x);
    const dy = Math.abs(e.clientY - downRef.current.y);
    if (dx > TH || dy > TH) draggedRef.current = true;
  };
  const onMouseUp = () => {};
  const onCardClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    onClick();
  };

  const pId = useRef<number | null>(null);
  const longRef = useRef<any>(null);
  const draggingTouch = useRef(false);
  const hoverVid = useRef<number | null>(null);
  const clearHover = () => {
    if (hoverVid.current != null) {
      const el = document.querySelector(`[data-vehicle-id="${hoverVid.current}"]`) as HTMLElement | null;
      el?.classList.remove("ring-2", "ring-blue-300");
      hoverVid.current = null;
    }
  };
  const onPointerDown = (e: any) => {
    if (e.pointerType === "mouse") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pId.current = e.pointerId;
    longRef.current = window.setTimeout(() => {
      draggingTouch.current = true;
    }, LP_MS);
  };
  const onPointerMove = (e: any) => {
    if (!draggingTouch.current) return;
    const vid = vehicleIdAtPoint(e.clientX, e.clientY);
    if (vid !== hoverVid.current) {
      if (hoverVid.current != null) {
        const prev = document.querySelector(`[data-vehicle-id="${hoverVid.current}"]`) as HTMLElement | null;
        prev?.classList.remove("ring-2", "ring-blue-300");
      }
      if (vid != null) {
        const cur = document.querySelector(`[data-vehicle-id="${vid}"]`) as HTMLElement | null;
        cur?.classList.add("ring-2", "ring-blue-300");
      }
      hoverVid.current = vid;
    }
  };
  const onPointerUp = (e: any) => {
    if (pId.current == null) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(pId.current);
    window.clearTimeout(longRef.current);
    const vid = draggingTouch.current ? vehicleIdAtPoint(e.clientX, e.clientY) : null;
    clearHover();
    if (draggingTouch.current && vid != null && vid !== booking.vehicleId) {
      onMoveToVehicle(booking.id, booking.vehicleId, vid, booking.driverId ?? null);
    }
    draggingTouch.current = false;
    pId.current = null;
  };

  return (
    <div
      className={`absolute top-2 h-12 ${color} text-white text-[11px] rounded-lg px-2 py-1 shadow ring-2 ${ring} cursor-pointer ${isSelected ? "outline outline-2 outline-blue-500" : ""} ${over ? "ring-4 ring-blue-300" : ""}`}
      style={{ left, width }}
      title={booking.title}
      onClick={onCardClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      draggable={draggable}
      onDragStart={onDragStart}
    >
      {clipL && <EdgeFlag pos="left" />}
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold truncate">{booking.title}</div>
        {driver ? (
          <span className={`text-[10px] px-2 py-0.5 rounded bg-white/90 text-slate-800 border border-transparent`}>{driver.name}（{driver.code}）</span>
        ) : (
          <span className={`text-[10px] px-2 py-0.5 rounded bg-white/90 text-amber-700 ${flashUnassign ? "blink3 border border-amber-500" : "border border-transparent"}`}>ドライバー未割当</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 opacity-95">
        <div className="truncate">
          {fmt(booking.start)} - {fmt(booking.end)}
          {overnight ? "（→翌）" : ""}
        </div>
        <div className="truncate">{booking.client?.name}</div>
      </div>
      {clipR && <EdgeFlag pos="right" />}
    </div>
  );
}

function ResizeHandle({ value, setValue, min, max, side }: { value: number; setValue: (v: number) => void; min: number; max: number; side: "right" | "left" }) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startV = useRef(0);
  const onDown = (e: any) => {
    dragging.current = true;
    startX.current = e.clientX;
    startV.current = value;
    const onMove = (ev: any) => {
      if (!dragging.current) return;
      const dx = ev.clientX - startX.current;
      const next = side === "right" ? startV.current + dx : startV.current - dx;
      setValue(clamp(next, min, max));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  return <div onPointerDown={onDown} className={`absolute top-0 ${side === "right" ? "right-0 cursor-col-resize" : "left-0 cursor-col-resize"} h-full w-1 bg-transparent hover:bg-slate-200`} title={`ドラッグで幅調整（${min}-${max}px）`} />;
}

function Drawer({ isMobile, onClose, children }: { isMobile: boolean; onClose: () => void; children: any }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      {isMobile ? (
        <div className="absolute left-0 right-0 bottom-0 h-[70%] bg-white rounded-t-2xl shadow-2xl p-4 animate-in slide-in-from-bottom">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">詳細検証ペイン</h3>
            <button className="text-sm px-2 py-1 border rounded" onClick={onClose}>
              閉じる
            </button>
          </div>
          <div className="h-[calc(100%-2rem)] overflow-auto">{children}</div>
        </div>
      ) : (
        <div className="absolute right-0 top-0 h-full w-[380px] bg-white rounded-l-2xl shadow-2xl p-4 animate-in slide-in-from-right">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">詳細検証ペイン</h3>
            <button className="text-sm px-2 py-1 border rounded" onClick={onClose}>
              閉じる
            </button>
          </div>
          <div className="h-[calc(100%-2rem)] overflow-auto">{children}</div>
        </div>
      )}
    </div>
  );
}

function DetailsPane({ item, onReturn }: { item: any; onReturn?: (id: number) => void }) {
  if (!item) return <div className="text-slate-500 text-sm">項目が選択されていません</div>;
  const type = item.type;
  const v = item.vehicle as any;
  const data = item.data as any;
  const driver = data.driverId ? driverMap.get(data.driverId) : null;
  const isBooking = type === "booking";

  return (
    <div className="space-y-3 text-sm">
      <section>
        <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">概要</h4>
        <div className="font-medium">{isBooking ? data.title : `${data.service}${driver ? `（${driver.name}）` : ""}`}</div>
        <div className="text-slate-600">
          {fmt(data.start)} - {fmt(data.end)}
          {new Date(data.end) <= new Date(data.start) ? "（→翌）" : ""}
        </div>
        {isBooking && <div className="text-slate-600">依頼元：{data.client?.type}/{data.client?.name}</div>}
      </section>

      <section>
        <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">ドライバー</h4>
        <div>{driver ? `${driver.name}（${driver.code}）` : "未割当"}</div>
      </section>

      <section>
         <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">車両</h4>
        <div>
          {v?.name}　<span className="text-slate-500">{v?.plate}</span>
        </div>
      </section>

      {isBooking && onReturn && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">操作</h4>
          <button
            className="px-3 py-1 text-sm border rounded hover:bg-slate-50"
            onClick={() => onReturn(data.id)}
            title="この予約を削除してジョブプールに戻す"
          >
            ジョブプールへ戻す
          </button>
        </section>
      )}

      <section>
        <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">検証</h4>
        <ul className="list-disc list-inside text-slate-700 space-y-1">
          <li>労務：OK（デモ）</li>
          <li>車両衝突：OK（デモ）</li>
          <li>アプリ稼働と衝突：OK（デモ）</li>
        </ul>
      </section>

      <section>
        <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">ノート</h4>
        <div className="text-slate-600">ここに社内共有メモを記入</div>
      </section>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toJstIso(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}:${pad2(d.getSeconds())}+09:00`;
}
function fmt(s: string) {
  const d = new Date(s);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
