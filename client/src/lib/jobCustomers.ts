import type { PartnerContact, PartnerLedgerData, PartnerOffice, PartnerRecord } from '../data/partners';

export type JobCustomerLink = { partnerId: string; officeId?: string; contactId?: string };
export type JobClient = {
  type: string; name: string; source?: 'ledger' | 'manual';
  partnerId?: string; officeId?: string; contactId?: string;
  officeName?: string; contactName?: string; phone?: string; email?: string;
};
export type CustomerRow = {
  id: string; values: Record<string, string>; customer?: JobCustomerLink;
  customerSnapshot?: Record<string, string>;
};
export const EMPTY_CUSTOMERS: PartnerLedgerData = { partners: [], offices: [], contacts: [] };
const clean = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
export const validContactPhone = (value: string) => /^\+?[\d\s().-]+$/.test(value) && value.replace(/\D/g, '').length >= 6 && value.replace(/\D/g, '').length <= 20;
export const validContactEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function matchingCustomers(name: string, ledger: PartnerLedgerData) {
  if (!name.trim()) return [];
  const value = clean(name);
  return ledger.partners.filter(partner => [partner.displayName, partner.officialName, partner.internalId, partner.id].some(alias => alias && clean(alias) === value));
}

export function customerRecords(link: JobCustomerLink, ledger: PartnerLedgerData): { partner: PartnerRecord; office?: PartnerOffice; contact?: PartnerContact } | undefined {
  const partner = ledger.partners.find(item => item.id === link.partnerId);
  const office = link.officeId ? ledger.offices.find(item => item.id === link.officeId && item.partnerId === link.partnerId) : undefined;
  const contact = link.contactId ? ledger.contacts.find(item => item.id === link.contactId && item.partnerId === link.partnerId
    && (link.officeId ? item.affiliationType === 'office' && item.affiliationId === link.officeId : item.affiliationType === 'partner' && item.affiliationId === link.partnerId)) : undefined;
  if (!partner || (link.officeId && !office) || (link.contactId && !contact)) return;
  return { partner, office, contact };
}

function defaults(link: JobCustomerLink, ledger: PartnerLedgerData) {
  const records = customerRecords(link, ledger);
  if (!records) return;
  const { partner, office, contact } = records;
  return { clientName: partner.displayName, clientType: partner.category, contactName: contact?.name ?? '',
    phone: contact?.phone || office?.phone || partner.phone || '', email: contact?.email || office?.email || partner.email || '' };
}

export function selectJobCustomer(row: CustomerRow, link: JobCustomerLink, ledger: PartnerLedgerData): CustomerRow {
  const values = defaults(link, ledger);
  if (!values) return row;
  return { ...row, customer: { ...link }, customerSnapshot: values, values: { ...row.values, ...values } };
}

export function unlinkJobCustomer(row: CustomerRow): CustomerRow {
  const { customer: _customer, customerSnapshot: _snapshot, ...remaining } = row;
  return { ...remaining, values: { ...row.values, clientName: '', clientType: '個人', contactName: '', phone: '', email: '' } };
}

// Drafts follow the ledger while keeping deliberate changes to this job's
// contact details. Saved jobs retain the contact snapshot used when booked.
export function resolveJobCustomer(row: CustomerRow, ledger: PartnerLedgerData): { row: CustomerRow; error?: string } {
  if (!row.customer) {
    const matches = matchingCustomers(row.values.clientName ?? '', ledger);
    if (matches.length > 1) return { row, error: '同じ名前の取引先があります。「台帳から選ぶ」で指定してください。' };
    if (matches.length === 1) {
      const selected = selectJobCustomer(row, { partnerId: matches[0].id }, ledger);
      // Pasted/manual contact details take precedence over ledger defaults.
      return { row: { ...selected, values: { ...selected.values,
        ...Object.fromEntries(['contactName', 'phone', 'email'].filter(key => row.values[key]?.trim()).map(key => [key, row.values[key]])) } } };
    }
    return { row };
  }
  const next = defaults(row.customer, ledger);
  if (!next) return { row, error: '選択した取引先・拠点・担当者が見つかりません。台帳から選び直してください。' };
  const values = { ...row.values };
  for (const [key, value] of Object.entries(next)) {
    if (key === 'clientName' || row.values[key] === row.customerSnapshot?.[key] || row.values[key] === undefined) values[key] = value;
  }
  return { row: { ...row, values, customerSnapshot: next } };
}

export function jobClient(row: CustomerRow, ledger: PartnerLedgerData): JobClient {
  const values = row.values;
  const records = row.customer ? customerRecords(row.customer, ledger) : undefined;
  return { type: values.clientType?.trim() || 'その他', name: values.clientName.trim(), source: row.customer ? 'ledger' : 'manual',
    ...(row.customer ?? {}), ...(records?.office ? { officeName: records.office.displayName } : {}),
    ...Object.fromEntries(['contactName', 'phone', 'email'].filter(key => values[key]?.trim()).map(key => [key, values[key].normalize('NFKC').trim()])) };
}
