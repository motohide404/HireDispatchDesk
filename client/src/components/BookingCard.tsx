export type BookingStatus = "assigned" | "enroute" | "completed" | "pending";

export type BookingCardData = {
  id: string;
  reference: string;
  status: BookingStatus;
  serviceType: string;
  start: string;
  end: string;
  pickup: {
    time: string;
    name: string;
    address?: string;
    note?: string;
  };
  dropoff: {
    time: string;
    name: string;
    address?: string;
  };
  passenger: {
    name: string;
    phone?: string;
    count: number;
  };
  luggageCount: number;
  distanceKm?: number;
  driver?: {
    name: string;
    callsign?: string;
    phone?: string;
  };
  vehicle?: {
    name: string;
    plate: string;
  };
  memo?: string;
};

type BookingCardProps = {
  data: BookingCardData;
  isBooking?: boolean;
  onReturn?: (id: string) => void;
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  assigned: "配車済み",
  enroute: "送迎中",
  completed: "完了",
  pending: "保留",
};

const STATUS_STYLE: Record<BookingStatus, string> = {
  assigned: "bg-emerald-100 text-emerald-700 border-emerald-200",
  enroute: "bg-sky-100 text-sky-700 border-sky-200",
  completed: "bg-slate-100 text-slate-600 border-slate-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
};

export default function BookingCard({ data, isBooking = false, onReturn }: BookingCardProps) {
  const { pickup, dropoff, passenger, driver, vehicle } = data;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{data.serviceType}</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">{data.reference}</h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[data.status]}`}
        >
          {STATUS_LABEL[data.status]}
        </span>
      </header>

      <section>
        <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">行程</h4>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            <div>
              <div className="text-sm font-semibold text-slate-800">{pickup.name}</div>
              <div className="text-xs text-slate-500">{fmt(pickup.time)} 集合</div>
              {pickup.address && <div className="text-xs text-slate-500">{pickup.address}</div>}
              {pickup.note && <div className="text-xs text-emerald-600">{pickup.note}</div>}
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-1 h-2 w-2 rounded-full bg-sky-500" aria-hidden />
            <div>
              <div className="text-sm font-semibold text-slate-800">{dropoff.name}</div>
              <div className="text-xs text-slate-500">{fmt(dropoff.time)} 到着予定</div>
              {dropoff.address && <div className="text-xs text-slate-500">{dropoff.address}</div>}
            </div>
          </div>
        </div>
        {typeof data.distanceKm === "number" && (
          <div className="mt-3 text-xs text-slate-500">想定距離：約 {data.distanceKm.toFixed(1)} km</div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div>
          <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">乗車情報</h4>
          <ul className="text-slate-700 space-y-1 text-sm">
            <li>
              代表者：<span className="font-medium">{passenger.name}</span>
              {passenger.phone && <span className="text-slate-500">（{passenger.phone}）</span>}
            </li>
            <li>乗車人数：{passenger.count} 名</li>
            <li>手荷物：{data.luggageCount} 個</li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">担当</h4>
          {driver ? (
            <ul className="text-slate-700 space-y-1 text-sm">
              <li>
                ドライバー：<span className="font-medium">{driver.name}</span>
                {driver.callsign && <span className="text-slate-500">（{driver.callsign}）</span>}
              </li>
              {driver.phone && <li>連絡先：{driver.phone}</li>}
            </ul>
          ) : (
            <div className="text-sm text-slate-500">未割り当て</div>
          )}
        </div>
      </section>

      <section>
        <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">車両</h4>
        <div>
          {vehicle ? (
            <>
              {vehicle.name}
              <span className="text-slate-500">　{vehicle.plate}</span>
            </>
          ) : (
            <span className="text-slate-500">未割り当て</span>
          )}
        </div>
      </section>

      {isBooking && onReturn && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">操作</h4>
          <button
            className="px-3 py-1 text-sm border rounded hover:bg-slate-50 transition"
            onClick={() => onReturn(data.id)}
            type="button"
            title="この予約を削除してジョブプールに戻す"
          >
            ジョブプールへ戻す
          </button>
        </section>
      )}

      <section>
        <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">検証</h4>
        <ul className="list-disc list-inside text-slate-700 space-y-1 text-sm">
          <li>労務：OK（デモ）</li>
          <li>車両衝突：OK（デモ）</li>
          <li>アプリ稼働と衝突：OK（デモ）</li>
        </ul>
      </section>

      <section>
        <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-1">ノート</h4>
        <div className="text-slate-600 text-sm">{data.memo ?? "ここに社内共有メモを記入"}</div>
      </section>
    </div>
  );
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
