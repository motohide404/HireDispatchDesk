import { isoTime, localTime } from './dutyLog';
import type { TransportDocument } from './transportDocuments';
export const activityNames = { deadhead: '回送', passenger: '実車', waiting: '待機', break: '休憩', handover: '交替', other: 'その他' };
export type Activity = keyof typeof activityNames;
export type DailyRow = { id: string; kind: Activity; startAt: string; endAt: string; from: string; to: string; meter: string; rollover: boolean; passengers: string; note: string; instructionId: string; jobLabel: string; plannedStart: string; plannedEnd: string };
export type DailyReport = { id: string; reportId: string; version: number; date: string; driverId: number; driverName: string; vehicleId: number; vehiclePlate: string; office: string; status: 'draft' | 'submitted'; reason: string; savedAt: string; startAt: string; startPlace: string; startOdometer: string; dutyStart: string; dutyEnd: string; notes: string; rows: DailyRow[] };
export const uuid = () => crypto.randomUUID();
export function newDailyRow(kind: Activity = 'deadhead', from = ''): DailyRow { return { id: uuid(), kind, startAt: '', endAt: '', from, to: '', meter: '', rollover: false, passengers: '', note: '', instructionId: '', jobLabel: '', plannedStart: '', plannedEnd: '' }; }
export function instructionRow(doc: TransportDocument) { return { ...newDailyRow('passenger'), from: doc.values.boardingPlace, to: doc.values.alightingPlace, instructionId: doc.id, jobLabel: doc.source.title.slice(0, 100), plannedStart: doc.values.boardingAt, plannedEnd: doc.values.alightingAt }; }
export function meterSummary(report: Pick<DailyReport, 'startOdometer' | 'rows'>) {
  let previous: number | null = /^\d{1,7}$/.test(report.startOdometer) ? Number(report.startOdometer) % 1000 : null;
  let total = 0, passenger = 0;
  const distances = report.rows.map(row => {
    const next = /^\d{1,3}$/.test(row.meter) ? Number(row.meter) : null;
    const distance = previous === null || next === null ? null : (next - previous + 1000) % 1000;
    // An unknown segment makes the day's total unknown, even after a later reading.
    previous = next;
    if (distance !== null) { total += distance; if (row.kind === 'passenger') passenger += distance; }
    return distance;
  });
  const complete = previous !== null && distances.every(n => n !== null);
  return { distances, total: complete ? total : null, passenger: complete ? passenger : null, endOdometer: complete ? Number(report.startOdometer) + total : null };
}
export function reportPages(rows: DailyRow[]) {
  // The start reading occupies the first of 18 rows on page 1.
  const pages: { start: boolean; rows: DailyRow[] }[] = [{ start: true, rows: rows.slice(0, 17) }];
  for (let i = 17; i < rows.length; i += 18) pages.push({ start: false, rows: rows.slice(i, i + 18) });
  return pages;
}
// Use calendar arithmetic in UTC so the device's timezone cannot shift the selected service day.
export function dayOffset(day: string, valueDay: string) {
  const difference = (Date.parse(valueDay + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / 86400000;
  return Number.isFinite(difference) ? difference : 0;
}
export function timeOnDay(day: string, time: string, offset = 0) {
  if (!time) return '';
  if (!/^\d{2}:\d{2}$/.test(time) || !Number.isInteger(offset)) return '';
  const calendar = new Date(day + 'T00:00:00Z');
  calendar.setUTCDate(calendar.getUTCDate() + offset);
  return calendar.toISOString().slice(0,10) + 'T' + time;
}
// Short clocks follow the reference chronologically; 24:00–47:59 explicitly name the next day.
export function dutyEndTime(day: string, input: string, reference = '') {
  const clock = input.trim().replace(/[０-９]/g, n => String(n.charCodeAt(0) - 0xff10)).replace(/：/g, ':');
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock);
  if (!match || Number(match[1]) > 47 || Number(match[2]) > 59) return '';
  const hour = Number(match[1]);
  const time = String(hour % 24).padStart(2, '0') + ':' + match[2];
  if (hour >= 24) return timeOnDay(day, time, 1);
  const offset = reference ? dayOffset(day, reference.slice(0,10)) : 0;
  const value = timeOnDay(day, time, offset);
  return reference && value < reference ? timeOnDay(day, time, offset + 1) : value;
}
export function localDateTime(value: string) { return value ? localTime(value.length === 16 ? isoTime(value) : value).slice(0, 16) : ''; }
export function minuteLabel(value: string, day: string) { if (!value) return ''; const local = localTime(value.length === 16 ? isoTime(value) : value); return (local.slice(0, 10) !== day ? local.slice(5, 10) + ' ' : '') + local.slice(11, 16); }
export function minutes(start: string, end: string) { const n = (Date.parse(isoTime(end)) - Date.parse(isoTime(start))) / 60000; return Number.isFinite(n) && n >= 0 ? n : null; }
export function reportError(report: DailyReport, submitted = false) {
  if (!report.driverId || !report.vehicleId) return '乗務員と車両を選んでください。';
  if (report.rows.length > 1000) return '明細は1000件以内にしてください。';
  if (!submitted) return '';
  if (!report.startPlace.trim() || !report.startAt || !/^\d{1,7}$/.test(report.startOdometer)) return '出庫地点・実時刻・積算メーターを入力してください。';
  if (!report.rows.length) return '運行明細を入力してください。';
  let previous = report.startAt;
  for (const [i, row] of report.rows.entries()) {
    if (!row.startAt || !row.endAt || minutes(row.startAt, row.endAt) === null || minutes(previous, row.startAt) === null) return `${i + 1}行目の実時刻と前後の順序を確認してください。`;
    if (!row.from.trim() || !row.to.trim() || !/^\d{1,3}$/.test(row.meter)) return `${i + 1}行目の地点とメーター下3桁を入力してください。`;
    if (row.kind === 'passenger' && !/^[1-9]\d?$/.test(row.passengers)) return `${i + 1}行目の乗車人数を入力してください。`;
    previous = row.endAt;
  }
  if (meterSummary(report).total === null) return 'メーター下3桁を入力してください。';
  if ((report.dutyStart && minutes(report.dutyStart, report.startAt) === null) || (report.dutyEnd && minutes(previous, report.dutyEnd) === null)) return '勤務開始・終了と運行時刻の順序を確認してください。';
  return '';
}
export async function dailyRequest(query: string, body?: unknown) {
  const response = await fetch('/api/daily-reports' + query, { credentials: 'same-origin', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '日報を保存できません。接続を確認してください。');
  return result;
}
