import { useMemo, useState } from "react";
import {
  partnerLedger,
  type PartnerContact,
  type PartnerOffice,
  type PartnerRecord
} from "../data/partners";

interface PartnerEntry {
  partner: PartnerRecord;
  offices: PartnerOffice[];
  contacts: PartnerContact[];
}

const formatAddressLines = (
  postalCode: string,
  prefecture: string,
  city: string,
  addressLine1: string,
  addressLine2?: string
) => {
  const lines = [postalCode ? `〒${postalCode}` : undefined];
  const address = [prefecture, city, addressLine1].filter(Boolean).join("");
  if (address) {
    lines.push(address);
  }
  if (addressLine2) {
    lines.push(addressLine2);
  }
  return lines.filter((line): line is string => Boolean(line));
};

const renderMultiline = (value?: string) => {
  if (!value) {
    return <span className="text-slate-400">-</span>;
  }
  return value.split("\n").map((line, index) => (
    <div key={`${line}-${index}`} className="whitespace-pre-line">
      {line}
    </div>
  ));
};

const searchCandidatesFromPartner = (partner: PartnerRecord) => [
  partner.displayName,
  partner.officialName,
  partner.nameKana,
  partner.phone,
  partner.email
];

const searchCandidatesFromOffice = (office: PartnerOffice) => [
  office.displayName,
  office.officialName,
  office.nameKana,
  office.phone,
  office.email
];

const searchCandidatesFromContact = (contact: PartnerContact) => [
  contact.name,
  contact.nameKana,
  contact.phone,
  contact.email
];

export default function PartnerLedgerPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const entries = useMemo<PartnerEntry[]>(
    () =>
      partnerLedger.partners.map((partner) => ({
        partner,
        offices: partnerLedger.offices.filter((office) => office.partnerId === partner.id),
        contacts: partnerLedger.contacts.filter((contact) => contact.partnerId === partner.id)
      })),
    []
  );

  const officeLookup = useMemo(() => {
    const map = new Map<string, PartnerOffice>();
    partnerLedger.offices.forEach((office) => {
      map.set(office.id, office);
    });
    return map;
  }, []);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredEntries = useMemo(() => {
    if (!normalizedSearch) {
      return entries;
    }

    const includesTerm = (value?: string) =>
      value ? value.toLowerCase().includes(normalizedSearch) : false;

    return entries.filter(({ partner, offices, contacts }) => {
      const partnerMatches = searchCandidatesFromPartner(partner).some(includesTerm);
      const officeMatches = offices.some((office) =>
        searchCandidatesFromOffice(office).some(includesTerm)
      );
      const contactMatches = contacts.some((contact) =>
        searchCandidatesFromContact(contact).some(includesTerm)
      );
      return partnerMatches || officeMatches || contactMatches;
    });
  }, [entries, normalizedSearch]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">取引先</h2>
            <p className="mt-1 text-sm text-slate-500">
              ハイヤー/ディスパッチデスク向け取引先の基本情報と拠点・担当者を一元管理します。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900"
            >
              拠点を追加
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800"
            >
              担当者を追加
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <div className="relative w-full max-w-xl">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="表示名・正式名称・“よみ”・拠点名・担当者名・電話・メールで検索"
              className="w-full rounded-full border border-slate-300 bg-white px-4 py-2 pr-10 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
            <svg
              className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M12.9 14.32a8 8 0 111.414-1.414l3.387 3.386a1 1 0 01-1.414 1.415l-3.387-3.387zM14 8a6 6 0 11-12 0 6 6 0 0112 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <p className="text-xs text-slate-500">検索結果：{filteredEntries.length}件</p>
        </div>
      </div>

      <div className="space-y-8">
        {filteredEntries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            条件に合致する取引先が見つかりませんでした。検索条件を変更してください。
          </div>
        ) : (
          filteredEntries.map(({ partner, offices, contacts }) => {
            const partnerAddress = formatAddressLines(
              partner.postalCode,
              partner.prefecture,
              partner.city,
              partner.addressLine1,
              partner.addressLine2
            );

            return (
              <section
                key={partner.id}
                className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
              >
                <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/60 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="font-semibold">{partner.internalId}</span>
                      <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 font-medium text-slate-700">
                        {partner.category}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">{partner.hqName}</h3>
                    <p className="text-sm text-slate-500">表示名：{partner.displayName}</p>
                  </div>
                  <div className="flex flex-col items-start gap-2 text-xs text-slate-500 sm:items-end">
                    <div className="rounded-full bg-slate-900/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                      HQ
                    </div>
                    <div className="text-right">
                      <div>代表電話：{partner.phone}</div>
                      <div>代表メール：{partner.email}</div>
                      <div>当日連絡先：{partner.emergencyContact ?? "-"}</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-8 px-6 py-6">
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold tracking-wide text-slate-500">取引先（会社/HQ）</h4>
                    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          取引先ID（内部用）
                        </dt>
                        <dd className="mt-1 text-sm text-slate-900">{partner.internalId}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">区分</dt>
                        <dd className="mt-1 text-sm text-slate-900">{partner.category}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          表示名（優先表示）
                        </dt>
                        <dd className="mt-1 text-sm text-slate-900">{partner.displayName}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          正式名称（任意）
                        </dt>
                        <dd className="mt-1 text-sm text-slate-900">
                          {partner.officialName ?? <span className="text-slate-400">-</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          取引先名の“よみ”（任意）
                        </dt>
                        <dd className="mt-1 text-sm text-slate-900">
                          {partner.nameKana ?? <span className="text-slate-400">-</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          郵便番号・住所
                        </dt>
                        <dd className="mt-1 text-sm text-slate-900">
                          {partnerAddress.map((line) => (
                            <div key={line}>{line}</div>
                          ))}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          代表電話
                        </dt>
                        <dd className="mt-1 text-sm text-slate-900">{partner.phone}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          代表メール（依頼受付用）
                        </dt>
                        <dd className="mt-1 text-sm text-slate-900">{partner.email}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          当日連絡先（24h・任意）
                        </dt>
                        <dd className="mt-1 text-sm text-slate-900">
                          {partner.emergencyContact ?? <span className="text-slate-400">-</span>}
                        </dd>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-3">
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          備考
                        </dt>
                        <dd className="mt-1 text-sm text-slate-900">{renderMultiline(partner.notes)}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold tracking-wide text-slate-500">
                        拠点（営業所）
                      </h4>
                      <span className="text-xs text-slate-400">{offices.length} 拠点</span>
                    </div>
                    {offices.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                        登録された拠点はありません。
                      </div>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {offices.map((office) => {
                          const officeAddress = formatAddressLines(
                            office.postalCode,
                            office.prefecture,
                            office.city,
                            office.addressLine1,
                            office.addressLine2
                          );
                          return (
                            <div
                              key={office.id}
                              className="flex h-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                            >
                              <div className="space-y-1">
                                <div className="text-xs font-semibold text-slate-500">
                                  {office.internalId}
                                </div>
                                <h5 className="text-lg font-semibold text-slate-900">
                                  {office.displayName}
                                </h5>
                                <p className="text-xs text-slate-500">
                                  正式名称：{office.officialName ?? "-"}
                                </p>
                              </div>
                              <dl className="grid gap-y-3 text-sm">
                                <div>
                                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                    郵便番号・住所
                                  </dt>
                                  <dd className="mt-1 text-slate-900">
                                    {officeAddress.length > 0 ? (
                                      officeAddress.map((line) => <div key={line}>{line}</div>)
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </dd>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                      代表電話（拠点）
                                    </dt>
                                    <dd className="mt-1 text-slate-900">
                                      {office.phone ?? <span className="text-slate-400">-</span>}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                      メール（拠点）
                                    </dt>
                                    <dd className="mt-1 text-slate-900">
                                      {office.email ?? <span className="text-slate-400">-</span>}
                                    </dd>
                                  </div>
                                </div>
                                <div>
                                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                    当日連絡先（24h・任意）
                                  </dt>
                                  <dd className="mt-1 text-slate-900">
                                    {office.emergencyContact ?? <span className="text-slate-400">-</span>}
                                  </dd>
                                </div>
                                <div>
                                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                    備考
                                  </dt>
                                  <dd className="mt-1 text-slate-900">{renderMultiline(office.notes)}</dd>
                                </div>
                              </dl>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold tracking-wide text-slate-500">
                        担当者（HQ直下または拠点に紐付け）
                      </h4>
                      <span className="text-xs text-slate-400">{contacts.length} 名</span>
                    </div>
                    {contacts.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                        登録された担当者はありません。
                      </div>
                    ) : (
                      <div className="grid gap-4 lg:grid-cols-2">
                        {contacts.map((contact) => {
                          const affiliation =
                            contact.affiliationType === "office"
                              ? officeLookup.get(contact.affiliationId)?.displayName ?? "拠点未登録"
                              : partner.hqName;
                          return (
                            <div
                              key={contact.id}
                              className="flex h-full flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                            >
                              <div className="flex flex-col gap-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="text-xs font-semibold text-slate-500">
                                      {contact.internalId}
                                    </div>
                                    <h5 className="text-lg font-semibold text-slate-900">
                                      {contact.name}
                                    </h5>
                                    {contact.nameKana && (
                                      <p className="text-xs text-slate-500">{contact.nameKana}</p>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center justify-end gap-2">
                                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                                      {contact.role}
                                    </span>
                                    {contact.isPrimary && (
                                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                                        主担当
                                      </span>
                                    )}
                                    <span
                                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                        contact.onCall
                                          ? "bg-emerald-100 text-emerald-700"
                                          : "bg-slate-200 text-slate-600"
                                      }`}
                                    >
                                      当日連絡{contact.onCall ? "可" : "不可"}
                                    </span>
                                  </div>
                                </div>
                                <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
                                  <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                      所属タイプ
                                    </dt>
                                    <dd className="mt-1 text-slate-900">
                                      {contact.affiliationType === "partner" ? "取引先" : "拠点"}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                      所属ID（取引先ID または 拠点ID）
                                    </dt>
                                    <dd className="mt-1 text-slate-900">{contact.affiliationId}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                      所属名
                                    </dt>
                                    <dd className="mt-1 text-slate-900">{affiliation}</dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                      電話（直通・任意）
                                    </dt>
                                    <dd className="mt-1 text-slate-900">
                                      {contact.phone ?? <span className="text-slate-400">-</span>}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                      メール
                                    </dt>
                                    <dd className="mt-1 break-all text-slate-900">{contact.email}</dd>
                                  </div>
                                  <div className="sm:col-span-2">
                                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                      備考
                                    </dt>
                                    <dd className="mt-1 text-slate-900">{renderMultiline(contact.notes)}</dd>
                                  </div>
                                </dl>
                              </div>
                              <div className="flex items-center justify-end">
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                                >
                                  紐付け切替
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}
