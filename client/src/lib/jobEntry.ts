import type { DriverLedgerEntry } from '../data/drivers';
import { vehicleClassLabels, type VehicleLedgerVehicle } from '../data/vehicles';
import type { PartnerLedgerData } from '../data/partners';
import { EMPTY_CUSTOMERS, jobClient, resolveJobCustomer, unlinkJobCustomer, validContactEmail, validContactPhone, type CustomerRow, type JobClient } from './jobCustomers';

export type JobColumn = {
  key: string; label: string; kind: 'text' | 'date' | 'time' | 'amount' | 'class' | 'driver' | 'vehicle' | 'clientType' | 'memo';
  width: number; required?: boolean; maxLength?: number; extra?: boolean;
};

// Column order, paste mapping and presentation have one definition. Future
// optional columns can use extra:true; their values travel with the job.
export const JOB_COLUMNS: readonly JobColumn[] = [
  { key: 'title', label: '仕事名', kind: 'text', width: 240, required: true, maxLength: 200 },
  { key: 'clientName', label: '取引先・お客様名', kind: 'text', width: 280, required: true, maxLength: 200 },
  { key: 'clientType', label: '顧客区分', kind: 'clientType', width: 125, maxLength: 80 },
  { key: 'startDate', label: '利用日', kind: 'date', width: 145, required: true },
  { key: 'startTime', label: '開始', kind: 'time', width: 100, required: true },
  { key: 'endDate', label: '終了日', kind: 'date', width: 145 },
  { key: 'endTime', label: '終了', kind: 'time', width: 100, required: true },
  { key: 'preferClass', label: '希望車両区分', kind: 'class', width: 170, maxLength: 120 },
  { key: 'vehicle', label: '指定車両', kind: 'vehicle', width: 200 },
  { key: 'driver', label: '指定乗務員', kind: 'driver', width: 200 },
  { key: 'amount', label: '見積金額（税抜・円）', kind: 'amount', width: 175 },
  { key: 'note', label: 'メモ', kind: 'memo', width: 280, maxLength: 1000 },
  { key: 'contactName', label: '連絡担当者', kind: 'text', width: 180, maxLength: 120 },
  { key: 'phone', label: '電話番号', kind: 'text', width: 180, maxLength: 40 },
  { key: 'email', label: 'メールアドレス', kind: 'text', width: 260, maxLength: 254 }
];
export const MAX_JOB_ROWS = 200;
export type JobEntryRow = CustomerRow;
export type NewWorkJob = {
  id: string; title: string; client: JobClient; start: string; end: string;
  preferClass: string; vehicleId: number | null; driverId: number | null; amount?: number; note?: string;
  extraFields?: Record<string, string>;
};
export type JobRowResult = { row: JobEntryRow; index: number; errors: Record<string, string>; job?: NewWorkJob };

export function createJobRow(date: string): JobEntryRow {
  return { id: 'job-' + crypto.randomUUID(), values: { ...Object.fromEntries(JOB_COLUMNS.map(column => [column.key, ''])), startDate: date, clientType: '個人' } };
}
export function hasJobInput(row: JobEntryRow) {
  return Object.entries(row.values).some(([key, value]) => key !== 'startDate' && key !== 'clientType' && value.trim());
}
export function dateValue(raw: string): string | undefined {
  const value = raw.normalize('NFKC').trim().replace(/年|月/g, '-').replace(/日$/, '');
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  if (!match) return;
  const date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const timestamp = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date ? date : undefined;
}
export function timeValue(raw: string): string | undefined {
  const match = /^(\d{1,2}):(\d{2})(?::00)?$/.exec(raw.normalize('NFKC').trim());
  return match && +match[1] < 24 && +match[2] < 60 ? `${match[1].padStart(2, '0')}:${match[2]}` : undefined;
}
export function amountValue(raw: string): number | undefined {
  const value = raw.normalize('NFKC').trim().replace(/^¥\s*/, '').replace(/\s*円$/, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)) return;
  const number = Number(value.replace(/,/g, ''));
  return Number.isSafeInteger(number) && number <= 9999999999 ? number : undefined;
}
export function vehicleChoice(vehicle: VehicleLedgerVehicle) { return `${vehicle.name}（${vehicle.vehiclesId}）`; }
export function driverChoice(driver: DriverLedgerEntry) { return `${driver.name}（${driver.code}）`; }
const normalized = (text: string) => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
function reference(raw: string, choices: { id: number; matches: string[] }[]) {
  const value = normalized(raw);
  if (!value || ['未指定', '指定なし', '未定', '未配車'].includes(value)) return { id: null, valid: true };
  const matches = choices.filter(choice => choice.matches.some(label => normalized(label) === value));
  return { id: matches.length === 1 ? matches[0].id : null, valid: matches.length === 1 };
}

export function validateJobRows(rows: JobEntryRow[], drivers: DriverLedgerEntry[], vehicles: VehicleLedgerVehicle[], columns = JOB_COLUMNS, customers: PartnerLedgerData = EMPTY_CUSTOMERS): JobRowResult[] {
  return rows.flatMap((input, index) => {
    const resolved = resolveJobCustomer(input, customers);
    const row = resolved.row;
    if (!hasJobInput(row)) return [];
    const values = row.values;
    const errors: Record<string, string> = {};
    for (const column of columns) {
      const raw = values[column.key] ?? '';
      if (column.required && !raw.trim()) errors[column.key] = `${column.label}を入力してください。`;
      else if (column.maxLength && raw.length > column.maxLength) errors[column.key] = `${column.maxLength}文字以内で入力してください。`;
      else if (raw.trim() && column.kind === 'date' && !dateValue(raw)) errors[column.key] = '日付は2026/11/14の形式で入力してください。';
      else if (raw.trim() && column.kind === 'time' && !timeValue(raw)) errors[column.key] = '時刻は09:00の形式で入力してください。';
      else if (raw.trim() && column.kind === 'amount' && amountValue(raw) === undefined) errors[column.key] = '金額は0〜9,999,999,999円の整数で入力してください。';
    }
    if (resolved.error) errors.clientName = resolved.error;
    const phone = (values.phone ?? '').normalize('NFKC').trim();
    const email = (values.email ?? '').normalize('NFKC').trim();
    if (!phone && !email) {
      errors.phone = '連絡が取れる電話番号かメールアドレスを入力してください。';
      errors.email = errors.phone;
    }
    if (phone && !validContactPhone(phone)) errors.phone = '電話番号の形式を確認してください。';
    if (email && !validContactEmail(email)) errors.email = 'メールアドレスの形式を確認してください。';
    const startDate = dateValue(values.startDate ?? '');
    const endDate = values.endDate?.trim() ? dateValue(values.endDate) : startDate;
    const startTime = timeValue(values.startTime ?? '');
    const endTime = timeValue(values.endTime ?? '');
    const start = startDate && startTime ? `${startDate}T${startTime}:00+09:00` : '';
    const end = endDate && endTime ? `${endDate}T${endTime}:00+09:00` : '';
    if (start && end && Date.parse(end) <= Date.parse(start)) errors.endTime = '終了を開始より後にしてください。翌日終了なら終了日も入力してください。';
    const driver = reference(values.driver ?? '', drivers.filter(item => item.status === 'active').map(item => ({ id: item.id, matches: [String(item.id), item.code, item.name, driverChoice(item)] })));
    const vehicle = reference(values.vehicle ?? '', vehicles.map(item => ({ id: item.id, matches: [String(item.id), item.vehiclesId, item.name, item.plateNo, vehicleChoice(item)] })));
    if (!driver.valid) errors.driver = '在籍中の乗務員を、氏名・コードまたは候補から指定してください。';
    if (!vehicle.valid) errors.vehicle = '車両を、名称・管理IDまたは候補から指定してください。';
    if (Object.keys(errors).length) return [{ row, index, errors }];
    const rawClass = (values.preferClass ?? '').trim();
    const preferClass = Object.entries(vehicleClassLabels).find(([, label]) => label === rawClass)?.[0] ?? rawClass;
    const extras = Object.fromEntries(columns.filter(column => column.extra && values[column.key]?.trim()).map(column => [column.label, values[column.key].trim()]));
    const job: NewWorkJob = { id: row.id, title: values.title.trim(), client: jobClient(row, customers),
      start, end, preferClass: preferClass || '指定なし', vehicleId: vehicle.id, driverId: driver.id,
      ...(values.amount?.trim() ? { amount: amountValue(values.amount) } : {}),
      ...(values.note?.trim() ? { note: values.note.trim() } : {}),
      ...(Object.keys(extras).length ? { extraFields: extras } : {}) };
    return [{ row, index, errors, job }];
  });
}

export function parseSpreadsheet(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], value = '', quoted = false, closed = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === '"' && !value && !closed) quoted = true;
    else if (char === '\t') { row.push(value); value = ''; closed = false; }
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(value); rows.push(row); row = []; value = ''; closed = false;
    } else if (closed) {
      if (!/\s/.test(char)) throw new Error('貼り付ける範囲の引用符を確認してください。');
    } else value += char;
  }
  if (quoted) throw new Error('貼り付ける範囲の引用符が閉じられていません。');
  if (row.length || value || !rows.length) { row.push(value); rows.push(row); }
  return rows;
}

export function pasteJobCells(rows: JobEntryRow[], rowIndex: number, columnIndex: number, text: string, date: string, columns = JOB_COLUMNS) {
  let matrix = parseSpreadsheet(text);
  if (columnIndex === 0 && matrix[0]?.length === columns.length && columns.every((column, index) => matrix[0][index].replace(/[＊*]/g, '').trim() === column.label)) matrix = matrix.slice(1);
  if (!matrix.length) return rows;
  if (rowIndex + matrix.length > MAX_JOB_ROWS) throw new Error(`一度に入力できるのは${MAX_JOB_ROWS}行までです。貼り付ける範囲を分けてください。`);
  if (matrix.some(cells => columnIndex + cells.length > columns.length)) throw new Error('貼り付ける列数が表の範囲を超えています。見出しと列の順番を確認してください。');
  const result = rows.map(row => ({ ...row, values: { ...row.values } }));
  while (result.length < rowIndex + matrix.length) result.push(createJobRow(date));
  matrix.forEach((cells, offset) => {
    const nameIndex = columns.findIndex(column => column.key === 'clientName') - columnIndex;
    if (nameIndex >= 0 && nameIndex < cells.length && result[rowIndex + offset].customer && cells[nameIndex] !== result[rowIndex + offset].values.clientName) {
      result[rowIndex + offset] = unlinkJobCustomer(result[rowIndex + offset]);
    }
    cells.forEach((raw, cell) => {
    const column = columns[columnIndex + cell];
    const value = column.kind === 'date' ? dateValue(raw) ?? raw : column.kind === 'time' ? timeValue(raw) ?? raw : raw;
    result[rowIndex + offset].values[column.key] = value;
    });
  });
  return result;
}
