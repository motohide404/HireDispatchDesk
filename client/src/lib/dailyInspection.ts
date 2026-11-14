// Passenger-car daily inspection only. No air/exhaust brakes or air tanks.
export const inspectionItems = [
  ['BR01', 'ブレーキペダルの踏みしろ・効き', false],
  ['BR02', 'ブレーキ液量', false],
  ['BR05', '駐車ブレーキ', false],
  ['TY01', 'タイヤの空気圧', false],
  ['TY02', 'タイヤの亀裂・損傷', false],
  ['TY03', 'タイヤの異常摩耗', false],
  ['TY04', 'タイヤの溝の深さ', true],
  ['BA01', 'バッテリー液量', true],
  ['EN01', '冷却水量', true],
  ['EN02', 'ファンベルトの張り・損傷', true],
  ['EN03', 'エンジンオイル量', true],
  ['EN04', '原動機の始動・異音', true],
  ['EN05', '低速・加速の状態', true],
  ['LI01', '灯火・方向指示器の点灯点滅、汚れ・損傷', false],
  ['WW01', 'ウォッシャー液量・噴射状態', true],
  ['WW02', 'ワイパーの拭き取り状態', true],
  ['PR01', '前回の運行で異常が認められた箇所', false],
] as const;
export type InspectionKey = typeof inspectionItems[number][0];
export const configurableItems: readonly InspectionKey[] = ['BA01', 'EN01', 'EN02', 'EN03'];
export type InspectionProfile = {
  id: string; vehicleId: number; vehicleLabel: string; at: string; staffId: string; staffName: string;
  basis: string; methods: string; excluded: Partial<Record<InspectionKey, string>>;
};
export type DailyInspection = {
  id: string; inspectionId: string; supersedes?: string; reason: string; recordedAt: string;
  at: string; vehicleId: number; vehicleLabel: string; driverId: number; driverName: string;
  profileId: string; odometer: number; results: Partial<Record<InspectionKey, 'ok' | 'defect'>>;
  notes: string; previousIssues: string;
};
export type InspectionReview = { id: string; inspectionId: string; at: string; staffId: string; staffName: string; decision: 'allow' | 'deny'; note: string };
export const emptyProfiles: InspectionProfile[] = [];
export const emptyInspections: DailyInspection[] = [];
export const emptyReviews: InspectionReview[] = [];
export function latestInspections(records: DailyInspection[]) {
  const replaced = new Set(records.map(row => row.supersedes));
  return records.filter(row => !replaced.has(row.id));
}
export function latestReview(record: DailyInspection, reviews: InspectionReview[]) {
  return reviews.filter(row => row.inspectionId === record.id).slice(-1)[0];
}
export function inspectionState(record: DailyInspection, reviews: InspectionReview[]) {
  const review = latestReview(record, reviews);
  return !review ? '整備管理者の確認待ち' : review.decision === 'allow' ? '運行可' : '運行不可';
}
export function inspectionCsv(records: DailyInspection[], profiles: InspectionProfile[], reviews: InspectionReview[]) {
  const cell = (value: unknown) => {
    let text = value == null ? '' : String(value);
    if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return '\ufeff' + [
    ['記録ID', '点検ID', '訂正元ID', '訂正理由', '点検日時', '車両', '実施者', '走行距離km', ...inspectionItems.map(row => row[1]), '前回異常の確認内容', '異常・措置内容', '判断', '確認者', '確認日時', '確認内容'],
    ...records.map(row => {
      const profile = profiles.find(item => item.id === row.profileId);
      const review = latestReview(row, reviews);
      return [row.id, row.inspectionId, row.supersedes, row.reason, row.at, row.vehicleLabel, row.driverName, row.odometer,
        ...inspectionItems.map(([key]) => profile?.excluded[key] ? `対象外：${profile.excluded[key]}` : row.results[key] === 'ok' ? '正常' : row.results[key] === 'defect' ? '異常' : '未確認'),
        row.previousIssues, row.notes, inspectionState(row, reviews), review?.staffName, review?.at, review?.note];
    }),
  ].map(row => row.map(cell).join(',')).join('\r\n');
}
