import { isoTime, localTime } from './dutyLog';
export type DocumentKind = 'acceptance' | 'instruction';
export const documentNames = { acceptance: '運送引受書', instruction: '運行指示書' };
export const applicationMethods = { phone: '電話', visit: '来店', email: '電子メール', app: '配車アプリ', web: 'ウェブサイト', sns: 'SNS', other: 'その他' };
export const documentFields = [
  ['issuerName', '事業者の正式名称', 'text', 'both', true],
  ['officeName', '営業所名', 'text', 'both', true],
  ['issuerAddress', '事業者の住所', 'text', 'acceptance', true],
  ['issuerPhone', '事業者の電話番号・連絡先', 'text', 'both', true],
  ['emergencyContact', '緊急時の連絡先', 'text', 'acceptance', true],
  ['serviceArea', '営業区域', 'text', 'acceptance', true],
  ['applicantName', '申込者・契約相手の氏名又は名称', 'text', 'both', true],
  ['applicantContact', '申込者・契約相手の連絡先', 'text', 'both', true],
  ['methodDetail', 'アプリ・サイト・SNSの名称／その他の具体的方法', 'text', 'acceptance', false],
  ['operationStartPlace', '運行開始地点（車庫など・回送を含む）', 'text', 'both', true],
  ['operationStartAt', '運行開始日時', 'datetime-local', 'both', true],
  ['operationEndPlace', '運行終了地点（車庫など・回送を含む）', 'text', 'both', true],
  ['operationEndAt', '運行終了日時', 'datetime-local', 'both', true],
  ['boardingPlace', '旅客の乗車地点', 'text', 'both', true],
  ['boardingAt', '旅客の乗車日時', 'datetime-local', 'both', true],
  ['alightingPlace', '旅客の降車地点', 'text', 'both', true],
  ['alightingAt', '旅客の降車日時', 'datetime-local', 'both', true],
  ['fare', '運賃（税込・円）', 'money', 'acceptance', true],
  ['charge', '料金（税込・円、なければ0）', 'money', 'acceptance', true],
  ['chargeDetails', '料金の内訳', 'textarea', 'acceptance', false],
  ['priceBasis', '概算額の算出根拠', 'textarea', 'acceptance', false],
  ['route', '経路・立寄り地・待機場所', 'textarea', 'instruction', false],
  ['safetyInstructions', '注意箇所・安全確保のための指示事項', 'textarea', 'instruction', true],
  ['notes', 'その他の事項', 'textarea', 'both', false],
] as const;
export type DocumentField = typeof documentFields[number][0];
export type DocumentValues = Record<DocumentField, string> & { applicationMethod: string; priceStatus: 'fixed' | 'estimate'; timeStatus: 'planned' | 'confirmed' };
export type DocumentJob = { collection: 'bookings' | 'jobPool'; id: string; title: string; start: string; end: string; client: { name: string; phone?: string; email?: string }; driverId?: number | null; vehicleId?: number | null; amount?: number };
export type TransportDocument = {
  id: string; documentId: string; number: string; supersedes?: string; reason: string; voided: boolean;
  kind: DocumentKind; createdAt: string; source: Pick<DocumentJob, 'collection' | 'id' | 'title' | 'start' | 'end'>;
  issuerStaffId: string; issuerStaffName: string; driverId?: number; driverName?: string; vehicleId?: number; vehiclePlate?: string;
  values: DocumentValues;
};
export type DocumentEvent = { id: string; recordId: string; kind: 'delivery' | 'instruction'; at: string; staffId: string; staffName: string; recipient: string; method: string; note: string };
export const relevantFields = (kind: DocumentKind) => documentFields.filter(row => row[3] === 'both' || row[3] === kind);
export function newDocumentValues(job: DocumentJob, previous?: TransportDocument): DocumentValues {
  const values = Object.fromEntries(documentFields.map(([key]) => [key, ''])) as Record<DocumentField, string>;
  if (previous) for (const key of ['issuerName', 'officeName', 'issuerAddress', 'issuerPhone', 'emergencyContact', 'serviceArea'] as const) values[key] = previous.values[key];
  return { ...values, applicantName: job.client.name, applicantContact: [job.client.phone, job.client.email].filter(Boolean).join(' ／ '), boardingAt: localTime(job.start), alightingAt: localTime(job.end), applicationMethod: '', priceStatus: 'fixed', timeStatus: 'planned' };
}
export function savedValues(values: DocumentValues): DocumentValues {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, key.endsWith('At') ? isoTime(value) : value.trim()])) as DocumentValues;
}
export function editableValues(values: DocumentValues): DocumentValues {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, key.endsWith('At') ? localTime(value) : value])) as DocumentValues;
}
export function documentError(kind: DocumentKind, values: DocumentValues) {
  for (const [key, label, type, , required] of relevantFields(kind)) {
    const value = values[key];
    if (required && !value.trim()) return `${label}を入力してください。`;
    if (value.length > (type === 'textarea' ? 2000 : 200)) return `${label}が長すぎます。`;
  }
  if (kind === 'acceptance' && (!Object.prototype.hasOwnProperty.call(applicationMethods, values.applicationMethod) || (['app', 'web', 'sns', 'other'].includes(values.applicationMethod) && !values.methodDetail.trim()))) return '申込方法と、その名称・具体的方法を入力してください。';
  if (kind === 'acceptance' && (['fare', 'charge'] as const).some(key => !/^\d{1,10}$/.test(values[key]) || Number(values[key]) > 9999999999)) return '運賃・料金は税込の円単位で入力してください。';
  if (kind === 'acceptance' && values.priceStatus === 'estimate' && !values.priceBasis.trim()) return '概算額の算出根拠を入力してください。';
  const times = [values.operationStartAt, values.boardingAt, values.alightingAt, values.operationEndAt].map(value => Date.parse(value.length <= 19 ? isoTime(value) : value));
  if (times.some(value => !Number.isFinite(value)) || times.some((value, index) => index > 0 && value < times[index - 1]) || times[0] >= times[3]) return '運行開始→乗車→降車→運行終了の日時を確認してください。';
  return '';
}
export async function documentRequest(path: string, body?: unknown) {
  const response = await fetch('/api/transport-documents' + path, { credentials: 'same-origin', ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || '帳票を保存できません。接続を確認してください。');
  return value;
}
