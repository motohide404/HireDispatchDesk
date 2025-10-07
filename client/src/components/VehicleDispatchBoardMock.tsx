import { useEffect, useMemo, useRef, useState } from "react";

import { useFlashOnChange } from "../lib/useFlashOnChange";
import type { DragEvent as ReactDragEvent, FormEvent, ReactNode } from "react";

import "./VehicleDispatchBoardMock.css";

const hours = Array.from({ length: 25 }, (_, i) => i);
const DRIVER_POOL_WIDTH_INIT = 240;
const DRIVER_POOL_WIDTH_MIN = 200;
const DRIVER_POOL_WIDTH_MAX = 360;
const DEFAULT_PX_PER_MIN = 2;
const MIN_PX_PER_MIN = 0.3;
const BUFFER_MINUTES = 15;
const RESIZE_STEP_MINUTES = 5;
const MIN_BOOKING_DURATION_MINUTES = 15;
const LP_MS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

type Interval = { start: number; end: number };

const VEHICLES = [
  { id: 11, name: "セダンA", plate: "品川300 あ 12-34", class: "sedan" },
  { id: 12, name: "ワゴンB", plate: "品川300 い 56-78", class: "van" },
  { id: 13, name: "ハイグレードC", plate: "品川300 う 90-12", class: "luxury" },
  { id: 14, name: "ワゴンD", plate: "品川300 え 34-56", class: "van" }
];
const VEHICLE_CLASS_LABELS: Record<string, string> = {
  sedan: "セダン",
  van: "ワゴン",
  luxury: "ハイグレード"
};
const vehicleMap = new Map(VEHICLES.map((v) => [v.id, v]));
type DriverInfo = {
  id: number;
  name: string;
  code: string;
  extUsed: number;
  monthlyJobs: number;
  currentDispatchNumber: number;
};

type JobDraft = {
  title: string;
  clientType: string;
  clientName: string;
  startTime: string;
  endTime: string;
  preferClass: string;
};

const DRIVERS: DriverInfo[] = [
  { id: 1, name: "田中", code: "D-01", extUsed: 2, monthlyJobs: 38, currentDispatchNumber: 4 },
  { id: 2, name: "佐藤", code: "D-02", extUsed: 0, monthlyJobs: 42, currentDispatchNumber: 6 },
  { id: 3, name: "鈴木", code: "D-03", extUsed: 6, monthlyJobs: 35, currentDispatchNumber: 3 },
  { id: 4, name: "高橋", code: "D-04", extUsed: 1, monthlyJobs: 47, currentDispatchNumber: 5 }
];
const driverMap = new Map(DRIVERS.map((d) => [d.id, d]));

type AppDuty = {
  id: string;
  vehicleId: number;
  driverId: number | null;
  service: string;
  start: string;
  end: string;
  is_overnight: boolean;
  overnight_from_previous_day?: boolean;
  overnight_to_next_day?: boolean;
  amount?: number;
};

const APP_DUTIES_INIT: AppDuty[] = [
  {
    id: "A1",
    vehicleId: 14,
    driverId: 1,
    service: "Uber",
    start: "2025-10-03T08:00:00+09:00",
    end: "2025-10-03T16:00:00+09:00",
    is_overnight: false,
    overnight_from_previous_day: false,
    overnight_to_next_day: false,
    amount: 28000
  },
  {
    id: "A2",
    vehicleId: 12,
    driverId: null,
    service: "GO",
    start: "2025-10-03T06:00:00+09:00",
    end: "2025-10-03T09:00:00+09:00",
    is_overnight: false,
    overnight_from_previous_day: false,
    overnight_to_next_day: false,
    amount: 12000
  },
  {
    id: "A3",
    vehicleId: 12,
    driverId: 4,
    service: "nearMe",
    start: "2025-10-03T20:00:00+09:00",
    end: "2025-10-03T23:30:00+09:00",
    is_overnight: false,
    overnight_from_previous_day: false,
    overnight_to_next_day: false,
    amount: 21000
  }
];

type BookingAttachment = {
  id: string;
  name: string;
  type: string;
  url: string;
  size: number;
  addedAt: string;
};

type BoardBooking = {
  id: number;
  vehicleId: number;
  driverId: number | null;
  client: { type: string; name: string };
  title: string;
  start: string;
  end: string;
  status: string;
  note?: string;
  attachments?: BookingAttachment[];
  is_overnight: boolean;
  overnight_from_previous_day?: boolean;
  overnight_to_next_day?: boolean;
  amount?: number;
};

const isAppJob = (booking: BoardBooking | undefined | null) => booking?.client?.type === "app";

const BOOKINGS: BoardBooking[] = [
  {
    id: 201,
    vehicleId: 11,
    driverId: 1,
    client: { type: "個人", name: "山田様" },
    title: "羽田→帝国ホテル",
    start: "2025-10-03T09:30:00+09:00",
    end: "2025-10-03T11:00:00+09:00",
    status: "ok",
    is_overnight: false,
    overnight_from_previous_day: false,
    overnight_to_next_day: false,
    amount: 18000
  },
  {
    id: 202,
    vehicleId: 11,
    driverId: null,
    client: { type: "ホテル", name: "帝国ホテル" },
    title: "丸の内→品川(待機)",
    start: "2025-10-03T12:00:00+09:00",
    end: "2025-10-03T15:00:00+09:00",
    status: "warn",
    note: "ドライバー未割当",
    is_overnight: false,
    overnight_from_previous_day: false,
    overnight_to_next_day: false,
    amount: 24000
  },
  {
    id: 203,
    vehicleId: 12,
    driverId: 2,
    client: { type: "代理店", name: "ABCトラベル" },
    title: "成田→都内(ワゴン)",
    start: "2025-10-03T10:00:00+09:00",
    end: "2025-10-03T13:30:00+09:00",
    status: "ok",
    is_overnight: false,
    overnight_from_previous_day: false,
    overnight_to_next_day: false,
    amount: 32000
  },
  {
    id: 205,
    vehicleId: 13,
    driverId: 3,
    client: { type: "個人", name: "佐々木様" },
    title: "成田→都内 深夜送迎",
    start: "2025-10-03T22:30:00+09:00",
    end: "2025-10-04T02:00:00+09:00",
    status: "ok",
    is_overnight: true,
    overnight_from_previous_day: false,
    overnight_to_next_day: true,
    amount: 45000
  },
  {
    id: 204,
    vehicleId: 13,
    driverId: null,
    client: { type: "ハイヤー会社", name: "XYZハイヤー" },
    title: "銀座→横浜・往復",
    start: "2025-10-03T18:30:00+09:00",
    end: "2025-10-03T23:30:00+09:00",
    status: "hard",
    note: "休息不足の恐れ",
    is_overnight: false,
    overnight_from_previous_day: false,
    overnight_to_next_day: false,
    amount: 38000
  },
  {
    id: 206,
    vehicleId: 12,
    driverId: 4,
    client: { type: "個人", name: "前日ナイト" },
    title: "前日22:00→当日送迎",
    start: "2025-10-02T22:00:00+09:00",
    end: "2025-10-03T02:00:00+09:00",
    status: "ok",
    is_overnight: true,
    overnight_from_previous_day: true,
    overnight_to_next_day: false,
    amount: 41000
  }
];

type UnassignedJob = {
  id: string;
  title: string;
  client: { type: string; name: string };
  start: string;
  end: string;
  preferClass: string;
  amount?: number;
};

const UNASSIGNED_JOBS: UnassignedJob[] = [
  {
    id: "J101",
    title: "ホテル→東京駅",
    client: { type: "ホテル", name: "パレスホテル" },
    start: "2025-10-03T14:00:00+09:00",
    end: "2025-10-03T15:00:00+09:00",
    preferClass: "sedan",
    amount: 15000
  },
  {
    id: "J102",
    title: "羽田→赤坂",
    client: { type: "個人", name: "佐藤様" },
    start: "2025-10-03T20:30:00+09:00",
    end: "2025-10-03T21:30:00+09:00",
    preferClass: "luxury",
    amount: 25000
  }
];

type DailyJobRow = {
  id: string;
  name: string;
  timeLabel: string;
  vehicleName: string;
  driverName: string;
  amount?: number;
  source: "booking" | "duty" | "pool";
  sourceLabel: string;
  sortKey: number;
};

type CurrentTimePosition = { visible: boolean; x: number };

function getCurrentTimePosition(now: Date, viewDate: string, pxPerMin: number, contentWidth: number): CurrentTimePosition {
  if (!Number.isFinite(pxPerMin) || pxPerMin <= 0) {
    return { visible: false, x: 0 };
  }
  const viewStart = new Date(`${viewDate}T00:00:00+09:00`);
  if (Number.isNaN(viewStart.getTime())) {
    return { visible: false, x: 0 };
  }
  const viewEnd = new Date(viewStart.getTime() + 24 * 60 * 60 * 1000);
  if (now < viewStart || now > viewEnd) {
    return { visible: false, x: 0 };
  }
  const minutesFromStart = (now.getTime() - viewStart.getTime()) / 60000;
  const x = minutesFromStart * pxPerMin;
  const clampedX = Math.min(Math.max(x, 0), contentWidth);
  return { visible: true, x: clampedX };
}

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
  const ve = new Date(vs.getTime() + DAY_MS);
  let s = new Date(startISO);
  let e = new Date(endISO);
  if (e <= s) e = new Date(e.getTime() + DAY_MS);
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

function computeOvernightInfo(startISO: string, endISO: string, viewDate: string) {
  const start = new Date(startISO);
  const rawEnd = new Date(endISO);
  let normalizedEnd = new Date(rawEnd);
  if (normalizedEnd <= start) normalizedEnd = new Date(normalizedEnd.getTime() + DAY_MS);
  const viewStart = new Date(`${viewDate}T00:00:00+09:00`);
  const viewEnd = new Date(viewStart.getTime() + DAY_MS);
  const overnightFromPreviousDay = start < viewStart && normalizedEnd > viewStart;
  const overnightToNextDay = normalizedEnd > viewEnd && start < viewEnd;
  const isOvernight = overnightFromPreviousDay || overnightToNextDay;
  return {
    is_overnight: isOvernight,
    overnight_from_previous_day: overnightFromPreviousDay,
    overnight_to_next_day: overnightToNextDay
  };
}

function buildOvernightLabel(
  isOvernight: boolean,
  overnightFromPreviousDay?: boolean,
  overnightToNextDay?: boolean
) {
  if (!isOvernight) return "";
  const parts: string[] = [];
  if (overnightFromPreviousDay) parts.push("←前");
  if (overnightToNextDay) parts.push("→翌");
  if (parts.length === 0) return "（夜間）";
  return `（${parts.join("・")}）`;
}

function bookingToJob(b: BoardBooking) {
  const vehicle = VEHICLES.find((v) => v.id === b.vehicleId);
  return { id: `J${b.id}`, title: b.title, client: b.client, start: b.start, end: b.end, preferClass: vehicle?.class || "sedan" };
}

function applyBookingMove(
  b: BoardBooking,
  destVehicleId: number,
  originVehicleId?: number | null,
  originalDriverId?: number | null
): BoardBooking {
  const origin = originVehicleId == null || Number.isNaN(originVehicleId) ? b.vehicleId : originVehicleId;
  const crossed = destVehicleId !== origin;
  const keepDriver = !crossed || isAppJob(b);
  const driverId = keepDriver ? originalDriverId ?? b.driverId ?? null : null;
  return { ...b, vehicleId: destVehicleId, driverId };
}

function isSameVehicleOverlap(all: BoardBooking[], cand: BoardBooking): boolean {
  return all.some((o) => o.id !== cand.id && o.vehicleId === cand.vehicleId && overlap(cand.start, cand.end, o.start, o.end));
}
function hasDriverTimeConflict(all: BoardBooking[], cand: BoardBooking): boolean {
  if (cand.driverId == null) return false;
  return all.some((o) => o.id !== cand.id && o.driverId === cand.driverId && overlap(cand.start, cand.end, o.start, o.end));
}
function minutesBetween(aEndISO: string, bStartISO: string) {
  return Math.round((new Date(bStartISO).getTime() - new Date(aEndISO).getTime()) / 60000);
}
function bufferWarn(all: BoardBooking[], cand: BoardBooking): boolean {
  const same = all
    .filter((o) => o.id !== cand.id && o.vehicleId === cand.vehicleId)
    .sort((x, y) => new Date(x.start).getTime() - new Date(y.start).getTime());
  const sT = new Date(cand.start).getTime();
  let prev: BoardBooking | null = null,
    next: BoardBooking | null = null;
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
function violatesAppDuty(cand: BoardBooking, duties: any[]): boolean {
  return duties.some((d) => d.vehicleId === cand.vehicleId && overlap(cand.start, cand.end, d.start, d.end));
}
function dutyConflictsWithBookings(bookings: BoardBooking[], duty: any): boolean {
  return bookings.some((b) => b.vehicleId === duty.vehicleId && overlap(duty.start, duty.end, b.start, b.end));
}
function vehicleIdAtPoint(clientX: number, clientY: number): number | null {
  let el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  while (el) {
    const v = el.dataset?.vehicleId;
    if (v != null) {
      const id = Number(v);
      if (!Number.isNaN(id)) return id;
    }
    el = el.parentElement as HTMLElement | null;
  }
  return null;
}

function clipIntervalToDay(startISO: string, endISO: string, dayStart: number, dayEnd: number): Interval | null {
  const startDate = new Date(startISO);
  let endDate = new Date(endISO);
  if (endDate <= startDate) {
    endDate = new Date(endDate.getTime() + DAY_MS);
  }
  const start = Math.max(startDate.getTime(), dayStart);
  const end = Math.min(endDate.getTime(), dayEnd);
  if (end <= start) return null;
  return { start, end };
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end) {
      merged.push({ ...interval });
    } else {
      last.end = Math.max(last.end, interval.end);
    }
  }
  return merged;
}

function computeFreeSlots(mergedIntervals: Interval[], dayStart: number, dayEnd: number): Interval[] {
  const slots: Interval[] = [];
  let cursor = dayStart;
  for (const interval of mergedIntervals) {
    if (interval.start > cursor) {
      slots.push({ start: cursor, end: interval.start });
    }
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor < dayEnd) {
    slots.push({ start: cursor, end: dayEnd });
  }
  return slots;
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
  const [bookings, setBookings] = useState<BoardBooking[]>(BOOKINGS);
  const [appDuties, setAppDuties] = useState<AppDuty[]>(APP_DUTIES_INIT);
  const [jobPool, setJobPool] = useState<UnassignedJob[]>(UNASSIGNED_JOBS);
  const [jobFormOpen, setJobFormOpen] = useState(false);
  const [jobDraft, setJobDraft] = useState({
    title: "",
    clientType: "個人",
    clientName: "",
    startTime: "09:00",
    endTime: "10:00",
    preferClass: "sedan"
  });
  const [flashUnassignId, setFlashUnassignId] = useState<number | null>(null);
  const [showJobAmounts, setShowJobAmounts] = useState(true);
  const bookingIdRef = useRef(500);
  const attachmentUrlsRef = useRef<Map<string, string>>(new Map());
  const centerRef = useRef<HTMLDivElement | null>(null);
  const [viewDate, setViewDate] = useState("2025-10-03");
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [now, setNow] = useState(() => new Date());

  const viewDateObj = useMemo(() => new Date(`${viewDate}T00:00:00+09:00`), [viewDate]);
  const viewDateDisplay = useMemo(() => {
    const base = viewDateObj.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const weekday = viewDateObj.toLocaleDateString("ja-JP", { weekday: "short" });
    return `${base}（${weekday}）`;
  }, [viewDateObj]);
  const vehicleDailySummaries = useMemo(() => {
    const dayStart = viewDateObj.getTime();
    if (!Number.isFinite(dayStart)) {
      return VEHICLES.map((vehicle) => ({
        vehicle,
        bookings: [],
        duties: [],
        mergedIntervals: [],
        busyMinutes: 0,
        freeMinutes: 24 * 60,
        longestFreeMinutes: 24 * 60,
        freeSlots: [] as Interval[],
        utilization: 0
      }));
    }
    const dayEnd = dayStart + DAY_MS;
    const totalMinutes = Math.round((dayEnd - dayStart) / 60000);

    return VEHICLES.map((vehicle) => {
      const todaysBookings = bookings
        .filter((b) => b.vehicleId === vehicle.id)
        .map((b) => ({ booking: b, range: clipIntervalToDay(b.start, b.end, dayStart, dayEnd) }))
        .filter((entry): entry is { booking: BoardBooking; range: Interval } => Boolean(entry.range));
      const todaysDuties = appDuties
        .filter((duty) => duty.vehicleId === vehicle.id)
        .map((duty) => ({ duty, range: clipIntervalToDay(duty.start, duty.end, dayStart, dayEnd) }))
        .filter((entry): entry is { duty: AppDuty; range: Interval } => Boolean(entry.range));

      const mergedIntervals = mergeIntervals([
        ...todaysBookings.map((entry) => entry.range),
        ...todaysDuties.map((entry) => entry.range)
      ]);

      const busyMinutes = Math.round(
        mergedIntervals.reduce((acc, interval) => acc + (interval.end - interval.start) / 60000, 0)
      );
      const freeMinutes = Math.max(0, totalMinutes - busyMinutes);

      const freeSlots = computeFreeSlots(mergedIntervals, dayStart, dayEnd);
      const longestFreeMinutes = freeSlots.length
        ? Math.max(...freeSlots.map((slot) => Math.round((slot.end - slot.start) / 60000)))
        : freeMinutes;

      const utilization = totalMinutes === 0 ? 0 : busyMinutes / totalMinutes;

      return {
        vehicle,
        bookings: todaysBookings.map((entry) => entry.booking),
        duties: todaysDuties.map((entry) => entry.duty),
        mergedIntervals,
        busyMinutes,
        freeMinutes,
        freeSlots,
        longestFreeMinutes,
        utilization
      };
    });
  }, [appDuties, bookings, viewDateObj]);
  const driverDailySummaries = useMemo(() => {
    const dayStart = viewDateObj.getTime();
    if (!Number.isFinite(dayStart)) {
      return DRIVERS.map((driver) => ({
        driver,
        bookingCount: 0,
        dutyCount: 0,
        mergedIntervals: [] as Interval[],
        busyMinutes: 0
      }));
    }
    const dayEnd = dayStart + DAY_MS;
    return DRIVERS.map((driver) => {
      const todaysBookings = bookings
        .filter((b) => b.driverId === driver.id)
        .map((b) => clipIntervalToDay(b.start, b.end, dayStart, dayEnd))
        .filter((interval): interval is Interval => Boolean(interval));
      const todaysDuties = appDuties
        .filter((duty) => duty.driverId === driver.id)
        .map((duty) => clipIntervalToDay(duty.start, duty.end, dayStart, dayEnd))
        .filter((interval): interval is Interval => Boolean(interval));
      const mergedIntervals = mergeIntervals([...todaysBookings, ...todaysDuties]);
      const busyMinutes = Math.round(
        mergedIntervals.reduce((acc, interval) => acc + (interval.end - interval.start) / 60000, 0)
      );
      return {
        driver,
        bookingCount: todaysBookings.length,
        dutyCount: todaysDuties.length,
        mergedIntervals,
        busyMinutes
      };
    });
  }, [appDuties, bookings, viewDateObj]);
  const dailyJobRows = useMemo(() => {
    const dayStart = viewDateObj.getTime();
    if (!Number.isFinite(dayStart)) {
      return [] as DailyJobRow[];
    }
    const dayEnd = dayStart + DAY_MS;
    const rows: DailyJobRow[] = [];

    bookings.forEach((booking) => {
      const clipped = clipIntervalToDay(booking.start, booking.end, dayStart, dayEnd);
      if (!clipped) return;
      const vehicleName = vehicleMap.get(booking.vehicleId)?.name ?? "未割当";
      const driverName =
        booking.driverId != null ? driverMap.get(booking.driverId)?.name ?? "未割当" : "未割当";
      rows.push({
        id: `booking-${booking.id}`,
        name: booking.title,
        timeLabel: `${formatTimeInJst(clipped.start)}〜${formatTimeInJst(clipped.end)}`,
        vehicleName,
        driverName,
        amount: booking.amount,
        source: "booking",
        sourceLabel: "予約",
        sortKey: clipped.start
      });
    });

    appDuties.forEach((duty) => {
      const clipped = clipIntervalToDay(duty.start, duty.end, dayStart, dayEnd);
      if (!clipped) return;
      const vehicleName = vehicleMap.get(duty.vehicleId)?.name ?? "未割当";
      const driverName = duty.driverId != null ? driverMap.get(duty.driverId)?.name ?? "未割当" : "未割当";
      rows.push({
        id: `duty-${duty.id}`,
        name: `${duty.service}（アプリ）`,
        timeLabel: `${formatTimeInJst(clipped.start)}〜${formatTimeInJst(clipped.end)}`,
        vehicleName,
        driverName,
        amount: duty.amount,
        source: "duty",
        sourceLabel: "アプリ",
        sortKey: clipped.start
      });
    });

    jobPool.forEach((job) => {
      const clipped = clipIntervalToDay(job.start, job.end, dayStart, dayEnd);
      if (!clipped) return;
      const vehicleName = job.preferClass
        ? `${VEHICLE_CLASS_LABELS[job.preferClass] ?? job.preferClass}希望`
        : "未割当";
      rows.push({
        id: `pool-${job.id}`,
        name: `${job.title}（未割当）`,
        timeLabel: `${formatTimeInJst(clipped.start)}〜${formatTimeInJst(clipped.end)}`,
        vehicleName,
        driverName: "割当待ち",
        amount: job.amount,
        source: "pool",
        sourceLabel: "ジョブプール",
        sortKey: clipped.start
      });
    });

    return rows.sort((a, b) => a.sortKey - b.sortKey);
  }, [appDuties, bookings, jobPool, viewDateObj]);
  const totalMonthlyJobs = useMemo(
    () => DRIVERS.reduce((acc, driver) => acc + driver.monthlyJobs, 0),
    []
  );
  const shiftViewDate = (delta: number) => {
    const next = new Date(viewDateObj);
    next.setDate(next.getDate() + delta);
    setViewDate(`${next.getFullYear()}-${pad2(next.getMonth() + 1)}-${pad2(next.getDate())}`);
  };
  const resetJobDraft = () => {
    setJobDraft({
      title: "",
      clientType: "個人",
      clientName: "",
      startTime: "09:00",
      endTime: "10:00",
      preferClass: "sedan"
    });
  };
  const openJobForm = () => {
    resetJobDraft();
    setJobFormOpen(true);
  };
  const closeJobForm = () => setJobFormOpen(false);
  const handleJobDraftChange = (field: keyof JobDraft, value: string) => {
    setJobDraft((prev) => ({ ...prev, [field]: value }));
  };
  const handleCreateJob = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = jobDraft.title.trim();
    const trimmedClientName = jobDraft.clientName.trim();
    if (!trimmedTitle) {
      alert("ジョブ名を入力してください");
      return;
    }
    if (!trimmedClientName) {
      alert("顧客名を入力してください");
      return;
    }
    const startDate = new Date(`${viewDate}T${jobDraft.startTime || "00:00"}:00+09:00`);
    let endDate = new Date(`${viewDate}T${jobDraft.endTime || "00:00"}:00+09:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      alert("開始・終了時刻を正しく入力してください");
      return;
    }
    if (endDate <= startDate) {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    }
    const newJob = {
      id: `J${Date.now()}`,
      title: trimmedTitle,
      client: { type: jobDraft.clientType.trim() || "その他", name: trimmedClientName },
      start: toJstIso(startDate),
      end: toJstIso(endDate),
      preferClass: jobDraft.preferClass || "sedan"
    };
    setJobPool((prev) => [...prev, newJob]);
    resetJobDraft();
    setJobFormOpen(false);
  };
  const openDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof (input as HTMLInputElement & { showPicker?: () => void }).showPicker === "function") {
      (input as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
      return;
    }
    input.click();
  };


  useEffect(() => {
    const el = centerRef.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth;
      if (!Number.isFinite(w) || w <= 0) return;
      const base = Math.max(MIN_PX_PER_MIN, w / (24 * 60));
      const next = fullView ? base : Math.min(DEFAULT_PX_PER_MIN, base);
      setPxPerMin((prev) => (Math.abs(prev - next) < 0.005 ? prev : next));
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

  useEffect(() => {
    if (typeof window === "undefined") return () => undefined;
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      attachmentUrlsRef.current.forEach((url) => {
        if (typeof url === "string" && url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      });
      attachmentUrlsRef.current.clear();
    };
  }, []);

  const CONTENT_WIDTH = Math.round(24 * 60 * pxPerMin);
  const currentTimePosition = useMemo(
    () => getCurrentTimePosition(now, viewDate, pxPerMin, CONTENT_WIDTH),
    [now, viewDate, pxPerMin, CONTENT_WIDTH]
  );
  const bookingsByVehicle = useMemo(() => {
    const map = new Map<number, BoardBooking[]>();
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

  const { hasPrevOvernight, hasNextOvernight } = useMemo(() => {
    let prev = false;
    let next = false;
    const inspect = (
      item: Pick<BoardBooking, "start" | "end"> & {
        overnight_from_previous_day?: boolean;
        overnight_to_next_day?: boolean;
      }
    ) => {
      if (prev && next) return;
      const meta = computeOvernightInfo(item.start, item.end, viewDate);
      const prevFlag = item.overnight_from_previous_day ?? meta.overnight_from_previous_day;
      const nextFlag = item.overnight_to_next_day ?? meta.overnight_to_next_day;
      if (prevFlag) prev = true;
      if (nextFlag) next = true;
    };
    bookings.forEach(inspect);
    appDuties.forEach(inspect);
    return { hasPrevOvernight: prev, hasNextOvernight: next };
  }, [bookings, appDuties, viewDate]);

  const canZoom = fullView;
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

  const registerAttachmentUrls = (attachments: BookingAttachment[]) => {
    attachments.forEach((attachment) => {
      attachmentUrlsRef.current.set(attachment.id, attachment.url);
    });
  };

  const revokeAttachmentUrls = (ids: string[]) => {
    ids.forEach((id) => {
      const url = attachmentUrlsRef.current.get(id);
      if (url && url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
      attachmentUrlsRef.current.delete(id);
    });
  };

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
    let moved = false;
    let driverUnassigned = false;
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
      driverUnassigned = cur.driverId != null && finalized.driverId == null;
      return prev.map((x) => (x.id === bookingId ? finalized : x));
    });
    if (moved && driverUnassigned) {
      setFlashUnassignId(bookingId);
      window.setTimeout(() => setFlashUnassignId(null), 1500);
    }
  };

  const handleUpdateBookingNote = (id: number, note: string) => {
    setBookings((prev) => prev.map((booking) => (booking.id === id ? { ...booking, note } : booking)));
    setDrawerItem((prev: any) => {
      if (!prev || prev.type !== "booking" || prev.data?.id !== id) return prev;
      if (prev.data?.note === note) return prev;
      return { ...prev, data: { ...prev.data, note } };
    });
  };

  const handleAddBookingAttachments = (id: number, files: FileList) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    const newAttachments = fileArray.map((file) => makeAttachmentFromFile(file));
    registerAttachmentUrls(newAttachments);
    setBookings((prev) =>
      prev.map((booking) =>
        booking.id === id
          ? { ...booking, attachments: [...(booking.attachments ?? []), ...newAttachments] }
          : booking
      )
    );
    setDrawerItem((prev: any) => {
      if (!prev || prev.type !== "booking" || prev.data?.id !== id) return prev;
      return {
        ...prev,
        data: {
          ...prev.data,
          attachments: [...((prev.data?.attachments as BookingAttachment[] | undefined) ?? []), ...newAttachments]
        }
      };
    });
  };

  const handleRemoveBookingAttachment = (bookingId: number, attachmentId: string) => {
    const removed: BookingAttachment[] = [];
    setBookings((prev) =>
      prev.map((booking) => {
        if (booking.id !== bookingId) return booking;
        const nextAttachments = (booking.attachments ?? []).filter((attachment) => {
          if (attachment.id === attachmentId) {
            removed.push(attachment);
            return false;
          }
          return true;
        });
        return { ...booking, attachments: nextAttachments };
      })
    );
    setDrawerItem((prev: any) => {
      if (!prev || prev.type !== "booking" || prev.data?.id !== bookingId) return prev;
      const nextAttachments = ((prev.data?.attachments as BookingAttachment[] | undefined) ?? []).filter(
        (attachment) => {
          if (attachment.id === attachmentId) {
            if (!removed.find((att) => att.id === attachmentId)) {
              removed.push(attachment);
            }
            return false;
          }
          return true;
        }
      );
      return { ...prev, data: { ...prev.data, attachments: nextAttachments } };
    });
    if (removed.length) {
      revokeAttachmentUrls(removed.map((attachment) => attachment.id));
    }
  };

  const handleResizeBooking = (bookingId: number, nextStartIso: string, nextEndIso: string) => {
    let applied = false;
    setBookings((prev) => {
      const cur = prev.find((x) => x.id === bookingId);
      if (!cur) return prev;
      const startDate = new Date(nextStartIso);
      const endDate = new Date(nextEndIso);
      if (endDate.getTime() <= startDate.getTime()) {
        return prev;
      }
      const minDurationMs = MIN_BOOKING_DURATION_MINUTES * 60000;
      if (endDate.getTime() - startDate.getTime() < minDurationMs) {
        alert(`予約は最低${MIN_BOOKING_DURATION_MINUTES}分必要です`);
        return prev;
      }
      const overnightMeta = computeOvernightInfo(nextStartIso, nextEndIso, viewDate);
      const cand: BoardBooking = { ...cur, ...overnightMeta, start: nextStartIso, end: nextEndIso };
      const others = prev.filter((x) => x.id !== bookingId);
      if (isSameVehicleOverlap(others, cand)) {
        alert("同じ車両の他予約と時間が重複しています");
        return prev;
      }
      if (violatesAppDuty(cand, appDuties)) {
        alert("アプリ稼働と重複するため時間調整できません");
        return prev;
      }
      if (hasDriverTimeConflict(prev, cand)) {
        alert("割り当てドライバーの他予約と重複しています");
        return prev;
      }
      const warn = bufferWarn(prev, cand);
      const status = cand.status === "hard" ? "hard" : warn ? "warn" : "ok";
      applied = true;
      const updated: BoardBooking = { ...cand, status };
      return prev.map((x) => (x.id === bookingId ? updated : x));
    });
    return applied;
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

  const assignDriverToAppDuty = (dutyId: string, driverId: number) => {
    const duty = appDuties.find((x) => x.id === dutyId);
    if (!duty) return false;
    if (duty.driverId === driverId) return false;

    const incomingDriverName = driverMap.get(driverId)?.name ?? "新ドライバー";
    const currentDriverName =
      duty.driverId != null ? driverMap.get(duty.driverId)?.name ?? "現在のドライバー" : null;

    const message = currentDriverName
      ? `現在: ${currentDriverName} → 新: ${incomingDriverName} に変更しますか？`
      : `${incomingDriverName} をこのアプリ配車に割り当てますか？`;

    const ok = typeof window === "undefined" ? true : window.confirm(message);
    if (!ok) return false;

    setAppDuties((prev) => prev.map((x) => (x.id === dutyId ? { ...x, driverId } : x)));
    return true;
  };

  const handleResizeDuty = (dutyId: string, nextStartIso: string, nextEndIso: string) => {
    let applied = false;
    const snapToStep = (iso: string) => {
      const date = new Date(iso);
      const minutes = Math.round(date.getTime() / 60000);
      const snapped = Math.round(minutes / RESIZE_STEP_MINUTES) * RESIZE_STEP_MINUTES;
      return new Date(snapped * 60000);
    };
    setAppDuties((prev) => {
      const cur = prev.find((x) => x.id === dutyId);
      if (!cur) return prev;
      const snappedStart = snapToStep(nextStartIso);
      const snappedEnd = snapToStep(nextEndIso);
      if (snappedEnd.getTime() <= snappedStart.getTime()) {
        return prev;
      }
      const minDurationMs = MIN_BOOKING_DURATION_MINUTES * 60000;
      if (snappedEnd.getTime() - snappedStart.getTime() < minDurationMs) {
        alert(`アプリ稼働は最低${MIN_BOOKING_DURATION_MINUTES}分必要です`);
        return prev;
      }
      const nextStart = toJstIso(snappedStart);
      const nextEnd = toJstIso(snappedEnd);
      const overnightMeta = computeOvernightInfo(nextStart, nextEnd, viewDate);
      const cand = { ...cur, ...overnightMeta, start: nextStart, end: nextEnd };
      const others = prev.filter((x) => x.id !== dutyId);
      if (others.some((o) => o.vehicleId === cand.vehicleId && overlap(cand.start, cand.end, o.start, o.end))) {
        alert("他のアプリ稼働と重複のため時間調整できません");
        return prev;
      }
      if (dutyConflictsWithBookings(bookings, cand)) {
        alert("予約と重複するため時間調整できません");
        return prev;
      }
      applied = true;
      return prev.map((x) => (x.id === dutyId ? cand : x));
    });
    return applied;
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
    const baseBooking = {
      id: ++bookingIdRef.current,
      vehicleId,
      driverId: null,
      client: job.client,
      title: job.title,
      start: toJstIso(start),
      end: toJstIso(end),
      status: "warn" as const,
      note: "ドライバー未割当（ジョブから配置：カード時刻にスナップ）"
    };
    const overnightMeta = computeOvernightInfo(baseBooking.start, baseBooking.end, viewDate);
    const newBooking: BoardBooking = { ...baseBooking, ...overnightMeta };
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
      <style>{`@keyframes badge-blink{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(251,191,36,0);border-color:inherit}50%{opacity:0.3;box-shadow:0 0 0 3px rgba(251,191,36,0.9);border-color:rgb(251 191 36)}}.badge-flash{animation:badge-blink 0.3s ease-in-out 5}`}</style>
      <div className="w-full p-4 bg-slate-50">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-end gap-3">
              <h1 className="text-3xl md:text-4xl font-bold leading-tight text-slate-800">配車ボード</h1>
              <span className="text-4xl font-extrabold tracking-tight text-slate-900 leading-none">{viewDateDisplay}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
                onClick={() => shiftViewDate(-1)}
                title="前日へ"
              >
                ◀
              </button>
              <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 shadow-sm">
                <span className="text-xl font-semibold tracking-wider text-slate-800">{viewDate}</span>
              </div>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
                onClick={() => shiftViewDate(1)}
                title="翌日へ"
              >
                ▶
              </button>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                onClick={openDatePicker}
                title="カレンダーから日付を選択"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M7 3v2m10-2v2M5 8h14M6 6h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" strokeLinecap="round" strokeLinejoin="round" />
                  <rect x="8" y="11" width="3" height="3" rx="0.5" />
                  <rect x="13" y="11" width="3" height="3" rx="0.5" />
                  <rect x="8" y="15" width="3" height="3" rx="0.5" />
                  <rect x="13" y="15" width="3" height="3" rx="0.5" />
                </svg>
              </button>
              <input
                ref={dateInputRef}
                type="date"
                className="sr-only"
                value={viewDate}
                onChange={(e) => {
                  if (e.target.value) setViewDate(e.target.value);
                }}
              />
            </div>
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
            <div
              className={`inline-flex rounded overflow-hidden border transition-colors ${
                canZoom ? "border-slate-500 shadow-sm" : "border-slate-200 opacity-60"
              }`}
            >
              <button
                type="button"
                className={`px-3 py-1 text-lg font-semibold ${
                  canZoom ? "text-slate-700 hover:bg-slate-100" : "cursor-not-allowed text-slate-400"
                }`}
                onClick={() => zoom(-0.25)}
                disabled={!canZoom}
                aria-disabled={!canZoom}
                title={canZoom ? "ズームアウト" : "24h表示でのみ操作可能"}
              >
                -
              </button>
              <span className={`px-2 py-1 text-xs w-16 text-center ${canZoom ? "text-slate-600" : "text-slate-400"}`}>
                {pxPerMin.toFixed(2)} px/m
              </span>
              <button
                type="button"
                className={`px-3 py-1 text-lg font-semibold ${
                  canZoom ? "text-slate-700 hover:bg-slate-100" : "cursor-not-allowed text-slate-400"
                }`}
                onClick={() => zoom(+0.25)}
                disabled={!canZoom}
                aria-disabled={!canZoom}
                title={canZoom ? "ズームイン" : "24h表示でのみ操作可能"}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3 items-start">
          <div className="bg-white rounded-2xl shadow p-3 overflow-auto relative max-h-[560px]" style={{ width: driverWidth }}>
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

          <div className="relative flex-1 min-w-0">
            {hasPrevOvernight ? (
              <button
                type="button"
                onClick={() => shiftViewDate(-1)}
                className="absolute left-2 top-1/2 z-20 flex h-28 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-sm font-semibold text-slate-700 shadow hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                style={{ writingMode: "vertical-rl", textOrientation: "upright" }}
                aria-label="前日の夜間予約へ移動"
                title="前日の夜間予約へ移動"
              >
                ←前
              </button>
            ) : null}
            {hasNextOvernight ? (
              <button
                type="button"
                onClick={() => shiftViewDate(1)}
                className="absolute right-2 top-1/2 z-20 flex h-28 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white/90 text-sm font-semibold text-slate-700 shadow hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                style={{ writingMode: "vertical-rl", textOrientation: "upright" }}
                aria-label="翌日の夜間予約へ移動"
                title="翌日の夜間予約へ移動"
              >
                →翌
              </button>
            ) : null}
            <div
              ref={centerRef}
              className={`w-full bg-white rounded-2xl shadow p-3 relative overflow-y-auto ${fullView ? "overflow-x-hidden" : "overflow-x-auto"}`}
            >
              <div className="flex items-center justify-between mb-2 sticky left-0 top-0 z-10 bg-white pr-2">
                <h2 className="font-medium">モータープール</h2>
                <span className="text-xs text-slate-500">00:00〜24:00（{pxPerMin.toFixed(2)} px/min）</span>
              </div>

              <div className="relative" style={{ width: CONTENT_WIDTH }}>
                <GridOverlay hourPx={60 * pxPerMin} />
                {currentTimePosition.visible ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 w-[2px] bg-amber-500"
                    style={{ left: 0, transform: `translateX(${currentTimePosition.x}px)` }}
                  />
                ) : null}

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
                          viewDate={viewDate}
                          isOvernight={a.is_overnight}
                          overnightFromPreviousDay={a.overnight_from_previous_day}
                          overnightToNextDay={a.overnight_to_next_day}
                          onClick={() => openDrawer({ type: "duty", data: a, vehicle: v })}
                          isSelected={selected?.type === "duty" && selected?.id === a.id}
                          onMoveDutyToVehicle={(dutyId, fromVehicleId, destVehicleId) =>
                            moveDutyByPointer(dutyId, fromVehicleId, destVehicleId)
                          }
                          onDriverDrop={(dutyId, driverId) => assignDriverToAppDuty(dutyId, driverId)}
                          onResize={(dutyId, nextStart, nextEnd) => handleResizeDuty(dutyId, nextStart, nextEnd)}
                        />
                      ))}
                      {(bookingsByVehicle.get(v.id) || []).map((b: BoardBooking) => (
                        <BookingBlock
                          key={b.id}
                          booking={b}
                          pxPerMin={pxPerMin}
                          viewDate={viewDate}
                          isOvernight={b.is_overnight}
                          overnightFromPreviousDay={b.overnight_from_previous_day}
                          overnightToNextDay={b.overnight_to_next_day}
                          onClick={() => openDrawer({ type: "booking", data: b, vehicle: v })}
                          isSelected={selected?.type === "booking" && selected?.id === b.id}
                          resizable={isAppJob(b)}
                          onDriverDrop={(bookingId: number, driverId: number) => {
                            const cur = bookings.find((x) => x.id === bookingId);
                            if (!cur) return;
                            if (cur.driverId === driverId) return;
                            if (cur.driverId != null && cur.driverId !== driverId) {
                              const currentDriverName = driverMap.get(cur.driverId)?.name ?? "現在ドライバー";
                              const incomingDriverName = driverMap.get(driverId)?.name ?? "新ドライバー";
                              const ok =
                                typeof window === "undefined"
                                  ? true
                                  : window.confirm(`現在: ${currentDriverName} → 新: ${incomingDriverName} に変更しますか？`);
                              if (!ok) return;
                            }
                            const cand: BoardBooking = { ...cur, driverId };
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
                          onResize={(bookingId, nextStart, nextEnd) => handleResizeBooking(bookingId, nextStart, nextEnd)}
                        />
                      ))}

                      <div className="absolute left-2 top-1 text-[11px] text-slate-500 bg-white/80 rounded px-1">{v.name}</div>
                    </div>
                  ))}
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-stretch gap-0">
          <button
            type="button"
            className="w-32 shrink-0 rounded-l-2xl bg-amber-500 px-4 text-lg font-semibold tracking-wide text-white shadow-md hover:bg-amber-500/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            title="新しいジョブを登録"
            onClick={openJobForm}
          >
            新規追加
          </button>
          <div
            ref={jobPoolRef}
            className="flex-1 bg-white rounded-r-2xl shadow-md p-3"
            onDragOver={handleJobPoolDragOver}
            onDragLeave={handleJobPoolDragLeave}
            onDrop={handleJobPoolDrop}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-medium">ジョブプール（未割当）</h2>
              <span className="text-xs text-slate-500">{jobPool.length} 件</span>
            </div>
            {jobPool.length > 0 && (
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
        </div>

        <div className="mt-8 space-y-8">
          <section id="driver-info" className="scroll-mt-24">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">ドライバー情報</h2>
                  <p className="text-xs text-slate-500">{viewDateDisplay} の稼働サマリー</p>
                </div>
                <div className="text-right text-xs text-slate-500 space-y-1">
                  <div>登録ドライバー {driverDailySummaries.length} 名</div>
                  <div>今月の配車総数 {totalMonthlyJobs} 件</div>
                </div>
              </div>
              <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 xl:grid-cols-4">
                {driverDailySummaries.map((summary) => {
                  const { driver, bookingCount, dutyCount, mergedIntervals, busyMinutes } = summary;
                  const totalAssignments = bookingCount + dutyCount;
                  const statusLabel = totalAssignments > 0 ? "稼働中" : "待機";
                  const firstInterval = mergedIntervals[0];
                  const lastInterval = mergedIntervals[mergedIntervals.length - 1];
                  const activeWindow = busyMinutes > 0 && firstInterval && lastInterval
                    ? `${formatTimeInJst(firstInterval.start)}〜${formatTimeInJst(lastInterval.end)}`
                    : null;
                  return (
                    <div
                      key={driver.id}
                      className="flex h-full flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/40 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-slate-800">{driver.name}</div>
                          <div className="text-xs text-slate-500">{driver.code}</div>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                          <div className="inline-flex items-center justify-center rounded-full bg-slate-800/80 px-2 py-0.5 text-[11px] font-semibold text-white">
                            第{driver.currentDispatchNumber}回</div>
                          <div className="mt-1">今月 {driver.monthlyJobs} 件</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
                        <div className="space-y-1">
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">担当状況</div>
                          <div className="text-sm font-semibold text-slate-800">{statusLabel}</div>
                          <div>予約 {bookingCount} 件</div>
                          <div>アプリ {dutyCount} 件</div>
                        </div>
                        <div className="space-y-1 text-right">
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">稼働時間</div>
                          <div className="text-sm font-semibold text-slate-800">
                            {busyMinutes > 0 ? formatMinutesLabel(busyMinutes) : "終日空き"}
                          </div>
                          {activeWindow ? <div>{activeWindow}</div> : <div>次空き：終日</div>}
                          <div>延長使用 {driver.extUsed}/7</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section id="job-summary" className="scroll-mt-24">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">ジョブタイムライン</h2>
                  <p className="text-xs text-slate-500">{viewDateDisplay} のジョブカード一覧</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                  <div>本日のジョブ {dailyJobRows.length} 件</div>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-slate-800 focus:ring-slate-500"
                      checked={showJobAmounts}
                      onChange={(event) => setShowJobAmounts(event.target.checked)}
                    />
                    <span>金額を表示（管理者）</span>
                  </label>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-5 py-3 font-semibold">ジョブ</th>
                      <th scope="col" className="px-5 py-3 font-semibold">開始時間</th>
                      <th scope="col" className="px-5 py-3 font-semibold">車両</th>
                      <th scope="col" className="px-5 py-3 font-semibold">ドライバー</th>
                      {showJobAmounts && (
                        <th scope="col" className="px-5 py-3 text-right font-semibold">金額</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                    {dailyJobRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={showJobAmounts ? 5 : 4}
                          className="px-5 py-6 text-center text-sm text-slate-500"
                        >
                          本日のジョブはありません。
                        </td>
                      </tr>
                    ) : (
                      dailyJobRows.map((row) => (
                        <tr key={row.id} className="transition-colors hover:bg-slate-50/70">
                          <td className="px-5 py-3 align-top">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium text-slate-800">{row.name}</span>
                              <span className="w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {row.sourceLabel}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3 align-top text-slate-600">{row.timeLabel}</td>
                          <td className="px-5 py-3 align-top text-slate-600">{row.vehicleName}</td>
                          <td className="px-5 py-3 align-top text-slate-600">{row.driverName}</td>
                          {showJobAmounts && (
                            <td className="px-5 py-3 align-top text-right text-slate-600">
                              {row.amount != null ? formatCurrency(row.amount) : "—"}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section id="vehicle-info" className="scroll-mt-24">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">車両情報</h2>
                  <p className="text-xs text-slate-500">
                    車検証・整備履歴・事故記録などを管理する専用ページへの入り口です。
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500 space-y-1">
                  <div>登録車両 {vehicleDailySummaries.length} 台</div>
                  <div>本日稼働中 {vehicleDailySummaries.filter((summary) => summary.busyMinutes > 0).length} 台</div>
                </div>
              </div>
              <div className="space-y-4 px-5 py-5 text-sm text-slate-700">
                <p>
                  配車ボードでは概要のみを確認し、詳細は別ページで登録・更新します。車両ごとの点検日や車検期限、事故歴、添付資料などを整理できるワークスペースを想定しています。
                </p>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-slate-500">本日の予約件数</dt>
                      <dd className="text-lg font-semibold text-slate-800">
                        {vehicleDailySummaries.reduce((acc, summary) => acc + summary.bookings.length, 0)} 件
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-slate-500">アプリ稼働件数</dt>
                      <dd className="text-lg font-semibold text-slate-800">
                        {vehicleDailySummaries.reduce((acc, summary) => acc + summary.duties.length, 0)} 件
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="/vehicle-ledger"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-800 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-slate-700"
                  >
                    車両情報ページを開く
                  </a>
                  <span className="text-xs text-slate-500 self-center">
                    ※ 別タブで詳細管理ページを想定（モックリンク）
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section id="customer-info" className="scroll-mt-24">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-800">顧客情報</h2>
                  <p className="text-xs text-slate-500">
                    顧客の連絡先・契約条件・請求履歴を管理する専用ボードへの導線です。
                  </p>
                </div>
                <div className="text-xs text-slate-500">
                  <span>ボード内に顧客カードを追加予定</span>
                </div>
              </div>
              <div className="space-y-4 px-5 py-5 text-sm text-slate-700">
                <p>
                  配車ボードからは顧客の基本的な識別のみを行い、詳細な契約内容や注意事項は専用ボードで管理します。将来的にはジョブや予約から顧客カードへリンクする設計を想定しています。
                </p>
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-xs text-slate-500">
                  顧客ボードでは、法人・個人別のタブや担当営業メモ、請求書ファイルの保管などを配置予定です。
                </div>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="/customer-board"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500"
                  >
                    顧客情報ページを開く
                  </a>
                  <span className="text-xs text-slate-500 self-center">
                    ※ 別ページで顧客台帳を構築予定（モックリンク）
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {jobFormOpen && (
          <JobFormModal
            draft={jobDraft}
            onClose={closeJobForm}
            onChange={handleJobDraftChange}
            onSubmit={handleCreateJob}
            viewDateLabel={viewDateDisplay}
          />
        )}

        {drawerOpen && (
          <Drawer isMobile={isMobile} onClose={closeDrawer}>
            <DetailsPane
              item={drawerItem}
              onReturn={(id: number) => returnBookingToJobPool(id)}
              onUpdateNote={handleUpdateBookingNote}
              onAddAttachment={handleAddBookingAttachments}
              onRemoveAttachment={handleRemoveBookingAttachment}
            />
          </Drawer>
        )}
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

function AppDutyBlock({
  duty,
  pxPerMin,
  viewDate,
  onClick,
  isSelected,
  onMoveDutyToVehicle,
  onDriverDrop,
  onResize,
  isOvernight = false,
  overnightFromPreviousDay = false,
  overnightToNextDay = false
}: {
  duty: AppDuty;
  pxPerMin: number;
  viewDate: string;
  onClick: () => void;
  isSelected?: boolean;
  onMoveDutyToVehicle: (dutyId: string, fromVehicleId: number, destVehicleId: number) => void;
  onDriverDrop: (dutyId: string, driverId: number) => boolean;
  onResize: (dutyId: string, nextStart: string, nextEnd: string) => boolean;
  isOvernight?: boolean;
  overnightFromPreviousDay?: boolean;
  overnightToNextDay?: boolean;
}) {
  const [allowDrag, setAllowDrag] = useState(true);
  const [draftRange, setDraftRange] = useState<DraftRange | null>(null);
  const draftRangeRef = useRef<DraftRange | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const suppressClickRef = useRef(false);

  const applyDraftRange = (next: DraftRange | null) => {
    draftRangeRef.current = next;
    setDraftRange(next);
  };

  useEffect(() => {
    draftRangeRef.current = null;
    setDraftRange(null);
    setAllowDrag(true);
  }, [duty.start, duty.end]);

  const displayStart = draftRange?.start ?? duty.start;
  const displayEnd = draftRange?.end ?? duty.end;
  const { left, width, clipL, clipR } = rangeForDay(displayStart, displayEnd, viewDate, pxPerMin);
  const showLeftFlag = Boolean((isOvernight && clipL) || overnightFromPreviousDay);
  const showRightFlag = Boolean((isOvernight && clipR) || overnightToNextDay);
  const overnightLabel = buildOvernightLabel(isOvernight, overnightFromPreviousDay, overnightToNextDay);
  if (width <= 0) return null;
  const driver = duty.driverId != null ? driverMap.get(duty.driverId) ?? null : null;
  const driverBadgeRef = useFlashOnChange<HTMLSpanElement>(driver ? `${driver.id}-${driver.name}` : "", 1500);
  const [driverDragOver, setDriverDragOver] = useState(false);

  const handleDriverDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    const types = Array.from(e.dataTransfer?.types || []);
    if (!types.includes("text/x-driver-id")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setDriverDragOver(true);
  };

  const handleDriverDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDriverDragOver(false);
  };

  const handleDriverDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDriverDragOver(false);
    const types = Array.from(e.dataTransfer?.types || []);
    if (!types.includes("text/x-driver-id")) return;
    const raw = e.dataTransfer.getData("text/x-driver-id");
    const driverId = Number(raw);
    if (Number.isNaN(driverId)) return;
    suppressClickRef.current = true;
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 200);
    } else {
      suppressClickRef.current = false;
    }
    onDriverDrop(duty.id, driverId);
  };

  const driverLabel = driver ? `（${driver.name}）` : "";

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
    if (!allowDrag) return;
    if (e.pointerType === "mouse") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pId.current = e.pointerId;
    longRef.current = window.setTimeout(() => {
      draggingTouch.current = true;
    }, LP_MS);
  };
  const onPointerMove = (e: any) => {
    if (!allowDrag) return;
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

  const beginResize = (side: "start" | "end") => (e: any) => {
    e.stopPropagation();
    e.preventDefault();
    setAllowDrag(false);
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
    resizeStateRef.current = {
      side,
      pointerId: e.pointerId,
      startX: e.clientX,
      baseStart: new Date(duty.start),
      baseEnd: new Date(duty.end),
      lastStep: 0
    };
    applyDraftRange({ start: duty.start, end: duty.end });
  };

  const onResizeMove = (e: any) => {
    const state = resizeStateRef.current;
    if (!state || e.pointerId !== state.pointerId) return;
    e.stopPropagation();
    const deltaPx = e.clientX - state.startX;
    if (!pxPerMin) return;
    const deltaMinutes = deltaPx / pxPerMin;
    const step = Math.round(deltaMinutes / RESIZE_STEP_MINUTES) * RESIZE_STEP_MINUTES;
    if (step === state.lastStep) return;
    state.lastStep = step;
    let nextStart = new Date(state.baseStart);
    let nextEnd = new Date(state.baseEnd);
    if (state.side === "start") {
      nextStart = new Date(state.baseStart.getTime() + step * 60000);
      const maxStart = state.baseEnd.getTime() - MIN_BOOKING_DURATION_MINUTES * 60000;
      if (nextStart.getTime() > maxStart) {
        nextStart = new Date(maxStart);
      }
    } else {
      nextEnd = new Date(state.baseEnd.getTime() + step * 60000);
      const minEnd = state.baseStart.getTime() + MIN_BOOKING_DURATION_MINUTES * 60000;
      if (nextEnd.getTime() < minEnd) {
        nextEnd = new Date(minEnd);
      }
    }
    const draft: DraftRange = { start: toJstIso(nextStart), end: toJstIso(nextEnd) };
    const prev = draftRangeRef.current;
    if (prev && prev.start === draft.start && prev.end === draft.end) return;
    applyDraftRange(draft);
  };

  const finishResize = (e: any, applyChange: boolean) => {
    const state = resizeStateRef.current;
    if (!state || e.pointerId !== state.pointerId) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(state.pointerId);
    } catch (err) {
      /* ignore */
    }
    resizeStateRef.current = null;
    setAllowDrag(true);
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 200);
    const finalRange = draftRangeRef.current;
    if (!applyChange || !finalRange) {
      applyDraftRange(null);
      return;
    }
    const changed = finalRange.start !== duty.start || finalRange.end !== duty.end;
    if (!changed) {
      applyDraftRange(null);
      return;
    }
    const ok = onResize(duty.id, finalRange.start, finalRange.end);
    if (!ok) {
      applyDraftRange(null);
    }
  };

  const onResizePointerUp = (e: any) => finishResize(e, true);
  const onResizePointerCancel = (e: any) => finishResize(e, false);

  const startLabel = fmt(displayStart);
  const endLabel = fmt(displayEnd);
  const showDraft = draftRange != null;

  const handleCardClick = () => {
    if (suppressClickRef.current || resizeStateRef.current) return;
    onClick();
  };

  return (
    <div
      className={`absolute top-2 h-12 bg-purple-500/25 border border-purple-300/60 rounded-lg px-2 py-1 text-[11px] text-purple-900 flex flex-col justify-between cursor-pointer ${
        isSelected ? "ring-2 ring-blue-500 shadow-lg" : ""
      } ${showDraft ? "ring-2 ring-purple-400" : ""} ${driverDragOver ? "ring-2 ring-blue-400 shadow-lg" : ""}`}
      style={{ left, width }}
      title={`${duty.service}${driverLabel}`}
      onClick={handleCardClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDragOver={handleDriverDragOver}
      onDragLeave={handleDriverDragLeave}
      onDrop={handleDriverDrop}
      draggable={allowDrag}
      onDragStart={(e) => {
        if (!allowDrag) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/x-duty-move", String(duty.id));
        e.dataTransfer.setData("text/x-from-vehicle-id", String(duty.vehicleId));
        e.dataTransfer.setData("text/plain", String(duty.id));
      }}
    >
      {showLeftFlag && <EdgeFlag pos="left" />}
      <div
        className="absolute inset-y-0 left-0 w-2 cursor-ew-resize flex items-center justify-center"
        onPointerDown={beginResize("start")}
        onPointerMove={onResizeMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerCancel}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-1 h-4 bg-purple-400 rounded-full" />
      </div>
      <div className="flex items-center justify-between gap-2 pr-6">
        <div className="truncate font-semibold">{duty.service}</div>
        <span
          ref={driverBadgeRef}
          className={`text-[10px] px-2 py-0.5 rounded border ${
            driver
              ? "border-white bg-white/80 text-purple-900"
              : "border-dashed border-white/60 text-purple-900/70 bg-white/40"
          }`}
        >
          {driver ? `${driver.name}（${driver.code}）` : "未割当"}
        </span>
      </div>
      <div className="flex items-end justify-between gap-2 pr-6">
        <div className="truncate">
          {startLabel}-{endLabel}
          {overnightLabel}
        </div>
        <div className="ml-auto text-[10px] bg-white/60 px-1 rounded">アプリ稼働</div>
      </div>
      {showRightFlag && <EdgeFlag pos="right" />}
      <div
        className="absolute inset-y-0 right-0 w-2 cursor-ew-resize flex items-center justify-center"
        onPointerDown={beginResize("end")}
        onPointerMove={onResizeMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerCancel}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-1 h-4 bg-purple-400 rounded-full" />
      </div>
    </div>
  );
}

type DraftRange = { start: string; end: string };
type ResizeState = {
  side: "start" | "end";
  pointerId: number;
  startX: number;
  baseStart: Date;
  baseEnd: Date;
  lastStep: number;
};

function BookingBlock({
  booking,
  pxPerMin,
  viewDate,
  onClick,
  isSelected,
  onDriverDrop,
  draggable,
  onDragStart,
  flashUnassign,
  onMoveToVehicle,
  onResize,
  resizable = true,
  isOvernight = false,
  overnightFromPreviousDay = false,
  overnightToNextDay = false
}: {
  booking: BoardBooking;
  pxPerMin: number;
  viewDate: string;
  onClick: () => void;
  isSelected?: boolean;
  onDriverDrop: (bookingId: number, driverId: number) => void;
  draggable?: boolean;
  onDragStart?: (e: any) => void;
  flashUnassign?: boolean;
  onMoveToVehicle: (bookingId: number, fromVehicleId: number, destVehicleId: number, originalDriverId: number | null) => void;
  onResize: (bookingId: number, nextStart: string, nextEnd: string) => boolean;
  resizable?: boolean;
  isOvernight?: boolean;
  overnightFromPreviousDay?: boolean;
  overnightToNextDay?: boolean;
}) {
  const [allowDrag, setAllowDrag] = useState(true);
  const [draftRange, setDraftRange] = useState<DraftRange | null>(null);
  const draftRangeRef = useRef<DraftRange | null>(null);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const suppressClickRef = useRef(false);

  const applyDraftRange = (next: DraftRange | null) => {
    draftRangeRef.current = next;
    setDraftRange(next);
  };

  useEffect(() => {
    draftRangeRef.current = null;
    setDraftRange(null);
    setAllowDrag(true);
  }, [booking.start, booking.end]);

  useEffect(() => {
    if (!resizable) {
      resizeStateRef.current = null;
      applyDraftRange(null);
      setAllowDrag(true);
    }
  }, [resizable]);

  const displayStart = draftRange?.start ?? booking.start;
  const displayEnd = draftRange?.end ?? booking.end;
  const { left, width, clipL, clipR } = rangeForDay(displayStart, displayEnd, viewDate, pxPerMin);
  const showLeftFlag = Boolean((isOvernight && clipL) || overnightFromPreviousDay);
  const showRightFlag = Boolean((isOvernight && clipR) || overnightToNextDay);
  const overnightLabel = buildOvernightLabel(isOvernight, overnightFromPreviousDay, overnightToNextDay);
  if (width <= 0) return null;
  const color = booking.status === "ok" ? "bg-green-500/80" : booking.status === "warn" ? "bg-yellow-500/80" : "bg-red-500/80";
  const ring = booking.status === "ok" ? "ring-green-400" : booking.status === "warn" ? "ring-yellow-400" : "ring-red-400";
  const driver = booking.driverId ? driverMap.get(booking.driverId) : null;

  const driverFrameRef = useFlashOnChange<HTMLSpanElement>(
    booking.driverId != null ? `${booking.driverId}` : "",
    1500
  );

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
    if (suppressClickRef.current || resizeStateRef.current) {
      draggedRef.current = false;
      return;
    }
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

  const beginResize = (side: "start" | "end") => (e: any) => {
    if (!resizable) return;
    e.stopPropagation();
    e.preventDefault();
    setAllowDrag(false);
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
    resizeStateRef.current = {
      side,
      pointerId: e.pointerId,
      startX: e.clientX,
      baseStart: new Date(booking.start),
      baseEnd: new Date(booking.end),
      lastStep: 0
    };
    applyDraftRange({ start: booking.start, end: booking.end });
  };

  const onResizeMove = (e: any) => {
    if (!resizable) return;
    const state = resizeStateRef.current;
    if (!state || e.pointerId !== state.pointerId) return;
    e.stopPropagation();
    const deltaPx = e.clientX - state.startX;
    if (!pxPerMin) return;
    const deltaMinutes = deltaPx / pxPerMin;
    const step = Math.round(deltaMinutes / RESIZE_STEP_MINUTES) * RESIZE_STEP_MINUTES;
    if (step === state.lastStep) return;
    state.lastStep = step;
    let nextStart = new Date(state.baseStart);
    let nextEnd = new Date(state.baseEnd);
    if (state.side === "start") {
      nextStart = new Date(state.baseStart.getTime() + step * 60000);
      const maxStart = state.baseEnd.getTime() - MIN_BOOKING_DURATION_MINUTES * 60000;
      if (nextStart.getTime() > maxStart) {
        nextStart = new Date(maxStart);
      }
    } else {
      nextEnd = new Date(state.baseEnd.getTime() + step * 60000);
      const minEnd = state.baseStart.getTime() + MIN_BOOKING_DURATION_MINUTES * 60000;
      if (nextEnd.getTime() < minEnd) {
        nextEnd = new Date(minEnd);
      }
    }
    const draft: DraftRange = { start: toJstIso(nextStart), end: toJstIso(nextEnd) };
    const prev = draftRangeRef.current;
    if (prev && prev.start === draft.start && prev.end === draft.end) return;
    applyDraftRange(draft);
  };

  const finishResize = (e: any, applyChange: boolean) => {
    if (!resizable) return;
    const state = resizeStateRef.current;
    if (!state || e.pointerId !== state.pointerId) return;
    e.stopPropagation();
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(state.pointerId);
    } catch (err) {
      /* ignore */
    }
    resizeStateRef.current = null;
    setAllowDrag(true);
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 200);
    const finalRange = draftRangeRef.current;
    if (!applyChange || !finalRange) {
      applyDraftRange(null);
      return;
    }
    const changed = finalRange.start !== booking.start || finalRange.end !== booking.end;
    if (!changed) {
      applyDraftRange(null);
      return;
    }
    const ok = onResize(booking.id, finalRange.start, finalRange.end);
    if (!ok) {
      applyDraftRange(null);
    }
  };

  const onResizePointerUp = (e: any) => finishResize(e, true);
  const onResizePointerCancel = (e: any) => finishResize(e, false);

  return (
    <div
      className={`absolute top-2 h-12 ${color} text-white text-[11px] rounded-lg px-2 py-1 shadow ring-2 ${ring} ${resizable ? "cursor-pointer" : "cursor-default"} ${isSelected ? "outline outline-2 outline-blue-500" : ""} ${over ? "ring-4 ring-blue-300" : ""}`}
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
      draggable={draggable && allowDrag}
      onDragStart={onDragStart}
    >
      {showLeftFlag && <EdgeFlag pos="left" />}
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold truncate">{booking.title}</div>
        {driver ? (
          <span
            ref={driverFrameRef}
            className="text-[10px] px-2 py-0.5 rounded bg-white/90 text-slate-800 border border-white"
          >
            {driver.name}（{driver.code}）
          </span>
        ) : (
          <span
            className={`text-[10px] px-2 py-0.5 rounded bg-white/90 text-amber-700 border ${
              flashUnassign ? "badge-flash border-amber-500" : "border-transparent"
            }`}
          >
            ドライバー未割当
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 opacity-95">
        <div className="truncate">
          {fmt(displayStart)} - {fmt(displayEnd)}
          {overnightLabel}
        </div>
        <div className="truncate">{booking.client?.name}</div>
      </div>
      {showRightFlag && <EdgeFlag pos="right" />}
      {resizable && (
        <>
          <div
            className="absolute inset-y-1 left-0 w-2 cursor-ew-resize flex items-center justify-center z-10"
            onPointerDown={beginResize("start")}
            onPointerMove={onResizeMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerCancel}
            onContextMenu={(e) => e.preventDefault()}
            role="presentation"
            title="開始時間を調整"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-6 w-1 rounded bg-white/80 border border-white/60 shadow" />
          </div>
          <div
            className="absolute inset-y-1 right-0 w-2 cursor-ew-resize flex items-center justify-center z-10"
            onPointerDown={beginResize("end")}
            onPointerMove={onResizeMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerCancel}
            onContextMenu={(e) => e.preventDefault()}
            role="presentation"
            title="終了時間を調整"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-6 w-1 rounded bg-white/80 border border-white/60 shadow" />
          </div>
        </>
      )}
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

function JobFormModal({
  draft,
  onClose,
  onChange,
  onSubmit,
  viewDateLabel
}: {
  draft: JobDraft;
  onClose: () => void;
  onChange: (field: keyof JobDraft, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  viewDateLabel: string;
}) {
  const vehicleClassOptions = Object.entries(VEHICLE_CLASS_LABELS);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">新規ジョブを登録</h3>
            <p className="text-xs text-slate-500">対象日：{viewDateLabel}</p>
          </div>
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-700"
            onClick={onClose}
          >
            閉じる
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="job-title">
              ジョブ名
            </label>
            <input
              id="job-title"
              type="text"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              value={draft.title}
              onChange={(e) => onChange("title", e.target.value)}
              placeholder="例）羽田→帝国ホテル送迎"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="job-client-type">
                顧客区分
              </label>
              <select
                id="job-client-type"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={draft.clientType}
                onChange={(e) => onChange("clientType", e.target.value)}
              >
                <option value="個人">個人</option>
                <option value="法人">法人</option>
                <option value="ホテル">ホテル</option>
                <option value="旅行代理店">旅行代理店</option>
                <option value="アプリ">アプリ</option>
                <option value="その他">その他</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="job-client-name">
                顧客名
              </label>
              <input
                id="job-client-name"
                type="text"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={draft.clientName}
                onChange={(e) => onChange("clientName", e.target.value)}
                placeholder="例）帝国ホテル"
                required
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="job-start-time">
                開始時刻
              </label>
              <input
                id="job-start-time"
                type="time"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={draft.startTime}
                onChange={(e) => onChange("startTime", e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="job-end-time">
                終了時刻
              </label>
              <input
                id="job-end-time"
                type="time"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={draft.endTime}
                onChange={(e) => onChange("endTime", e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="job-prefer-class">
              希望車種クラス
            </label>
            <select
              id="job-prefer-class"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              value={draft.preferClass}
              onChange={(e) => onChange("preferClass", e.target.value)}
            >
              {vehicleClassOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              onClick={onClose}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="rounded-full bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-amber-400"
            >
              追加する
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Drawer({ isMobile, onClose, children }: { isMobile: boolean; onClose: () => void; children: any }) {
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      {isMobile ? (
        <div className="absolute left-0 right-0 bottom-0 h-[70%] bg-white rounded-t-2xl shadow-2xl p-4 animate-in slide-in-from-bottom">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">詳細ボード</h3>
            <button className="text-sm px-2 py-1 border rounded" onClick={onClose}>
              閉じる
            </button>
          </div>
          <div className="h-[calc(100%-2rem)] overflow-auto">{children}</div>
        </div>
      ) : (
        <div className="absolute right-0 top-0 h-full w-[380px] bg-white rounded-l-2xl shadow-2xl p-4 animate-in slide-in-from-right">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">詳細ボード</h3>
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

function DetailsPane({
  item,
  onReturn,
  onUpdateNote,
  onAddAttachment,
  onRemoveAttachment
}: {
  item: any;
  onReturn?: (id: number) => void;
  onUpdateNote?: (id: number, note: string) => void;
  onAddAttachment?: (id: number, files: FileList) => void;
  onRemoveAttachment?: (bookingId: number, attachmentId: string) => void;
}) {
  const [noteDraft, setNoteDraft] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const notePreview = useMemo<ReactNode>(() => renderNoteWithLinks(noteDraft), [noteDraft]);

  useEffect(() => {
    if (!item || item.type !== "booking") {
      setNoteDraft("");
      setSaveState("idle");
      return;
    }
    const nextNote = item.data?.note ?? "";
    setNoteDraft(nextNote);
    setSaveState("idle");
  }, [item]);

  useEffect(() => {
    if (!item || item.type !== "booking" || !onUpdateNote) return;
    const bookingId = item.data?.id;
    if (typeof bookingId !== "number") return;

    const currentNote = item.data?.note ?? "";
    if (noteDraft === currentNote) return;

    setSaveState("saving");
    const timer = window.setTimeout(() => {
      onUpdateNote(bookingId, noteDraft);
      setSaveState("saved");
    }, 400);

    return () => window.clearTimeout(timer);
  }, [noteDraft, item, onUpdateNote]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = window.setTimeout(() => setSaveState("idle"), 1500);
    return () => window.clearTimeout(timer);
  }, [saveState]);

  if (!item) return <div className="text-slate-500 text-sm">項目が選択されていません</div>;
  const type = item.type;
  const v = item.vehicle as any;
  const data = item.data as any;
  const driver = data.driverId ? driverMap.get(data.driverId) : null;
  const isBooking = type === "booking";
  const displayTitle = isBooking ? data.title : `${data.service ?? "アプリ配車"}`;
  const clientType = isBooking ? data.client?.type ?? "" : "アプリ";
  const clientName = isBooking ? data.client?.name ?? "" : data.service ?? "配車依頼";
  const clientLabel = [clientType, clientName].filter(Boolean).join("/") || "未設定";
  const crossesMidnight = new Date(data.end) <= new Date(data.start);
  const attachments: BookingAttachment[] = isBooking
    ? ((data.attachments as BookingAttachment[] | undefined) ?? [])
    : [];

  const handleAttachmentInput = (files: FileList | null) => {
    if (!isBooking || !files || files.length === 0 || !onAddAttachment) return;
    onAddAttachment(data.id, files);
  };

  const handleAttachmentRemove = (attachmentId: string) => {
    if (!isBooking) return;
    onRemoveAttachment?.(data.id, attachmentId);
  };

  return (
    <div className="space-y-3 text-sm">
      <section>
        <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">概要</h4>
        <div className="font-medium">{displayTitle}</div>
        <div className="text-slate-600">
          {fmt(data.start)} - {fmt(data.end)}
          {crossesMidnight ? "（→翌）" : ""}
        </div>
        <div className="text-slate-600">依頼元：{clientLabel}</div>
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
        {isBooking ? (
          <div className="space-y-3">
            <textarea
              className="w-full border border-slate-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              rows={4}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="ここに社内共有メモを記入"
            />
            <p className="text-xs text-slate-500">
              {saveState === "saving"
                ? "保存中..."
                : saveState === "saved"
                  ? "保存しました"
                  : "変更は自動保存されます"}
            </p>
            <div className="rounded border border-slate-200 bg-slate-50 p-2">
              <p className="text-xs text-slate-500 mb-1">プレビュー</p>
              <div className="text-sm text-slate-700 leading-relaxed break-words">{notePreview}</div>
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">ファイル添付</label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-full file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-blue-700 hover:file:bg-blue-100"
                  onChange={(e) => {
                    handleAttachmentInput(e.target.files);
                    e.target.value = "";
                  }}
                />
                <p className="text-[11px] text-slate-500 mt-1">画像やPDFなどの資料をアップロードできます。</p>
              </div>
              {attachments.length > 0 ? (
                <ul className="space-y-2">
                  {attachments.map((attachment) => {
                    const isImage = attachment.type?.startsWith("image/") ?? false;
                    const addedLabel = formatAttachmentTimestamp(attachment.addedAt);
                    return (
                      <li
                        key={attachment.id}
                        className="flex items-start justify-between gap-3 rounded border border-slate-200 bg-white p-2"
                      >
                        <div className="flex items-start gap-3">
                          {isImage ? (
                            <img
                              src={attachment.url}
                              alt={attachment.name}
                              className="h-14 w-14 rounded border border-slate-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded border border-slate-200 bg-slate-50 text-[11px] font-medium uppercase text-slate-600">
                              {attachment.type?.toLowerCase().includes("pdf") ? "PDF" : "FILE"}
                            </div>
                          )}
                          <div className="space-y-1 text-xs text-slate-600">
                            <a
                              href={attachment.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-slate-700 underline break-all"
                            >
                              {attachment.name}
                            </a>
                            <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-500">
                              <span>{formatFileSize(attachment.size)}</span>
                              {attachment.type && <span>{attachment.type}</span>}
                              {addedLabel && <span>{addedLabel}</span>}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="text-xs text-red-500 hover:text-red-600"
                          onClick={() => handleAttachmentRemove(attachment.id)}
                        >
                          削除
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">添付ファイルはまだありません。</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              className="w-full cursor-not-allowed rounded border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-500"
              rows={4}
              value="アプリ配車のメモは管制システム側で管理します。必要に応じてジョブに変換して共有してください。"
              readOnly
            />
            <p className="text-xs text-slate-500">※ レイアウトは通常配車と同じ構成で表示しています（参照のみ）。</p>
          </div>
        )}
      </section>
    </div>
  );
}

function makeAttachmentFromFile(file: File): BookingAttachment {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `att-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const url = URL.createObjectURL(file);
  return {
    id,
    name: file.name,
    type: file.type || "application/octet-stream",
    url,
    size: file.size,
    addedAt: new Date().toISOString()
  };
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  const formatted = value >= 10 || exponent === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${formatted} ${units[exponent]}`;
}

function formatAttachmentTimestamp(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderNoteWithLinks(text: string): ReactNode {
  if (!text.trim()) {
    return <span className="text-slate-400">メモはまだありません</span>;
  }
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = urlRegex.exec(text)) !== null) {
    const preceding = text.slice(lastIndex, match.index);
    if (preceding) {
      nodes.push(...renderPlainTextWithBreaks(preceding, `${match.index}-text`));
    }
    const url = match[0];
    nodes.push(
      <a
        key={`${match.index}-link`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline break-all"
      >
        {url}
      </a>
    );
    lastIndex = match.index + url.length;
  }
  const remaining = text.slice(lastIndex);
  if (remaining) {
    nodes.push(...renderPlainTextWithBreaks(remaining, `tail-${lastIndex}`));
  }
  return nodes;
}

function renderPlainTextWithBreaks(segment: string, keyPrefix: string): ReactNode[] {
  const parts = segment.split(/\r?\n/);
  const nodes: ReactNode[] = [];
  parts.forEach((part, index) => {
    if (part) {
      nodes.push(
        <span key={`${keyPrefix}-${index}`} className="break-words">
          {part}
        </span>
      );
    }
    if (index < parts.length - 1) {
      nodes.push(<br key={`${keyPrefix}-${index}-br`} />);
    }
  });
  return nodes;
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
function formatMinutesLabel(minutes: number) {
  if (minutes <= 0) return "0分";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}分`;
  if (mins === 0) return `${hours}時間`;
  return `${hours}時間${mins}分`;
}
function formatCurrency(amount: number) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}
function formatTimeInJst(ms: number) {
  const d = new Date(ms);
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" });
}
function summarizeFreeSlots(slots: Interval[], limit = 2) {
  if (slots.length === 0) return "空き枠なし";
  const parts = slots.slice(0, limit).map((slot) => `${formatTimeInJst(slot.start)}〜${formatTimeInJst(slot.end)}`);
  if (slots.length > limit) {
    parts.push("…");
  }
  return parts.join("、");
}
function fmt(s: string) {
  const d = new Date(s);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
