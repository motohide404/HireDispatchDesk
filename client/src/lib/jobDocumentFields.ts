// Customer and journey inputs shared by work entry and transport documents.
export const customerTypes = ['法人', '個人'] as const;
export const applicationMethods = { phone: '電話', visit: '来店', email: '電子メール', app: '配車アプリ', web: 'ウェブサイト', sns: 'SNS', other: 'その他' };
export const sharedLabels = {
  clientName: '申込者・契約相手の氏名又は名称',
  clientType: '顧客区分', contactName: '連絡担当者', phone: '電話番号', email: 'メールアドレス',
  boardingPlace: '旅客の乗車地点', alightingPlace: '旅客の降車地点',
  applicationMethod: '申込方法', methodDetail: 'アプリ・サイト・SNSの名称／その他の具体的方法',
  note: 'その他の事項'
};
export type JobTransportDetails = Partial<Record<'boardingPlace' | 'alightingPlace' | 'applicationMethod' | 'methodDetail', string>>;

export function applicationMethodValue(value: string) {
  const text = value.normalize('NFKC').trim();
  return Object.entries(applicationMethods).find(([key, label]) => key === text || label === text)?.[0];
}
