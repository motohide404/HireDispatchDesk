
import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";

type Driver = {
  id: number;
  name: string;
  code: string;
  phone?: string;
};

type BookingStatus = "ok" | "warn" | "alert";

type Booking = {
  id: number;
  title: string;
  start: string;
  end: string;
  status: BookingStatus;
  vehicleId: number;
  driverId: number | null;
  client: {
    name: string;
    type: string;
  };
  notes?: string;
};

type Duty = {
  id: string;
  service: string;
  start: string;
  end: string;
  vehicleId: number;
  driverId: number | null;
};

type Vehicle = {
  id: number;
  name: string;
  code: string;
  plate: string;
  color: string;
  capacity: number;
  bookings: Booking[];
  duties: Duty[];
  notes?: string;
};

type SelectedItem =
  | {
      type: "booking";
      vehicle: Vehicle;
      data: Booking;
    }
  | {
      type: "duty";
      vehicle: Vehicle;
      data: Duty;
    };

type SelectedKey =
  | { type: "booking"; vehicleId: number; id: number }
  | { type: "duty"; vehicleId: number; id: string };

const UNASSIGNED_VEHICLE_ID = 0;
const LP_MS = 550;
const hours = Array.from({ length: 24 }, (_, i) => i);

const drivers: Driver[] = [
  { id: 1, name: "佐藤 亮", code: "ST01", phone: "090-1234-5678" },
  { id: 2, name: "伊藤 智子", code: "IT08", phone: "090-2345-6789" },
  { id: 3, name: "田中 翔太", code: "TN12", phone: "090-3456-7890" },
  { id: 4, name: "中村 海斗", code: "NK05", phone: "090-4567-8901" },
  { id: 5, name: "吉田 菜摘", code: "YS03", phone: "090-5678-9012" }
];

const driverMap = new Map<number, Driver>(drivers.map((driver) => [driver.id, driver]));

const vehicleSeed: Vehicle[] = [
  {
    id: UNASSIGNED_VEHICLE_ID,
    name: "未配車リスト",
    code: "POOL",
    plate: "-",
    color: "bg-slate-200",
    capacity: 0,
    bookings: [
      {
        id: 9001,
        title: "VIP送迎（迎車）",
        start: "2024-05-18T05:30:00",
        end: "2024-05-18T06:10:00",
        status: "warn",
        vehicleId: UNASSIGNED_VEHICLE_ID,
        driverId: null,
        client: { name: "グローバル商事", type: "法人" },
        notes: "羽田空港第3ターミナルで看板出し"
      },
      {
        id: 9002,
        title: "ブライダル送迎",
        start: "2024-05-18T14:20:00",
        end: "2024-05-18T16:00:00",
        status: "alert",
        vehicleId: UNASSIGNED_VEHICLE_ID,
        driverId: null,
        client: { name: "プライムチャペル", type: "個人" },
        notes: "白い車両希望／渋谷セルリアンタワー集合"
      }
    ],
    duties: [],
    notes: "ドラフト案件置き場"
  },
  {
    id: 11,
    name: "アルファード",
    code: "VH-11",
    plate: "品川300 あ･112",
    color: "bg-emerald-500/10",
    capacity: 6,
    bookings: [
      {
        id: 1001,
        title: "空港送迎（成田→都内）",
        start: "2024-05-18T07:40:00",
        end: "2024-05-18T09:30:00",
        status: "ok",
        vehicleId: 11,
        driverId: 1,
        client: { name: "ワールドリンクス", type: "法人" },
        notes: "荷物多め、台車積載済"
      },
      {
        id: 1002,
        title: "企業視察（終日チャーター）",
        start: "2024-05-18T10:30:00",
        end: "2024-05-18T18:00:00",
        status: "warn",
        vehicleId: 11,
        driverId: 1,
        client: { name: "ネクスト・ホールディングス", type: "法人" },
        notes: "昼食先：豊洲市場／担当：営業部 井上"
      }
    ],
    duties: [
      {
        id: "duty-11-1",
        service: "アプリ稼働 A シフト",
        start: "2024-05-18T06:30:00",
        end: "2024-05-18T22:00:00",
        vehicleId: 11,
        driverId: 1
      }
    ],
    notes: "営業車両（黒）"
  },
  {
    id: 12,
    name: "ハイエース",
    code: "VH-12",
    plate: "品川400 い･556",
    color: "bg-sky-500/10",
    capacity: 9,
    bookings: [
      {
        id: 1101,
        title: "観光チャーター（都内→箱根）",
        start: "2024-05-18T08:15:00",
        end: "2024-05-18T20:45:00",
        status: "ok",
        vehicleId: 12,
        driverId: 2,
        client: { name: "アルカディアツアーズ", type: "法人" },
        notes: "お土産購入時間を確保"
      }
    ],
    duties: [
      {
        id: "duty-12-1",
        service: "アプリ稼働 B シフト",
        start: "2024-05-18T07:00:00",
        end: "2024-05-18T23:00:00",
        vehicleId: 12,
        driverId: 2
      }
    ],
    notes: "ロング案件メイン"
  },
  {
    id: 13,
    name: "クラウン",
    code: "VH-13",
    plate: "品川300 う･778",
    color: "bg-purple-500/10",
    capacity: 4,
    bookings: [
      {
        id: 1201,
        title: "ナイトアテンド",
        start: "2024-05-18T21:00:00",
        end: "2024-05-19T01:30:00",
        status: "ok",
        vehicleId: 13,
        driverId: 3,
        client: { name: "ナイトライフコンシェルジュ", type: "法人" },
        notes: "終了時に明日の予定確認"
      }
    ],
    duties: [
      {
        id: "duty-13-1",
        service: "ナイト当番",
        start: "2024-05-18T20:00:00",
        end: "2024-05-19T05:00:00",
        vehicleId: 13,
        driverId: 3
      }
    ],
    notes: "夜間帯に強い crew"
  },
  {
    id: 14,
    name: "e-タクシー",
    code: "VH-14",
    plate: "品川500 え･910",
    color: "bg-amber-500/10",
    capacity: 4,
    bookings: [
      {
        id: 1301,
        title: "定期送迎（港区→品川）",
        start: "2024-05-18T06:30:00",
        end: "2024-05-18T07:15:00",
        status: "ok",
        vehicleId: 14,
        driverId: 4,
        client: { name: "クラークスクール", type: "法人" },
        notes: "お子さま送迎／チャイルドシート確認"
      },
      {
        id: 1302,
        title: "役員送迎",
        start: "2024-05-18T17:00:00",
        end: "2024-05-18T19:00:00",
        status: "warn",
        vehicleId: 14,
        driverId: 4,
        client: { name: "サザンテック", type: "法人" },
        notes: "往路：六本木→羽田 国内線"
      }
    ],
    duties: [
      {
        id: "duty-14-1",
        service: "定期便",
        start: "2024-05-18T05:30:00",
        end: "2024-05-18T18:30:00",
        vehicleId: 14,
        driverId: 4
      }
    ],
    notes: "EV／充電残 80%"
  }
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function fmt(value: string) {
  const d = new Date(value);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function rangeForDay(start: string, end: string, viewDate: string, pxPerMin: number) {
  const startDate = new Date(start);
  const endDateRaw = new Date(end);
  const viewStart = new Date(`${viewDate}T00:00:00`);
  const dayStartMs = viewStart.getTime();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
  let startMs = startDate.getTime();
  let endMs = endDateRaw.getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { left: 0, width: 0, clipL: false, clipR: false, overnight: false };
  }

  if (endMs <= startMs) {
    endMs += 24 * 60 * 60 * 1000;
  }

  const clippedStart = clamp(Math.max(startMs, dayStartMs), dayStartMs, dayEndMs);
  const clippedEnd = clamp(Math.min(endMs, dayEndMs), dayStartMs, dayEndMs);
  const left = ((clippedStart - dayStartMs) / (60 * 1000)) * pxPerMin;
  const width = Math.max(0, ((clippedEnd - clippedStart) / (60 * 1000)) * pxPerMin);

  return {
    left,
    width,
    clipL: startMs < dayStartMs,
    clipR: endMs > dayEndMs,
    overnight: endMs > dayEndMs
  };
}

function vehicleIdAtPoint(x: number, y: number) {
  if (typeof document === "undefined") return null;
  const elements = document.elementsFromPoint(x, y);
  for (const element of elements) {
    const dataset = (element as HTMLElement).dataset;
    if (dataset?.vehicleId) {
      const parsed = Number(dataset.vehicleId);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
}

function sortByStart<T extends { start: string }>(items: T[]) {
  return [...items].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
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

function AppDutyBlock({ duty, pxPerMin, viewDate, onClick, isSelected, onMoveDutyToVehicle }: { duty: Duty; pxPerMin: number; viewDate: string; onClick: () => void; isSelected?: boolean; onMoveDutyToVehicle: (dutyId: string, fromVehicleId: number, destVehicleId: number) => void }) {
  const { left, width, clipL, clipR, overnight } = rangeForDay(duty.start, duty.end, viewDate, pxPerMin);
  const driverLabel = duty.driverId ? `（${driverMap.get(duty.driverId)?.name}）` : "";
  if (width <= 0) return null;

  const pId = useRef<number | null>(null);
  const longRef = useRef<number | null>(null);
  const draggingTouch = useRef(false);
  const hoverVid = useRef<number | null>(null);
  const clearHover = () => {
    if (hoverVid.current != null) {
      const el = document.querySelector(`[data-vehicle-id="${hoverVid.current}"]`) as HTMLElement | null;
      el?.classList.remove("ring-2", "ring-blue-300");
      hoverVid.current = null;
    }
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pId.current = e.pointerId;
    longRef.current = window.setTimeout(() => {
      draggingTouch.current = true;
    }, LP_MS);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
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
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pId.current == null) return;
    e.currentTarget.releasePointerCapture(pId.current);
    if (longRef.current != null) window.clearTimeout(longRef.current);
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

function BookingBlock({ booking, pxPerMin, viewDate, onClick, isSelected, onDriverDrop, draggable, onDragStart, flashUnassign, onMoveToVehicle }: { booking: Booking; pxPerMin: number; viewDate: string; onClick: () => void; isSelected?: boolean; onDriverDrop: (bookingId: number, driverId: number) => void; draggable?: boolean; onDragStart?: (e: ReactDragEvent<HTMLDivElement>) => void; flashUnassign?: boolean; onMoveToVehicle: (bookingId: number, fromVehicleId: number, destVehicleId: number, originalDriverId: number | null) => void }) {
  const { left, width, clipL, clipR, overnight } = rangeForDay(booking.start, booking.end, viewDate, pxPerMin);
  if (width <= 0) return null;
  const color = booking.status === "ok" ? "bg-green-500/80" : booking.status === "warn" ? "bg-yellow-500/80" : "bg-red-500/80";
  const ring = booking.status === "ok" ? "ring-green-400" : booking.status === "warn" ? "ring-yellow-400" : "ring-red-400";
  const driver = booking.driverId ? driverMap.get(booking.driverId) : null;

  const [over, setOver] = useState(false);
  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(true);
  };
  const handleDragLeave = () => setOver(false);
  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
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
  const onMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    downRef.current = { x: e.clientX, y: e.clientY };
    draggedRef.current = false;
  };
  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!downRef.current) return;
    const dx = Math.abs(e.clientX - downRef.current.x);
    const dy = Math.abs(e.clientY - downRef.current.y);
    if (dx > TH || dy > TH) draggedRef.current = true;
  };
  const onCardClick = () => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    onClick();
  };

  const pId = useRef<number | null>(null);
  const longRef = useRef<number | null>(null);
  const draggingTouch = useRef(false);
  const hoverVid = useRef<number | null>(null);
  const clearHover = () => {
    if (hoverVid.current != null) {
      const el = document.querySelector(`[data-vehicle-id="${hoverVid.current}"]`) as HTMLElement | null;
      el?.classList.remove("ring-2", "ring-blue-300");
      hoverVid.current = null;
    }
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pId.current = e.pointerId;
    longRef.current = window.setTimeout(() => {
      draggingTouch.current = true;
    }, LP_MS);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
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
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pId.current == null) return;
    e.currentTarget.releasePointerCapture(pId.current);
    if (longRef.current != null) window.clearTimeout(longRef.current);
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
          <span className="text-[10px] px-2 py-0.5 rounded bg-white/90 text-slate-800 border border-transparent">
            {driver.name}（{driver.code}）
          </span>
        ) : (
          <span className={`text-[10px] px-2 py-0.5 rounded bg-white/90 text-amber-700 ${flashUnassign ? "blink3 border border-amber-500" : "border border-transparent"}`}>
            ドライバー未割当
          </span>
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

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    startX.current = e.clientX;
    startV.current = value;
    const onMove = (ev: PointerEvent) => {
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

function Drawer({ isMobile, onClose, children }: { isMobile: boolean; onClose: () => void; children: ReactNode }) {
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

function DetailsPane({ item, onReturn }: { item: SelectedItem | null; onReturn?: (id: number) => void }) {
  if (!item) return <div className="text-slate-500 text-sm">項目が選択されていません</div>;
  const type = item.type;
  const v = item.vehicle;
  const data = item.data as Booking | Duty;
  const driverId = "driverId" in data ? data.driverId : null;
  const driver = driverId ? driverMap.get(driverId) : null;
  const isBooking = type === "booking";

  const formatter = new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  return (
    <div className="space-y-4 text-sm">
      <section>
        <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">概要</h4>
        <div className="font-medium">
          {isBooking ? (data as Booking).title : `${(data as Duty).service}${driver ? `（${driver.name}）` : ""}`}
        </div>
        <div className="text-slate-600">
          {formatter.format(new Date(data.start))} - {formatter.format(new Date(data.end))}
          {new Date(data.end) <= new Date(data.start) ? "（→翌）" : ""}
        </div>
        {isBooking && (
          <div className="text-slate-600">
            依頼元：{(data as Booking).client?.type}/{(data as Booking).client?.name}
          </div>
        )}
      </section>

      <section>
        <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">ドライバー</h4>
        <div>
          {driver ? (
            <div>
              <div className="font-medium">
                {driver.name}（{driver.code}）
              </div>
              {driver.phone && <div className="text-slate-500 text-xs">TEL: {driver.phone}</div>}
            </div>
          ) : (
            <span className="text-amber-600">未割当</span>
          )}
        </div>
      </section>

      <section>
        <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">車両</h4>
        <div className="font-medium">{v.name}</div>
        <div className="text-slate-500 text-xs">
          {v.code} ／ {v.plate} ／ 定員 {v.capacity} 名
        </div>
        {v.notes && <div className="text-slate-500 text-xs mt-1">メモ：{v.notes}</div>}
      </section>

      {isBooking && (data as Booking).notes && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">備考</h4>
          <p className="leading-relaxed text-slate-600 whitespace-pre-wrap">{(data as Booking).notes}</p>
        </section>
      )}

      {isBooking && v.id !== UNASSIGNED_VEHICLE_ID && (
        <section>
          <button
            className="text-sm px-3 py-1.5 rounded border border-slate-300 hover:border-blue-500 hover:text-blue-600 transition"
            onClick={() => onReturn?.((data as Booking).id)}
          >
            未配車リストへ戻す
          </button>
        </section>
      )}
    </div>
  );
}

export default function VehicleDispatchBoardMock() {
  const viewDate = "2024-05-18";
  const [hourPx, setHourPx] = useState(110);
  const [vehicleColumnWidth, setVehicleColumnWidth] = useState(220);
  const pxPerMin = hourPx / 60;
  const [vehicles, setVehicles] = useState<Vehicle[]>(() =>
    vehicleSeed.map((vehicle) => ({
      ...vehicle,
      bookings: sortByStart(vehicle.bookings),
      duties: sortByStart(vehicle.duties)
    }))
  );
  const [selectedKey, setSelectedKey] = useState<SelectedKey | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const selectedItem = useMemo<SelectedItem | null>(() => {
    if (!selectedKey) return null;
    const vehicle = vehicles.find((v) => v.id === selectedKey.vehicleId);
    if (!vehicle) return null;
    if (selectedKey.type === "booking") {
      const booking = vehicle.bookings.find((b) => b.id === selectedKey.id);
      return booking ? { type: "booking", vehicle, data: booking } : null;
    }
    const duty = vehicle.duties.find((d) => d.id === selectedKey.id);
    return duty ? { type: "duty", vehicle, data: duty } : null;
  }, [selectedKey, vehicles]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches);
    };
    handler(mq);
    mq.addEventListener("change", handler as (event: MediaQueryListEvent) => void);
    return () => mq.removeEventListener("change", handler as (event: MediaQueryListEvent) => void);
  }, []);

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  const timelineWidth = hourPx * 24;
  const dayLabel = useMemo(() => {
    const base = new Date(`${viewDate}T00:00:00`);
    return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(base);
  }, [viewDate]);

  const selectBooking = (vehicle: Vehicle, booking: Booking) => {
    setSelectedKey({ type: "booking", vehicleId: vehicle.id, id: booking.id });
    if (isMobile) setDrawerOpen(true);
  };

  const selectDuty = (vehicle: Vehicle, duty: Duty) => {
    setSelectedKey({ type: "duty", vehicleId: vehicle.id, id: duty.id });
    if (isMobile) setDrawerOpen(true);
  };

  const moveDutyToVehicle = (dutyId: string, fromVehicleId: number, destVehicleId: number) => {
    if (fromVehicleId === destVehicleId) return;
    setVehicles((prev) => {
      const fromVehicle = prev.find((v) => v.id === fromVehicleId);
      const duty = fromVehicle?.duties.find((d) => d.id === dutyId);
      if (!duty) return prev;
      return prev.map((vehicle) => {
        if (vehicle.id === fromVehicleId) {
          return { ...vehicle, duties: vehicle.duties.filter((d) => d.id !== dutyId) };
        }
        if (vehicle.id === destVehicleId) {
          const nextDuty = { ...duty, vehicleId: destVehicleId };
          return { ...vehicle, duties: sortByStart([...vehicle.duties, nextDuty]) };
        }
        return vehicle;
      });
    });
    setSelectedKey((prev) => {
      if (prev?.type === "duty" && prev.id === dutyId) {
        return { type: "duty", vehicleId: destVehicleId, id: dutyId };
      }
      return prev;
    });
  };

  const moveBookingToVehicle = (bookingId: number, fromVehicleId: number, destVehicleId: number, originalDriverId: number | null) => {
    if (fromVehicleId === destVehicleId) return;
    setVehicles((prev) => {
      let moving: Booking | null = null;
      const without = prev.map((vehicle) => {
        if (vehicle.id === fromVehicleId) {
          const target = vehicle.bookings.find((b) => b.id === bookingId) || null;
          if (target) {
            moving = target;
          }
          return { ...vehicle, bookings: vehicle.bookings.filter((b) => b.id !== bookingId) };
        }
        return vehicle;
      });
      if (!moving) return prev;
      return without.map((vehicle) => {
        if (vehicle.id === destVehicleId) {
          const next = {
            ...moving!,
            vehicleId: destVehicleId,
            driverId: destVehicleId === UNASSIGNED_VEHICLE_ID ? null : originalDriverId
          };
          return { ...vehicle, bookings: sortByStart([...vehicle.bookings, next]) };
        }
        return vehicle;
      });
    });
    setSelectedKey((prev) => {
      if (prev?.type === "booking" && prev.id === bookingId) {
        return { type: "booking", vehicleId: destVehicleId, id: bookingId };
      }
      return prev;
    });
  };

  const handleDriverDrop = (bookingId: number, driverId: number) => {
    setVehicles((prev) =>
      prev.map((vehicle) => ({
        ...vehicle,
        bookings: vehicle.bookings.map((booking) => (booking.id === bookingId ? { ...booking, driverId } : booking))
      }))
    );
  };

  const handleReturnToPool = (bookingId: number) => {
    const fromVehicle = vehicles.find((vehicle) => vehicle.bookings.some((b) => b.id === bookingId));
    if (!fromVehicle) return;
    moveBookingToVehicle(bookingId, fromVehicle.id, UNASSIGNED_VEHICLE_ID, null);
    setDrawerOpen(false);
  };

  const handleBookingDragStart = (booking: Booking) => (e: ReactDragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-booking-id", String(booking.id));
    e.dataTransfer.setData("text/x-from-vehicle-id", String(booking.vehicleId));
    e.dataTransfer.setData("text/plain", booking.title);
  };

  const handleRowDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleRowDrop = (vehicleId: number, e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const types = Array.from(e.dataTransfer?.types || []);
    if (types.includes("text/x-booking-id")) {
      const bookingId = Number(e.dataTransfer.getData("text/x-booking-id"));
      const fromVehicleId = Number(e.dataTransfer.getData("text/x-from-vehicle-id"));
      if (!Number.isNaN(bookingId) && !Number.isNaN(fromVehicleId)) {
        const originalDriver = vehicles
          .find((v) => v.id === fromVehicleId)
          ?.bookings.find((b) => b.id === bookingId)?.driverId ?? null;
        moveBookingToVehicle(bookingId, fromVehicleId, vehicleId, originalDriver);
      }
    } else if (types.includes("text/x-duty-move")) {
      const dutyId = e.dataTransfer.getData("text/x-duty-move");
      const fromVehicleId = Number(e.dataTransfer.getData("text/x-from-vehicle-id"));
      if (dutyId && !Number.isNaN(fromVehicleId)) {
        moveDutyToVehicle(dutyId, fromVehicleId, vehicleId);
      }
    }
  };

  const driverDragStart = (driver: Driver) => (e: ReactDragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/x-driver-id", String(driver.id));
    e.dataTransfer.setData("text/plain", driver.name);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">日次配車表（ダミー）</h2>
            <p className="text-sm text-slate-500">{dayLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <label className="flex items-center gap-2">
              <span className="whitespace-nowrap">タイムスケール</span>
              <input
                type="range"
                min={60}
                max={160}
                value={hourPx}
                onChange={(e) => setHourPx(Number(e.target.value))}
              />
              <span>{hourPx}px/時間</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="whitespace-nowrap">車両列</span>
              <span>{vehicleColumnWidth}px</span>
            </label>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-2">ドラッグ可能なドライバー</h3>
            <div className="flex flex-wrap gap-2">
              {drivers.map((driver) => (
                <div
                  key={driver.id}
                  draggable
                  onDragStart={driverDragStart(driver)}
                  className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 shadow-sm hover:border-blue-400 hover:text-blue-600"
                  title={`${driver.name}（${driver.code}）`}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                    {driver.code}
                  </span>
                  <span>{driver.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="relative flex">
                <div className="relative shrink-0 border-r border-slate-200 bg-slate-50" style={{ width: vehicleColumnWidth }}>
                  <div className="h-12 border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    車両 / 備考
                  </div>
                  {vehicles.map((vehicle) => (
                    <div key={vehicle.id} className="border-b border-slate-200 px-4 py-3">
                      <div className="flex items-center justify-between text-sm font-medium text-slate-800">
                        <span>{vehicle.name}</span>
                        <span className="text-xs text-slate-500">{vehicle.code}</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {vehicle.plate}
                        {vehicle.capacity > 0 ? ` ／ 定員${vehicle.capacity}名` : ""}
                      </div>
                      {vehicle.notes && <div className="mt-1 text-[11px] text-slate-500">{vehicle.notes}</div>}
                    </div>
                  ))}
                  <ResizeHandle value={vehicleColumnWidth} setValue={setVehicleColumnWidth} min={180} max={320} side="right" />
                </div>

                <div className="relative flex-1 overflow-x-auto">
                  <div className="relative" style={{ width: timelineWidth }}>
                    <GridOverlay hourPx={hourPx} />
                    <div className="h-12 border-b border-slate-200 bg-white/90 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur">
                      タイムライン
                    </div>
                    {vehicles.map((vehicle, index) => (
                      <div
                        key={vehicle.id}
                        className={`relative h-16 border-b border-slate-200 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/60"}`}
                        data-vehicle-id={vehicle.id}
                        onDragOver={handleRowDragOver}
                        onDrop={(e) => handleRowDrop(vehicle.id, e)}
                      >
                        {vehicle.duties.map((duty) => (
                          <AppDutyBlock
                            key={duty.id}
                            duty={duty}
                            pxPerMin={pxPerMin}
                            viewDate={viewDate}
                            onClick={() => selectDuty(vehicle, duty)}
                            isSelected={selectedKey?.type === "duty" && selectedKey.id === duty.id}
                            onMoveDutyToVehicle={moveDutyToVehicle}
                          />
                        ))}
                        {vehicle.bookings.map((booking) => (
                          <BookingBlock
                            key={booking.id}
                            booking={booking}
                            pxPerMin={pxPerMin}
                            viewDate={viewDate}
                            onClick={() => selectBooking(vehicle, booking)}
                            isSelected={selectedKey?.type === "booking" && selectedKey.id === booking.id}
                            onDriverDrop={handleDriverDrop}
                            draggable={vehicle.id !== UNASSIGNED_VEHICLE_ID}
                            onDragStart={handleBookingDragStart(booking)}
                            flashUnassign={booking.driverId == null}
                            onMoveToVehicle={moveBookingToVehicle}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden lg:block">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-slate-900">詳細検証ペイン</h3>
          <div className="mt-4">
            <DetailsPane item={selectedItem} onReturn={handleReturnToPool} />
          </div>
        </div>
      </div>

      {isMobile && drawerOpen && (
        <Drawer isMobile={isMobile} onClose={() => setDrawerOpen(false)}>
          <DetailsPane item={selectedItem} onReturn={handleReturnToPool} />
        </Drawer>
      )}
    </div>
  );
}
