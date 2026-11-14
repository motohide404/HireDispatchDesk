import type { DriverAptitudeRecord } from "../data/drivers";
import type { TariffAdjustment } from "../data/partners";

export function todayInJapan(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(now);
}

function calendarDate(value?: string): number | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : undefined;
}

export function licenseExpiryStatus(date?: string, today = todayInJapan()) {
  const expiry = calendarDate(date);
  const current = calendarDate(today);
  if (expiry === undefined || current === undefined) {
    return { date: undefined, days: undefined, withinMonth: false, within60Days: false, tone: "neutral", label: "免許期限：未登録" } as const;
  }
  // Compare civil dates, not the current time. Expiry today remains included.
  const days = (expiry - current) / 86400000;
  const nextMonth = new Date(current);
  const day = nextMonth.getUTCDate();
  nextMonth.setUTCDate(1);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const lastDay = new Date(nextMonth);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  nextMonth.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  const withinMonth = days >= 0 && expiry <= nextMonth.getTime();
  const within60Days = days >= 0 && days <= 60;
  const label = days < 0 ? `期限切れ・${-days}日超過`
    : days === 0 ? "本日期限"
    : withinMonth ? `1か月以内・あと${days}日`
    : `あと${days}日`;
  return { date, days, withinMonth, within60Days, tone: days <= 0 ? "overdue" : withinMonth ? "urgent" : within60Days ? "soon" : "neutral", label } as const;
}

export function latestAptitude(records: DriverAptitudeRecord[] = []) {
  // For same-day records prefer the last saved entry. A backdated entry must
  // never replace the schedule of a more recent assessment.
  return records.reduce<DriverAptitudeRecord | undefined>(
    (latest, record) => !latest || record.assessedAt >= latest.assessedAt ? record : latest,
    undefined
  );
}

export function aptitudeDueStatus(records: DriverAptitudeRecord[] = [], today = todayInJapan()) {
  const date = latestAptitude(records)?.nextDueAt;
  if (!date) return { date: undefined, label: "次回未設定", tone: "neutral" } as const;
  if (date < today) return { date, label: "予定日超過", tone: "overdue" } as const;
  if (date === today) return { date, label: "本日予定", tone: "soon" } as const;
  const days = (Date.parse(date) - Date.parse(today)) / 86400000;
  return { date, label: days <= 60 ? `あと${days}日` : "受診予定", tone: days <= 60 ? "soon" : "neutral" } as const;
}

export function formatAdjustment(adjustment: TariffAdjustment) {
  return adjustment.kind === "none" ? "なし" : `${adjustment.value.toLocaleString("ja-JP")}${adjustment.kind === "percent" ? "%" : "円"}`;
}

export function validAdjustment(adjustment: TariffAdjustment) {
  const { kind, value } = adjustment;
  if (!Number.isFinite(value) || value < 0) return false;
  if (kind === "none") return value === 0;
  if (kind === "yen") return Number.isSafeInteger(value) && value <= 9999999999;
  return kind === "percent" && value <= 100 && Number(value.toFixed(2)) === value;
}
