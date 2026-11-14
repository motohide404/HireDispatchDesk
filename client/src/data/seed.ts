import { driverLedger } from './drivers';
import { vehicleLedger } from './vehicles';
import { partnerLedger } from './partners';

export const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
export function createSeed() {
  const day = today();
  return {
    drivers: driverLedger, vehicles: vehicleLedger,
    partners: partnerLedger.partners, offices: partnerLedger.offices,
    contacts: partnerLedger.contacts,
    officeOrder: Object.fromEntries(partnerLedger.partners.map(partner => [partner.id, partnerLedger.offices.filter(office => office.partnerId === partner.id).map(office => office.id)])),
    bookings: [{ id: Date.now(), vehicleId: 11, driverId: 1, client: { type: '法人', name: 'テスト顧客' }, title: 'テスト送迎', start: `${day}T09:00:00+09:00`, end: `${day}T10:00:00+09:00`, status: 'ok', is_overnight: false, amount: 12000, note: '動作確認用のサンプルです。' }],
    appDuties: [{ id: 'test-duty-1', vehicleId: 12, driverId: 2, service: 'GO', start: `${day}T13:00:00+09:00`, end: `${day}T15:00:00+09:00`, is_overnight: false, amount: 8000 }],
    jobPool: [{ id: 'test-job-1', title: 'テスト未配車案件', client: { type: '個人', name: 'テスト利用者' }, start: `${day}T16:00:00+09:00`, end: `${day}T17:00:00+09:00`, preferClass: 'sedan', vehicleId: null, driverId: null, amount: 10000, note: '車両へドラッグして配車できます。' }]
  };
}
