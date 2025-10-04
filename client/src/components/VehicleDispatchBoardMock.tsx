import { useMemo, useState } from "react";
import BookingCard, { type BookingCardData } from "./BookingCard";

type DriverAssignment = {
  bookingId: string;
  start: string;
  end: string;
};

type Driver = {
  id: string;
  name: string;
  callsign: string;
  shift: string;
  status: string;
  assignments: DriverAssignment[];
};

const day = "2024-04-21";

const bookings: BookingCardData[] = [
  {
    id: "BK-2404-001",
    reference: "BK-2404-001",
    status: "assigned",
    serviceType: "空港送迎",
    start: iso(9, 15),
    end: iso(10, 25),
    pickup: {
      time: iso(9, 30),
      name: "羽田空港 第3ターミナル",
      address: "東京都大田区羽田空港2-6-5",
      note: "ANA108便、到着ロビーB",
    },
    dropoff: {
      time: iso(10, 20),
      name: "帝国ホテル 東京",
      address: "東京都千代田区内幸町1-1-1",
    },
    passenger: {
      name: "佐藤 太郎",
      phone: "080-1234-5678",
      count: 2,
    },
    luggageCount: 3,
    distanceKm: 18.4,
    driver: {
      name: "山田 花子",
      callsign: "Car 12",
      phone: "080-9000-1111",
    },
    vehicle: {
      name: "トヨタ アルファード",
      plate: "品川 300 あ 12-34",
    },
    memo: "到着ロビーでネームボード掲示。高速道路利用。",
  },
  {
    id: "BK-2404-002",
    reference: "BK-2404-002",
    status: "assigned",
    serviceType: "定期送迎",
    start: iso(11, 0),
    end: iso(12, 15),
    pickup: {
      time: iso(11, 10),
      name: "品川プリンスホテル",
      address: "東京都港区高輪4-10-30",
    },
    dropoff: {
      time: iso(12, 10),
      name: "東京ビッグサイト",
      address: "東京都江東区有明3-11-1",
    },
    passenger: {
      name: "リー ジェイ",
      count: 3,
      phone: "080-5555-9876",
    },
    luggageCount: 2,
    distanceKm: 14.1,
    driver: {
      name: "山田 花子",
      callsign: "Car 12",
      phone: "080-9000-1111",
    },
    vehicle: {
      name: "トヨタ アルファード",
      plate: "品川 300 あ 12-34",
    },
    memo: "展示会VIP送迎。会場で昼食の時間を確保。",
  },
  {
    id: "BK-2404-003",
    reference: "BK-2404-003",
    status: "enroute",
    serviceType: "観光スポット巡り",
    start: iso(10, 45),
    end: iso(14, 30),
    pickup: {
      time: iso(11, 0),
      name: "東京駅 丸の内中央口",
    },
    dropoff: {
      time: iso(14, 20),
      name: "浅草寺 雷門前",
    },
    passenger: {
      name: "ロドリゲス ファミリー",
      count: 4,
      phone: "070-3333-2100",
    },
    luggageCount: 1,
    distanceKm: 22.6,
    driver: {
      name: "鈴木 健",
      callsign: "Car 27",
      phone: "080-1000-2020",
    },
    vehicle: {
      name: "日産 エルグランド",
      plate: "練馬 301 て 45-67",
    },
    memo: "途中で浅草仲見世通りにて40分自由散策。",
  },
  {
    id: "BK-2404-004",
    reference: "BK-2404-004",
    status: "pending",
    serviceType: "スポット配車",
    start: iso(15, 0),
    end: iso(16, 0),
    pickup: {
      time: iso(15, 10),
      name: "渋谷スクランブルスクエア",
    },
    dropoff: {
      time: iso(15, 55),
      name: "六本木ヒルズ",
    },
    passenger: {
      name: "中村 美咲",
      count: 1,
    },
    luggageCount: 0,
    memo: "雨天のため余裕を持って配車したい。",
  },
  {
    id: "BK-2404-005",
    reference: "BK-2404-005",
    status: "pending",
    serviceType: "空港送迎",
    start: iso(17, 30),
    end: iso(19, 0),
    pickup: {
      time: iso(17, 45),
      name: "成田空港 第2ターミナル",
    },
    dropoff: {
      time: iso(18, 55),
      name: "ホテルニューオータニ",
    },
    passenger: {
      name: "チェン ジェン",
      count: 2,
    },
    luggageCount: 4,
    memo: "フライト遅延の可能性あり。",
  },
];

const drivers: Driver[] = [
  {
    id: "DRV-01",
    name: "山田 花子",
    callsign: "Car 12",
    shift: "08:00 - 17:00",
    status: "稼働中",
    assignments: [
      { bookingId: "BK-2404-001", start: iso(9, 15), end: iso(10, 25) },
      { bookingId: "BK-2404-002", start: iso(11, 0), end: iso(12, 15) },
    ],
  },
  {
    id: "DRV-02",
    name: "鈴木 健",
    callsign: "Car 27",
    shift: "10:00 - 19:00",
    status: "観光アテンド中",
    assignments: [{ bookingId: "BK-2404-003", start: iso(10, 45), end: iso(14, 30) }],
  },
  {
    id: "DRV-03",
    name: "高橋 亮",
    callsign: "Car 31",
    shift: "12:00 - 21:00",
    status: "アイドル",
    assignments: [],
  },
];

const jobPoolIds = ["BK-2404-004", "BK-2404-005"];

const timelineStart = new Date(`${day}T08:00:00+09:00`);
const timelineEnd = new Date(`${day}T20:00:00+09:00`);

const timelineTicks = Array.from({ length: 7 }, (_, idx) => new Date(timelineStart.getTime() + idx * 2 * 60 * 60 * 1000));

export default function VehicleDispatchBoardMock() {
  const bookingById = useMemo(() => new Map(bookings.map((b) => [b.id, b])), []);
  const [selectedId, setSelectedId] = useState<string>(bookings[0]?.id ?? "");

  const selectedBooking = bookingById.get(selectedId) ?? null;

  const isAssignedBooking = useMemo(
    () => drivers.some((driver) => driver.assignments.some((assignment) => assignment.bookingId === selectedId)),
    [selectedId]
  );

  const jobPool = useMemo(() => jobPoolIds.map((id) => bookingById.get(id)).filter((b): b is BookingCardData => Boolean(b)), [
    bookingById,
  ]);

  const onReturn = (id: string) => {
    console.info(`[mock] return booking ${id} to job pool`);
  };

  return (
    <div className="space-y-10 text-slate-800">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">配車ボード（デモ）</h1>
          <p className="text-sm text-slate-500">{day} ・ 乗務状況のサマリー</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          <span>配車済みジョブ</span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),360px]">
        <div className="space-y-6">
          {drivers.map((driver) => (
            <article key={driver.id} className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{driver.name}</h2>
                  <p className="text-sm text-slate-500">
                    {driver.callsign} ・ シフト {driver.shift}
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {driver.status}
                </span>
              </header>
              <div className="px-6 py-5">
                <div className="grid grid-cols-6 gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {timelineTicks.map((tick, idx) => (
                    <div key={idx} className="border-l border-slate-200 first:border-l-0 pl-2">
                      {fmt(tick.toISOString())}
                    </div>
                  ))}
                </div>
                <div className="relative mt-3 h-28 rounded-2xl border border-dashed border-slate-200 bg-slate-50">
                  {driver.assignments.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                      割り当てなし
                    </div>
                  )}
                  {driver.assignments.map((assignment) => {
                    const booking = bookingById.get(assignment.bookingId);
                    if (!booking) return null;

                    const startPct = positionPercent(assignment.start);
                    const endPct = positionPercent(assignment.end);
                    const width = Math.max(endPct - startPct, 12);
                    const left = clamp(startPct, 0, 100 - width);
                    const isActive = selectedId === booking.id;

                    return (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => setSelectedId(booking.id)}
                        className={`absolute top-3 h-20 rounded-2xl border px-4 py-3 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 ${
                          isActive
                            ? "border-emerald-500 bg-white/90 shadow"
                            : "border-emerald-200 bg-white hover:bg-emerald-50"
                        }`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        aria-pressed={isActive}
                      >
                        <div className="text-xs font-semibold text-slate-600">{booking.reference}</div>
                        <div className="mt-1 text-sm font-medium text-slate-900">
                          {booking.pickup.name}
                          <span className="text-slate-400"> → </span>
                          {booking.dropoff.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {fmt(booking.pickup.time)} - {fmt(booking.dropoff.time)} / {booking.passenger.count} 名
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </article>
          ))}
        </div>

        <aside className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">ジョブ詳細</h2>
            <p className="text-sm text-slate-400">選択したジョブの詳細情報</p>
          </div>
          {selectedBooking ? (
            <BookingCard data={selectedBooking} isBooking={isAssignedBooking} onReturn={isAssignedBooking ? onReturn : undefined} />
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
              ジョブを選択すると詳細が表示されます。
            </div>
          )}
        </aside>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">ジョブプール</h2>
          <span className="text-xs text-slate-400">未割り当て {jobPool.length} 件</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {jobPool.map((job) => {
            const isActive = job.id === selectedId;
            return (
              <button
                key={job.id}
                type="button"
                onClick={() => setSelectedId(job.id)}
                className={`rounded-2xl border px-4 py-3 text-left shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 ${
                  isActive
                    ? "border-amber-500 bg-white"
                    : "border-slate-200 bg-white hover:bg-amber-50"
                }`}
                aria-pressed={isActive}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-amber-600">{job.serviceType}</div>
                  <span className="text-xs text-slate-400">{job.reference}</span>
                </div>
                <div className="mt-2 text-sm font-medium text-slate-900">
                  {job.pickup.name}
                  <span className="text-slate-400"> → </span>
                  {job.dropoff.name}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {fmt(job.pickup.time)} - {fmt(job.dropoff.time)} ・ {job.passenger.count} 名 / 手荷物 {job.luggageCount} 個
                </div>
                <div className="mt-1 text-xs text-slate-400">備考：{job.memo ?? "特記事項なし"}</div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function positionPercent(isoString: string) {
  const total = timelineEnd.getTime() - timelineStart.getTime();
  const current = new Date(isoString).getTime() - timelineStart.getTime();
  return (current / total) * 100;
}

function iso(hour: number, minute: number) {
  return `${day}T${pad2(hour)}:${pad2(minute)}:00+09:00`;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmt(s: string) {
  const d = new Date(s);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
