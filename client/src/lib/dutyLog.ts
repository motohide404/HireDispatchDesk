export type RollCall = {
  inspectionRecordId?: string;
  schemaVersion?: 2; executorStaffId?: string; executorRole?: string; executorOffice?: string; location?: string;
  visualCheck?: 'yes' | 'no'; detectorCondition?: 'ok' | 'fault' | 'unchecked';
  vehicleReport?: string; roadReport?: string; operationReport?: string;
  handoverStatus?: 'none' | 'done' | 'not_done'; otherNotes?: string;
  at: string; executor: string; method: 'face' | 'phone' | 'other'; methodDetail: string;
  vehicleId: number; vehicleLabel: string; alcohol: 'none' | 'detected'; detectorUsed: 'yes' | 'no';
  alcoholValue?: number; health?: 'good' | 'concern'; fatigue?: 'none' | 'concern'; sleep?: 'enough' | 'insufficient';
  inspection?: 'ok' | 'concern' | 'not_done'; instructions: string; report: string; handover: string; response: string;
};

export type DutyLog = {
  recorderStaffId?: string;
  id: string; dutyId: string; supersedes?: string; recordedAt: string; recorder: string; reason: string;
  driverId: number; driverName: string; driverCode: string; dutyDate: string;
  clockIn: string; clockOut?: string; note: string; before?: RollCall; after?: RollCall; voided: boolean;
};

export const methodNames = { face: '対面', phone: '電話', other: 'その他' };
export const localTime = (value: string) => value ? new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
}).format(new Date(value)).replace(' ', 'T') : '';
export const localTimeSeconds = (value: string) => value ? `${localTime(value)}:${String(new Date(value).getUTCSeconds()).padStart(2, '0')}` : '';
export const isoTime = (value: string) => value ? `${value.length === 16 ? value + ':00' : value}+09:00` : '';
export const displayTime = (value?: string) => value ? localTime(value).replace('T', ' ') : '未記録';

export function latestDuties(records: DutyLog[]): DutyLog[] {
  const superseded = new Set(records.map(record => record.supersedes).filter(Boolean));
  return records.filter(record => !superseded.has(record.id)).sort((a, b) => a.clockIn.localeCompare(b.clockIn));
}

export function needsAttention(call?: RollCall) {
  return !!call && (call.alcohol === 'detected' || (call.alcoholValue ?? 0) > 0 || call.detectorUsed === 'no' || call.health === 'concern'
    || call.fatigue === 'concern' || call.sleep === 'insufficient' || call.inspection === 'concern' || call.inspection === 'not_done'
    || call.visualCheck === 'no' || call.detectorCondition === 'fault' || call.detectorCondition === 'unchecked' || call.handoverStatus === 'not_done');
}

export function dutyError(record: DutyLog, records: DutyLog[], now = Date.now()): string {
  if (!record.driverId || !record.driverName.trim()) return '運転者を選択してください。';
  if (!record.recorder.trim()) return '記録者名を入力してください。';
  if (record.supersedes && !record.reason.trim()) return '追記・訂正・取消の理由を入力してください。';
  if (!record.clockIn || !Number.isFinite(Date.parse(record.clockIn)) || localTime(record.clockIn).slice(0, 10) !== record.dutyDate) return '勤務日と出勤日時を確認してください。';
  if (Date.parse(record.clockIn) > now + 300000) return '出勤は実際に出勤した日時を入力してください。';
  if (record.clockOut && (!Number.isFinite(Date.parse(record.clockOut)) || Date.parse(record.clockOut) < Date.parse(record.clockIn) || Date.parse(record.clockOut) > now + 300000)) return '退勤日時は出勤以降・現在以前にしてください。';
  for (const phase of ['before', 'after'] as const) {
    const call = record[phase];
    if (!call) continue;
    if (!call.executor.trim() || !call.vehicleId) return '点呼執行者と車両を指定してください。';
    if (call.schemaVersion === 2) {
      if (!call.executorStaffId || !call.location?.trim()) return '点呼執行者と点呼場所を指定してください。';
      if (!call.visualCheck || !call.detectorCondition) return '目視・応答等の確認と検知器の状態を選択してください。';
      if (phase === 'before' && !call.instructions.trim()) return '安全運行の指示事項を記録してください。';
      if (phase === 'after' && (!call.vehicleReport?.trim() || !call.roadReport?.trim() || !call.operationReport?.trim() || !call.handoverStatus)) return '車両・道路・運行状況と交替運転者への通告を記録してください。';
      if (phase === 'after' && call.handoverStatus !== 'none' && !call.handover.trim()) return '交替運転者への通告内容・未通告の理由を記録してください。';
    }
    if (call.method !== 'face' && !call.methodDetail.trim()) return '対面以外の具体的方法・理由を記録してください。';
    const time = Date.parse(call.at);
    if (!Number.isFinite(time) || time < Date.parse(record.clockIn) || time > now + 300000
      || (record.clockOut && time > Date.parse(record.clockOut))) return '点呼日時は出勤から退勤の間・現在以前にしてください。';
    if (phase === 'after' && record.before && time < Date.parse(record.before.at)) return '乗務後点呼は乗務前点呼以降にしてください。';
    if (call.alcoholValue !== undefined && (!Number.isFinite(call.alcoholValue) || call.alcoholValue < 0 || call.alcoholValue > 10 || Number(call.alcoholValue.toFixed(3)) !== call.alcoholValue)) return '測定値は0〜10 mg/L、小数3桁以内で入力してください。';
    if (needsAttention(call) && !call.response.trim()) return '確認事項がある場合は、対応・指示内容を記録してください。';
  }
  if (!record.voided) {
    const end = record.clockOut ? Date.parse(record.clockOut) : Infinity;
    if (latestDuties(records).some(other => !other.voided && other.dutyId !== record.dutyId && other.driverId === record.driverId
      && Date.parse(record.clockIn) < (other.clockOut ? Date.parse(other.clockOut) : Infinity) && Date.parse(other.clockIn) < end)) {
      return '同じ運転者の勤務時間が重複しています。未退勤の勤務がないか確認してください。';
    }
  }
  return '';
}

function cell(value: unknown) {
  let text = value == null ? '' : String(value);
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function dutyCsv(records: DutyLog[], kind: 'attendance' | 'rollcall' | 'history') {
  const current = kind === 'history' ? records : latestDuties(records).filter(record => !record.voided);
  const headers = ['勤務ID', '記録ID', '訂正元ID', '勤務日', '運転者コード', '運転者', '出勤日時', '退勤日時', '記録者', '記録日時', '追記訂正理由', '取消', '勤務メモ'];
  const rows: unknown[][] = [];
  if (kind !== 'attendance') headers.push('点呼区分', '点呼日時', '点呼執行者', '車両', '方法', '具体的方法・理由', '酒気帯び', '検知器使用', '測定値mg/L', '疾病等', '疲労', '睡眠不足', '日常点検', '指示事項', '道路・運行状況の報告', '交替運転者への通告', '対応内容', '執行者職員ID', '執行者役割', '所属営業所', '点呼場所', '目視応答等の確認', '検知器状態', '車両の状況', '道路の状況', '運行の状況', '通告区分', 'その他必要事項', '日常点検記録ID');
  for (const record of current) {
    const base = [record.dutyId, record.id, record.supersedes, record.dutyDate, record.driverCode, record.driverName, displayTime(record.clockIn), record.clockOut ? displayTime(record.clockOut) : '', record.recorder, displayTime(record.recordedAt), record.reason, record.voided ? '取消' : '', record.note];
    if (kind === 'attendance') { rows.push(base); continue; }
    let added = false;
    for (const phase of ['before', 'after'] as const) {
      const call = record[phase]; if (!call) continue;
      rows.push([...base, phase === 'before' ? '乗務前' : '乗務後', displayTime(call.at), call.executor, call.vehicleLabel, methodNames[call.method], call.methodDetail,
        call.alcohol === 'none' ? '無' : '有', call.detectorUsed === 'yes' ? '使用' : '未使用', call.alcoholValue,
        call.health ? call.health === 'good' ? '問題なし' : '確認事項あり' : '', call.fatigue ? call.fatigue === 'none' ? 'なし' : 'あり' : '', call.sleep ? call.sleep === 'enough' ? 'なし' : 'あり' : '',
        call.inspection === 'ok' ? '実施・異常なし' : call.inspection === 'concern' ? '確認事項あり' : call.inspection === 'not_done' ? '未実施' : '', call.instructions, call.report, call.handover, call.response,
        call.executorStaffId, call.executorRole, call.executorOffice, call.location, call.visualCheck === 'yes' ? '確認' : call.visualCheck === 'no' ? '未確認' : '',
        call.detectorCondition === 'ok' ? '正常' : call.detectorCondition === 'fault' ? '故障' : call.detectorCondition === 'unchecked' ? '未確認' : '',
        call.vehicleReport, call.roadReport, call.operationReport, call.handoverStatus === 'none' ? '交替なし' : call.handoverStatus === 'done' ? '通告済' : call.handoverStatus === 'not_done' ? '未通告' : '', call.otherNotes, call.inspectionRecordId]);
      added = true;
    }
    if (!added && kind === 'history') rows.push(base);
  }
  return '\ufeff' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}
