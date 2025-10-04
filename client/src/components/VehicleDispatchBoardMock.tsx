import { Fragment, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, ReactNode } from "react";

type Driver = {
  id: number;
  name: string;
  code: string;
  extUsed: number;
};

type Vehicle = {
  id: number;
  name: string;
};

type BookingStatus = "hard" | "warn" | "soft";

type Booking = {
  id: number;
  vehicleId: number;
  driverId: number | null;
  client: { name: string };
  title: string;
  start: string;
  end: string;
  status: BookingStatus;
  note?: string;
};

type AppDuty = {
  id: string;
  vehicleId: number;
  driverId: number | null;
  start: string;
  end: string;
  title: string;
};

type Job = {
  id: string;
  client: { name: string };
  title: string;
  start: string;
  end: string;
  preferClass: string;
};

const DEFAULT_PX_PER_MIN = 1.8;
const DRIVER_POOL_WIDTH_MIN = 260;
const DRIVER_POOL_WIDTH_MAX = 420;

const VIEW_DATE = "2024-08-12";

const DRIVERS: Driver[] = [
  { id: 1, name: "山田 太郎", code: "DRV-01", extUsed: 2 },
  { id: 2, name: "佐藤 花子", code: "DRV-02", extUsed: 1 },
  { id: 3, name: "John Smith", code: "DRV-03", extUsed: 0 },
  { id: 4, name: "斎藤 潤", code: "DRV-04", extUsed: 3 }
];

const VEHICLES: Vehicle[] = [
  { id: 1, name: "1号車 (ハイエース)" },
  { id: 2, name: "2号車 (アルファード)" },
  { id: 3, name: "3号車 (コースター)" },
  { id: 4, name: "4号車 (ハイエース)" }
];

const INITIAL_BOOKINGS: Booking[] = [
  {
    id: 101,
    vehicleId: 1,
    driverId: 1,
    client: { name: "ABC 株式会社" },
    title: "羽田空港 → 都内ホテル",
    start: `${VIEW_DATE}T08:30:00+09:00`,
    end: `${VIEW_DATE}T10:00:00+09:00`,
    status: "hard",
    note: "VIP 対応"
  },
  {
    id: 102,
    vehicleId: 2,
    driverId: 2,
    client: { name: "DEF 旅行" },
    title: "都内観光チャーター",
    start: `${VIEW_DATE}T09:00:00+09:00`,
    end: `${VIEW_DATE}T12:00:00+09:00`,
    status: "warn"
  },
  {
    id: 103,
    vehicleId: 3,
    driverId: null,
    client: { name: "GHI Trading" },
    title: "荷物配送",
    start: `${VIEW_DATE}T13:00:00+09:00`,
    end: `${VIEW_DATE}T15:30:00+09:00`,
    status: "soft"
  }
];

const INITIAL_APP_DUTIES: AppDuty[] = [
  {
    id: "duty-1",
    vehicleId: 2,
    driverId: 3,
    title: "アプリ稼働",
    start: `${VIEW_DATE}T06:00:00+09:00`,
    end: `${VIEW_DATE}T08:00:00+09:00`
  },
  {
    id: "duty-2",
    vehicleId: 3,
    driverId: null,
    title: "メンテナンス",
    start: `${VIEW_DATE}T10:30:00+09:00`,
    end: `${VIEW_DATE}T12:00:00+09:00`
  }
];

const INITIAL_JOB_POOL: Job[] = [
  {
    id: "job-9001",
    client: { name: "テスト株式会社" },
    title: "成田空港 → 品川",
    start: `${VIEW_DATE}T11:00:00+09:00`,
    end: `${VIEW_DATE}T12:20:00+09:00`,
    preferClass: "ワゴン"
  },
  {
    id: "job-9002",
    client: { name: "Happy Tours" },
    title: "日光観光",
    start: `${VIEW_DATE}T07:00:00+09:00`,
    end: `${VIEW_DATE}T18:00:00+09:00`,
    preferClass: "マイクロ"
  }
];

const MIN_BUFFER_MINUTES = 20;

function toDate(value: string) {
  return new Date(value);
}

function minutesBetween(a: string, b: string) {
  return (toDate(b).getTime() - toDate(a).getTime()) / 60000;
}

function overlap(startA: string, endA: string, startB: string, endB: string) {
  return toDate(startA) < toDate(endB) && toDate(startB) < toDate(endA);
}

function toMinutes(date: string) {
  const base = new Date(`${VIEW_DATE}T00:00:00+09:00`);
  return (toDate(date).getTime() - base.getTime()) / 60000;
}

function fmt(date: string) {
  const d = new Date(date);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function bookingToJob(booking: Booking): Job {
  return {
    id: `job-from-${booking.id}`,
    client: booking.client,
    title: booking.title,
    start: booking.start,
    end: booking.end,
    preferClass: "指定なし"
  };
}

function applyBookingMove(booking: Booking, destVehicleId: number, fromVehicleId: number, originalDriverId: number | null): Booking {
  const crossed = destVehicleId !== fromVehicleId;
  return {
    ...booking,
    vehicleId: destVehicleId,
    driverId: crossed ? null : booking.driverId,
    note: crossed && originalDriverId != null ? "車両変更によりドライバー割当解除" : booking.note
  };
}

function isSameVehicleOverlap(bookings: Booking[], candidate: Booking) {
  return bookings.some((b) => b.id !== candidate.id && b.vehicleId === candidate.vehicleId && overlap(b.start, b.end, candidate.start, candidate.end));
}

function violatesAppDuty(booking: Booking, duties: AppDuty[]) {
  return duties.some((duty) => duty.vehicleId === booking.vehicleId && overlap(duty.start, duty.end, booking.start, booking.end));
}

function bufferWarn(bookings: Booking[], candidate: Booking) {
  return bookings.some((b) => {
    if (b.id === candidate.id || b.vehicleId !== candidate.vehicleId) return false;
    const beforeGap = minutesBetween(b.end, candidate.start);
    const afterGap = minutesBetween(candidate.end, b.start);
    return (beforeGap > 0 && beforeGap < MIN_BUFFER_MINUTES) || (afterGap > 0 && afterGap < MIN_BUFFER_MINUTES);
  });
}

function dutyConflictsWithBookings(bookings: Booking[], duty: AppDuty) {
  return bookings.some((b) => b.vehicleId === duty.vehicleId && overlap(b.start, b.end, duty.start, duty.end));
}

function hasDriverTimeConflict(bookings: Booking[], candidate: Booking) {
  if (candidate.driverId == null) return false;
  return bookings.some((b) => b.id !== candidate.id && b.driverId === candidate.driverId && overlap(b.start, b.end, candidate.start, candidate.end));
}

function GridOverlay({ hourPx }: { hourPx: number }) {
  const hours = Array.from({ length: 25 }, (_, i) => i);
  return (
    <div className="absolute inset-0 pointer-events-none">
      {hours.map((h) => (
        <Fragment key={h}>
          <div className="absolute top-0 bottom-0 border-l border-slate-200" style={{ left: h * hourPx }} />
          <div className="absolute -top-5 text-[10px] text-slate-500" style={{ left: h * hourPx + 4 }}>
            {h.toString().padStart(2, "0")}:00
          </div>
        </Fragment>
      ))}
    </div>
  );
}

type BookingBlockProps = {
  booking: Booking;
  pxPerMin: number;
  onClick: () => void;
  isSelected: boolean;
  onDriverDrop: (bookingId: number, driverId: number) => void;
  onMoveToVehicle: (bookingId: number, fromVehicleId: number, destVehicleId: number, originalDriverId: number | null) => void;
  draggable: boolean;
  onDragStart: (e: ReactDragEvent<HTMLDivElement>) => void;
  flashUnassign: boolean;
};

function BookingBlock({
  booking,
  pxPerMin,
  onClick,
  isSelected,
  onDriverDrop,
  onMoveToVehicle,
  draggable,
  onDragStart,
  flashUnassign
}: BookingBlockProps) {
  const startMin = toMinutes(booking.start);
  const endMin = toMinutes(booking.end);
  const width = (endMin - startMin) * pxPerMin;
  const left = startMin * pxPerMin;
  const color = booking.status === "hard" ? "bg-emerald-500" : booking.status === "warn" ? "bg-amber-400" : "bg-slate-300";

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={`absolute top-8 text-xs rounded-xl text-white shadow transition-all cursor-pointer ${color} ${isSelected ? "ring-4 ring-blue-200" : "ring-1 ring-slate-900/10"} ${
        flashUnassign ? "blink3" : ""
      }`}
      style={{ left, width, minWidth: 48 }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/x-driver-id")) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        const driverRaw = e.dataTransfer.getData("text/x-driver-id");
        if (driverRaw) {
          const driverId = Number(driverRaw);
          if (!Number.isNaN(driverId)) {
            onDriverDrop(booking.id, driverId);
          }
        }
        const bookingRaw = e.dataTransfer.getData("text/x-booking-move");
        if (bookingRaw) {
          const fromRaw = e.dataTransfer.getData("text/x-from-vehicle-id");
          const originalDriverRaw = e.dataTransfer.getData("text/x-original-driver-id");
          onMoveToVehicle(booking.id, Number(fromRaw), booking.vehicleId, originalDriverRaw ? Number(originalDriverRaw) : null);
        }
      }}
    >
      <div className="flex items-center justify-between px-3 py-1.5">
        <div>
          <div className="font-semibold text-sm truncate max-w-[180px]">{booking.title}</div>
          <div className="text-[11px] text-white/80">
            {fmt(booking.start)} - {fmt(booking.end)} / {booking.client.name}
          </div>
        </div>
        <div className="text-right text-[11px] text-white/80">
          {booking.driverId ? `Driver #${booking.driverId}` : "Driver 未割当"}
        </div>
      </div>
    </div>
  );
}

type AppDutyBlockProps = {
  duty: AppDuty;
  pxPerMin: number;
  onClick: () => void;
  isSelected: boolean;
  onMoveDutyToVehicle: (dutyId: string, fromVehicleId: number, destVehicleId: number) => void;
};

function AppDutyBlock({ duty, pxPerMin, onClick, isSelected, onMoveDutyToVehicle }: AppDutyBlockProps) {
  const startMin = toMinutes(duty.start);
  const endMin = toMinutes(duty.end);
  const width = (endMin - startMin) * pxPerMin;
  const left = startMin * pxPerMin;

  return (
    <div
      className={`absolute top-2 bg-sky-100 border border-sky-200 text-sky-700 text-[11px] rounded px-2 py-1 shadow-sm ${isSelected ? "ring-2 ring-sky-300" : ""}`}
      style={{ left, width, minWidth: 36 }}
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/x-duty-move", duty.id);
        e.dataTransfer.setData("text/x-from-vehicle-id", String(duty.vehicleId));
        e.dataTransfer.setData("text/plain", duty.id);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/x-duty-move")) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const movedDuty = e.dataTransfer.getData("text/x-duty-move");
        const fromVehicle = Number(e.dataTransfer.getData("text/x-from-vehicle-id"));
        if (movedDuty && fromVehicle) {
          onMoveDutyToVehicle(movedDuty, fromVehicle, duty.vehicleId);
        }
      }}
    >
      {duty.title}
    </div>
  );
}

type DrawerProps = {
  children: ReactNode;
  onClose: () => void;
  isMobile: boolean;
};

function Drawer({ children, onClose, isMobile }: DrawerProps) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className={`bg-white shadow-xl ${isMobile ? "w-full" : "w-[360px]"} h-full overflow-y-auto p-4`}>{children}</div>
    </div>
  );
}

type DetailsPaneProps = {
  item: { type: "booking" | "duty"; data: Booking | AppDuty; vehicle?: Vehicle | null } | null;
  onReturn: (id: number) => void;
};

function DetailsPane({ item, onReturn }: DetailsPaneProps) {
  if (!item) return null;
  if (item.type === "booking") {
    const booking = item.data as Booking;
    return (
      <div className="space-y-3">
        <div>
          <div className="text-sm text-slate-500">予約詳細</div>
          <h3 className="text-lg font-semibold">{booking.title}</h3>
        </div>
        <div className="space-y-1 text-sm text-slate-700">
          <div>
            <span className="font-medium">時間:</span> {fmt(booking.start)} - {fmt(booking.end)}
          </div>
          <div>
            <span className="font-medium">顧客:</span> {booking.client.name}
          </div>
          <div>
            <span className="font-medium">ドライバー:</span> {booking.driverId ? `Driver #${booking.driverId}` : "未割当"}
          </div>
          <div>
            <span className="font-medium">車両:</span> {item.vehicle?.name ?? "不明"}
          </div>
          {booking.note && (
            <div>
              <span className="font-medium">メモ:</span> {booking.note}
            </div>
          )}
        </div>
        <button className="px-3 py-1.5 text-sm rounded bg-rose-100 text-rose-600" onClick={() => onReturn(booking.id)}>
          ジョブプールへ戻す
        </button>
      </div>
    );
  }

  const duty = item.data as AppDuty;
  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm text-slate-500">アプリ稼働詳細</div>
        <h3 className="text-lg font-semibold">{duty.title}</h3>
      </div>
      <div className="space-y-1 text-sm text-slate-700">
        <div>
          <span className="font-medium">時間:</span> {fmt(duty.start)} - {fmt(duty.end)}
        </div>
        <div>
          <span className="font-medium">車両:</span> {item.vehicle?.name ?? "不明"}
        </div>
      </div>
    </div>
  );
}

type ResizeHandleProps = {
  value: number;
  setValue: (value: number) => void;
  min: number;
  max: number;
  side: "left" | "right";
};

function ResizeHandle({ value, setValue, min, max, side }: ResizeHandleProps) {
  const dragging = useRef(false);

  return (
    <div
      className={`absolute top-0 ${side === "right" ? "-right-1" : "-left-1"} w-2 h-full cursor-col-resize`}
      onMouseDown={(e) => {
        e.preventDefault();
        dragging.current = true;
        const startX = e.clientX;
        const startValue = value;

        const handleMove = (moveEvent: MouseEvent) => {
          if (!dragging.current) return;
          const delta = moveEvent.clientX - startX;
          const newValue = Math.min(max, Math.max(min, startValue + (side === "right" ? delta : -delta)));
          setValue(newValue);
        };

        const handleUp = () => {
          dragging.current = false;
          window.removeEventListener("mousemove", handleMove);
          window.removeEventListener("mouseup", handleUp);
        };

        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
      }}
    />
  );
}

export default function VehicleDispatchBoardMock() {
  const [pxPerMin, setPxPerMin] = useState(DEFAULT_PX_PER_MIN);
  const [fullView, setFullView] = useState(false);
  const [driverWidth, setDriverWidth] = useState(320);
  const [bookings, setBookings] = useState(INITIAL_BOOKINGS);
  const [appDuties, setAppDuties] = useState(INITIAL_APP_DUTIES);
  const [jobPool, setJobPool] = useState(INITIAL_JOB_POOL);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerItem, setDrawerItem] = useState<DetailsPaneProps["item"]>(null);
  const [selected, setSelected] = useState<{ type: "booking" | "duty"; id: string | number } | null>(null);
  const [flashUnassignId, setFlashUnassignId] = useState<number | null>(null);
  const bookingIdRef = useRef<number>(2000);
  const centerRef = useRef<HTMLDivElement | null>(null);

  const pxWidth24h = 60 * 24 * pxPerMin;
  const containerWidth = centerRef.current?.clientWidth ?? pxWidth24h;
  const CONTENT_WIDTH = fullView ? containerWidth : Math.max(pxWidth24h, containerWidth);
  const canZoom = !fullView;

  const zoom = (delta: number) => {
    if (!canZoom) return;
    setPxPerMin((prev) => Math.min(6, Math.max(0.5, prev + delta)));
  };

  const openDrawer = (item: DetailsPaneProps["item"]) => {
    setDrawerItem(item);
    if (item) setSelected({ type: item.type, id: (item.data as any).id });
    setDrawerOpen(true);
  };

  const closeDrawer = () => setDrawerOpen(false);
  const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;

  function laneHighlight(el: HTMLElement, on: boolean) {
    el.classList.toggle("ring-2", on);
    el.classList.toggle("ring-blue-300", on);
  }

  function handleLaneDragOver(e: ReactDragEvent<HTMLDivElement>) {
    const types = Array.from(e.dataTransfer?.types || []);
    if (types.includes("text/x-job-id") || types.includes("text/x-booking-move") || types.includes("text/x-duty-move")) {
      e.preventDefault();
      laneHighlight(e.currentTarget as HTMLElement, true);
    }
  }

  function handleLaneDragLeave(e: ReactDragEvent<HTMLDivElement>) {
    laneHighlight(e.currentTarget as HTMLElement, false);
  }

  const appDutiesByVehicle = useMemo(() => {
    return new Map<number, AppDuty[]>(
      VEHICLES.map((vehicle) => [vehicle.id, appDuties.filter((duty) => duty.vehicleId === vehicle.id)])
    );
  }, [appDuties]);

  const bookingsByVehicle = useMemo(() => {
    return new Map<number, Booking[]>(
      VEHICLES.map((vehicle) => [vehicle.id, bookings.filter((booking) => booking.vehicleId === vehicle.id)])
    );
  }, [bookings]);

  const moveBookingByPointer = (bookingId: number, fromVehicleId: number, destVehicleId: number, originalDriverId: number | null) => {
    const crossed = destVehicleId !== fromVehicleId;
    let moved = false;
    setBookings((prev) => {
      const current = prev.find((item) => item.id === bookingId);
      if (!current) return prev;
      const candidate = applyBookingMove(current, destVehicleId, fromVehicleId, originalDriverId);
      const others = prev.filter((item) => item.id !== bookingId);
      if (isSameVehicleOverlap(others, candidate)) {
        alert("時間重複のため配置できません");
        return prev;
      }
      if (violatesAppDuty(candidate, appDuties)) {
        alert("アプリ稼働と重複のため配置できません");
        return prev;
      }
      const warn = bufferWarn(prev, candidate);
      const finalized = warn ? { ...candidate, status: candidate.status === "hard" ? "hard" : "warn" } : candidate;
      moved = true;
      return prev.map((item) => (item.id === bookingId ? finalized : item));
    });
    if (moved && crossed && originalDriverId != null) {
      setFlashUnassignId(bookingId);
      window.setTimeout(() => setFlashUnassignId(null), 1500);
    }
  };

  const moveDutyByPointer = (dutyId: string, fromVehicleId: number, destVehicleId: number) => {
    setAppDuties((prev) => {
      const current = prev.find((item) => item.id === dutyId);
      if (!current) return prev;
      const candidate: AppDuty = { ...current, vehicleId: destVehicleId };
      const others = prev.filter((item) => item.id !== dutyId);
      if (others.some((duty) => duty.vehicleId === candidate.vehicleId && overlap(duty.start, duty.end, candidate.start, candidate.end))) {
        alert("他のアプリ稼働と重複のため移動できません");
        return prev;
      }
      if (dutyConflictsWithBookings(bookings, candidate)) {
        alert("予約と重複のため移動できません");
        return prev;
      }
      return prev.map((item) => (item.id === dutyId ? candidate : item));
    });
  };

  function handleLaneDrop(vehicleId: number, e: ReactDragEvent<HTMLDivElement>) {
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
    const newBooking: Booking = {
      id: ++bookingIdRef.current,
      vehicleId,
      driverId: null,
      client: job.client,
      title: job.title,
      start: job.start,
      end: job.end,
      status: "warn",
      note: "ドライバー未割当（ジョブから配置：カード時刻にスナップ）"
    };
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

  function handleJobPoolDragOver(e: ReactDragEvent<HTMLDivElement>) {
    const types = Array.from(e.dataTransfer?.types || []);
    if (types.includes("text/x-booking-id")) {
      e.preventDefault();
      jobPoolHighlight(true);
    }
  }

  function handleJobPoolDragLeave() {
    jobPoolHighlight(false);
  }

  function handleJobPoolDrop(e: ReactDragEvent<HTMLDivElement>) {
    jobPoolHighlight(false);
    const raw = e.dataTransfer.getData("text/x-booking-id");
    if (!raw) return;
    e.preventDefault();
    const bookingId = Number(raw);
    const booking = bookings.find((x) => x.id === bookingId);
    if (!booking) return;
    const newJob = bookingToJob(booking);
    setJobPool((prev) => [newJob, ...prev]);
    setBookings((prev) => prev.filter((x) => x.id !== bookingId));
    setDrawerOpen(false);
  }

  function returnBookingToJobPool(bookingId: number) {
    const booking = bookings.find((x) => x.id === bookingId);
    if (!booking) return;
    const newJob = bookingToJob(booking);
    setJobPool((prev) => [newJob, ...prev]);
    setBookings((prev) => prev.filter((x) => x.id !== bookingId));
    setDrawerOpen(false);
  }

  const dateStr = VIEW_DATE;
  const CONTENT_STYLE = { width: CONTENT_WIDTH };

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
                  if (!fullView) {
                    const width = centerRef.current?.clientWidth ?? pxWidth24h;
                    const nextPxPerMin = width / (24 * 60);
                    setPxPerMin(Math.min(6, Math.max(0.5, nextPxPerMin)));
                    setFullView(true);
                  }
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
              {DRIVERS.map((driver) => (
                <li
                  key={driver.id}
                  className="border rounded-xl p-3 hover:bg-slate-50 cursor-grab active:cursor-grabbing"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copyMove";
                    e.dataTransfer.setData("text/x-driver-id", String(driver.id));
                    e.dataTransfer.setData("text/plain", String(driver.id));
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">
                        {driver.name} <span className="text-slate-400 text-xs">({driver.code})</span>
                      </div>
                      <div className="text-xs text-slate-500">延長使用: {driver.extUsed}/7</div>
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

          <div
            ref={centerRef}
            className={`flex-1 bg-white rounded-2xl shadow p-3 relative overflow-y-auto ${fullView ? "overflow-x-hidden" : "overflow-x-auto"}`}
          >
            <div className="flex items-center justify-between mb-2 sticky left-0 top-0 z-10 bg-white pr-2">
              <h2 className="font-medium">モータープール</h2>
              <span className="text-xs text-slate-500">00:00〜24:00（{pxPerMin.toFixed(2)} px/min）</span>
            </div>

            <div className="relative" style={CONTENT_STYLE}>
              <GridOverlay hourPx={60 * pxPerMin} />

              <div className="space-y-3 pt-6">
                {VEHICLES.map((vehicle) => (
                  <div
                    key={vehicle.id}
                    data-vehicle-id={vehicle.id}
                    className="relative h-16 border rounded-xl bg-white overflow-hidden"
                    onDragOver={handleLaneDragOver}
                    onDragLeave={handleLaneDragLeave}
                    onDrop={(e) => handleLaneDrop(vehicle.id, e)}
                  >
                    {(appDutiesByVehicle.get(vehicle.id) || []).map((duty) => (
                      <AppDutyBlock
                        key={duty.id}
                        duty={duty}
                        pxPerMin={pxPerMin}
                        onClick={() => openDrawer({ type: "duty", data: duty, vehicle })}
                        isSelected={selected?.type === "duty" && selected?.id === duty.id}
                        onMoveDutyToVehicle={(dutyId, fromVehicleId, destVehicleId) => moveDutyByPointer(dutyId, fromVehicleId, destVehicleId)}
                      />
                    ))}
                    {(bookingsByVehicle.get(vehicle.id) || []).map((booking) => (
                      <BookingBlock
                        key={booking.id}
                        booking={booking}
                        pxPerMin={pxPerMin}
                        onClick={() => openDrawer({ type: "booking", data: booking, vehicle })}
                        isSelected={selected?.type === "booking" && selected?.id === booking.id}
                        onDriverDrop={(bookingId, driverId) => {
                          const current = bookings.find((x) => x.id === bookingId);
                          if (!current) return;
                          const candidate = { ...current, driverId } as Booking;
                          if (hasDriverTimeConflict(bookings, candidate)) {
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
                          e.dataTransfer.setData("text/x-booking-id", String(booking.id));
                          e.dataTransfer.setData("text/x-booking-move", String(booking.id));
                          e.dataTransfer.setData("text/x-from-vehicle-id", String(booking.vehicleId));
                          e.dataTransfer.setData("text/x-original-driver-id", booking.driverId != null ? String(booking.driverId) : "");
                          e.dataTransfer.setData("text/plain", String(booking.id));
                        }}
                        flashUnassign={flashUnassignId === booking.id}
                      />
                    ))}

                    <div className="absolute left-2 top-1 text-[11px] text-slate-500 bg-white/80 rounded px-1">{vehicle.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div
          ref={jobPoolRef}
          className="mt-3 bg-white rounded-2xl shadow p-3"
          onDragOver={handleJobPoolDragOver}
          onDragLeave={handleJobPoolDragLeave}
          onDrop={handleJobPoolDrop}
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium">ジョブプール（未割当）</h2>
            <span className="text-xs text-slate-500">{jobPool.length} 件</span>
          </div>
          {jobPool.length === 0 ? (
            <div className="text-slate-500 text-sm">未割当の仕事はありません。Excel風入力画面で登録するとここに表示されます。</div>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {jobPool.map((job) => {
                const durMin = Math.round((new Date(job.end).getTime() - new Date(job.start).getTime()) / 60000);
                return (
                  <div
                    key={job.id}
                    className="min-w-[220px] border rounded-xl p-2 hover:bg-slate-50 cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "copyMove";
                      e.dataTransfer.setData("text/x-job-id", String(job.id));
                      e.dataTransfer.setData("text/plain", String(job.id));
                    }}
                    title="モータープールの車両レーンへドラッグで割当"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium truncate">{job.title}</div>
                      <span className="text-[10px] px-1 rounded bg-slate-100 text-slate-700">{job.preferClass}</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      {fmt(job.start)} - {fmt(job.end)}（{durMin}分）
                    </div>
                    <div className="text-xs text-slate-600">依頼元：{job.client?.name}</div>
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
