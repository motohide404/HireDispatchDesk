import { useEffect, useMemo, useState } from "react";
import {
  partnerLedger,
  type ContactAffiliationType,
  type PartnerCategory,
  type PartnerContact,
  type PartnerContactRole,
  type PartnerLedgerData,
  type PartnerOffice,
  type PartnerRecord
} from "../data/partners";

interface PartnerEntry {
  partner: PartnerRecord;
  offices: PartnerOffice[];
  contacts: PartnerContact[];
}

const PARTNER_CATEGORIES: PartnerCategory[] = [
  "旅行会社",
  "代理店",
  "法人",
  "その他"
];

const CONTACT_ROLES: PartnerContactRole[] = [
  "営業",
  "手配",
  "運行",
  "会計",
  "その他"
];

const AFFILIATION_TYPES: { value: ContactAffiliationType; label: string }[] = [
  { value: "partner", label: "取引先" },
  { value: "office", label: "拠点" }
];

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

interface PartnerDetailModalProps {
  entry: PartnerEntry;
  mode: "view" | "edit";
  onClose: () => void;
  onSave: (entry: PartnerEntry) => void;
}

function PartnerDetailModal({ entry, mode, onClose, onSave }: PartnerDetailModalProps) {
  const isEditing = mode === "edit";
  const [draft, setDraft] = useState<PartnerEntry>(() => ({
    partner: { ...entry.partner },
    offices: entry.offices.map((office) => ({ ...office })),
    contacts: entry.contacts.map((contact) => ({ ...contact }))
  }));

  useEffect(() => {
    setDraft({
      partner: { ...entry.partner },
      offices: entry.offices.map((office) => ({ ...office })),
      contacts: entry.contacts.map((contact) => ({ ...contact }))
    });
  }, [entry, mode]);

  const partnerAddress = formatAddressLines(
    draft.partner.postalCode,
    draft.partner.prefecture,
    draft.partner.city,
    draft.partner.addressLine1,
    draft.partner.addressLine2
  );

  const updatePartnerField = <K extends keyof PartnerRecord>(key: K, value: PartnerRecord[K]) => {
    setDraft((prev) => ({
      ...prev,
      partner: { ...prev.partner, [key]: value }
    }));
  };

  const updateOfficeField = <K extends keyof PartnerOffice>(
    officeId: string,
    key: K,
    value: PartnerOffice[K]
  ) => {
    setDraft((prev) => ({
      ...prev,
      offices: prev.offices.map((office) =>
        office.id === officeId ? { ...office, [key]: value } : office
      )
    }));
  };

  const updateContactField = <K extends keyof PartnerContact>(
    contactId: string,
    key: K,
    value: PartnerContact[K]
  ) => {
    setDraft((prev) => ({
      ...prev,
      contacts: prev.contacts.map((contact) =>
        contact.id === contactId ? { ...contact, [key]: value } : contact
      )
    }));
  };

  const handleSave = () => {
    onSave(draft);
    onClose();
  };

  const resolveContactAffiliationName = (contact: PartnerContact) => {
    if (contact.affiliationType === "partner") {
      return draft.partner.hqName;
    }
    return (
      draft.offices.find((office) => office.id === contact.affiliationId)?.displayName ?? "拠点未登録"
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold text-slate-500">{draft.partner.internalId}</p>
            <h3 className="text-xl font-bold text-slate-900">{draft.partner.displayName}</h3>
            <p className="text-sm text-slate-500">{draft.partner.hqName}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            >
              閉じる
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800"
              >
                保存
              </button>
            )}
          </div>
        </div>

        <div className="space-y-8 px-6 py-6">
          <section className="space-y-4">
            <h4 className="text-sm font-semibold tracking-wide text-slate-500">取引先（会社/HQ）</h4>
            <div className="grid gap-x-6 gap-y-5 md:grid-cols-2 lg:grid-cols-3">
              <DetailField
                label="取引先ID（内部用）"
                value={draft.partner.internalId}
                editing={isEditing}
                onChange={(value) => updatePartnerField("internalId", value)}
              />
              <DetailSelect
                label="区分"
                value={draft.partner.category}
                editing={isEditing}
                options={PARTNER_CATEGORIES.map((category) => ({ value: category, label: category }))}
                onChange={(value) => updatePartnerField("category", value as PartnerCategory)}
              />
              <DetailField
                label="表示名（優先表示）"
                value={draft.partner.displayName}
                editing={isEditing}
                onChange={(value) => updatePartnerField("displayName", value)}
              />
              <DetailField
                label="正式名称（任意）"
                value={draft.partner.officialName ?? ""}
                placeholder="-"
                editing={isEditing}
                onChange={(value) => updatePartnerField("officialName", value || undefined)}
              />
              <DetailField
                label="取引先名の“よみ”（任意）"
                value={draft.partner.nameKana ?? ""}
                placeholder="-"
                editing={isEditing}
                onChange={(value) => updatePartnerField("nameKana", value || undefined)}
              />
              <DetailField
                label="郵便番号"
                value={draft.partner.postalCode}
                editing={isEditing}
                onChange={(value) => updatePartnerField("postalCode", value)}
              />
              <DetailField
                label="都道府県"
                value={draft.partner.prefecture}
                editing={isEditing}
                onChange={(value) => updatePartnerField("prefecture", value)}
              />
              <DetailField
                label="市区町村"
                value={draft.partner.city}
                editing={isEditing}
                onChange={(value) => updatePartnerField("city", value)}
              />
              <DetailField
                label="番地・建物名"
                value={draft.partner.addressLine1}
                editing={isEditing}
                onChange={(value) => updatePartnerField("addressLine1", value)}
              />
              <DetailField
                label="建物名2（任意）"
                value={draft.partner.addressLine2 ?? ""}
                placeholder="-"
                editing={isEditing}
                onChange={(value) => updatePartnerField("addressLine2", value || undefined)}
              />
              <DetailField
                label="代表電話"
                value={draft.partner.phone}
                editing={isEditing}
                onChange={(value) => updatePartnerField("phone", value)}
              />
              <DetailField
                label="代表メール（依頼受付用）"
                value={draft.partner.email}
                editing={isEditing}
                onChange={(value) => updatePartnerField("email", value)}
              />
              <DetailField
                label="当日連絡先（24h・任意）"
                value={draft.partner.emergencyContact ?? ""}
                placeholder="-"
                editing={isEditing}
                onChange={(value) => updatePartnerField("emergencyContact", value || undefined)}
              />
              <DetailTextarea
                className="md:col-span-2 lg:col-span-3"
                label="備考"
                value={draft.partner.notes ?? ""}
                placeholder="-"
                editing={isEditing}
                onChange={(value) => updatePartnerField("notes", value || undefined)}
              />
              {!isEditing && (
                <div className="md:col-span-2 lg:col-span-3 text-sm text-slate-500">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">住所表示</div>
                  <div className="mt-1 text-slate-900">
                    {partnerAddress.length > 0 ? (
                      partnerAddress.map((line) => <div key={line}>{line}</div>)
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold tracking-wide text-slate-500">拠点（営業所）</h4>
              <span className="text-xs text-slate-400">{draft.offices.length} 拠点</span>
            </div>
            {draft.offices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                登録された拠点はありません。
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {draft.offices.map((office) => {
                  const officeAddress = formatAddressLines(
                    office.postalCode,
                    office.prefecture,
                    office.city,
                    office.addressLine1,
                    office.addressLine2
                  );
                  return (
                    <div key={office.id} className="flex h-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <DetailField
                        label="拠点ID（内部用）"
                        value={office.internalId}
                        editing={isEditing}
                        onChange={(value) => updateOfficeField(office.id, "internalId", value)}
                      />
                      <DetailField
                        label="取引先ID（親）"
                        value={office.partnerId}
                        editing={isEditing}
                        onChange={(value) => updateOfficeField(office.id, "partnerId", value)}
                      />
                      <DetailField
                        label="拠点名（表示名）"
                        value={office.displayName}
                        editing={isEditing}
                        onChange={(value) => updateOfficeField(office.id, "displayName", value)}
                      />
                      <DetailField
                        label="拠点名（正式・任意）"
                        value={office.officialName ?? ""}
                        placeholder="-"
                        editing={isEditing}
                        onChange={(value) => updateOfficeField(office.id, "officialName", value || undefined)}
                      />
                      <DetailField
                        label="拠点名の“よみ”（任意）"
                        value={office.nameKana ?? ""}
                        placeholder="-"
                        editing={isEditing}
                        onChange={(value) => updateOfficeField(office.id, "nameKana", value || undefined)}
                      />
                      <DetailField
                        label="郵便番号"
                        value={office.postalCode}
                        editing={isEditing}
                        onChange={(value) => updateOfficeField(office.id, "postalCode", value)}
                      />
                      <DetailField
                        label="都道府県"
                        value={office.prefecture}
                        editing={isEditing}
                        onChange={(value) => updateOfficeField(office.id, "prefecture", value)}
                      />
                      <DetailField
                        label="市区町村"
                        value={office.city}
                        editing={isEditing}
                        onChange={(value) => updateOfficeField(office.id, "city", value)}
                      />
                      <DetailField
                        label="番地・建物名"
                        value={office.addressLine1}
                        editing={isEditing}
                        onChange={(value) => updateOfficeField(office.id, "addressLine1", value)}
                      />
                      <DetailField
                        label="建物名2（任意）"
                        value={office.addressLine2 ?? ""}
                        placeholder="-"
                        editing={isEditing}
                        onChange={(value) => updateOfficeField(office.id, "addressLine2", value || undefined)}
                      />
                      <DetailField
                        label="代表電話（拠点）"
                        value={office.phone ?? ""}
                        placeholder="-"
                        editing={isEditing}
                        onChange={(value) => updateOfficeField(office.id, "phone", value || undefined)}
                      />
                      <DetailField
                        label="メール（拠点・任意）"
                        value={office.email ?? ""}
                        placeholder="-"
                        editing={isEditing}
                        onChange={(value) => updateOfficeField(office.id, "email", value || undefined)}
                      />
                      <DetailField
                        label="当日連絡先（24h・任意）"
                        value={office.emergencyContact ?? ""}
                        placeholder="-"
                        editing={isEditing}
                        onChange={(value) => updateOfficeField(office.id, "emergencyContact", value || undefined)}
                      />
                      <DetailTextarea
                        label="備考"
                        value={office.notes ?? ""}
                        placeholder="-"
                        editing={isEditing}
                        onChange={(value) => updateOfficeField(office.id, "notes", value || undefined)}
                      />
                      {!isEditing && (
                        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          住所表示
                          <div className="mt-1 text-sm text-slate-900">
                            {officeAddress.length > 0 ? (
                              officeAddress.map((line) => <div key={line}>{line}</div>)
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold tracking-wide text-slate-500">担当者（HQ直下または拠点に紐付け）</h4>
              <span className="text-xs text-slate-400">{draft.contacts.length} 名</span>
            </div>
            {draft.contacts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                登録された担当者はありません。
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {draft.contacts.map((contact) => (
                  <div key={contact.id} className="flex h-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <DetailField
                      label="担当者ID（内部用）"
                      value={contact.internalId}
                      editing={isEditing}
                      onChange={(value) => updateContactField(contact.id, "internalId", value)}
                    />
                <DetailSelect
                  label="所属タイプ"
                  value={contact.affiliationType}
                  editing={isEditing}
                  options={AFFILIATION_TYPES}
                  onChange={(value) =>
                    updateContactField(contact.id, "affiliationType", value as ContactAffiliationType)
                  }
                />
                <DetailField
                  label="所属ID（取引先ID または 拠点ID）"
                  value={contact.affiliationId}
                  editing={isEditing}
                  onChange={(value) => updateContactField(contact.id, "affiliationId", value)}
                />
                {!isEditing && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">所属名</span>
                    <span className="text-sm text-slate-900">{resolveContactAffiliationName(contact)}</span>
                  </div>
                )}
                <DetailField
                  label="担当者名"
                  value={contact.name}
                  editing={isEditing}
                  onChange={(value) => updateContactField(contact.id, "name", value)}
                    />
                    <DetailField
                      label="担当者名の“よみ”（任意）"
                      value={contact.nameKana ?? ""}
                      placeholder="-"
                      editing={isEditing}
                      onChange={(value) => updateContactField(contact.id, "nameKana", value || undefined)}
                    />
                    <DetailSelect
                      label="役割"
                      value={contact.role}
                      editing={isEditing}
                      options={CONTACT_ROLES.map((role) => ({ value: role, label: role }))}
                      onChange={(value) => updateContactField(contact.id, "role", value as PartnerContactRole)}
                    />
                    <DetailField
                      label="電話（直通・任意）"
                      value={contact.phone ?? ""}
                      placeholder="-"
                      editing={isEditing}
                      onChange={(value) => updateContactField(contact.id, "phone", value || undefined)}
                    />
                    <DetailField
                      label="メール"
                      value={contact.email}
                      editing={isEditing}
                      onChange={(value) => updateContactField(contact.id, "email", value)}
                    />
                    <DetailSelect
                      label="当日連絡可"
                      value={contact.onCall ? "はい" : "いいえ"}
                      editing={isEditing}
                      options={[
                        { value: "はい", label: "はい" },
                        { value: "いいえ", label: "いいえ" }
                      ]}
                      onChange={(value) => updateContactField(contact.id, "onCall", value === "はい")}
                    />
                    <DetailSelect
                      label="主担当"
                      value={contact.isPrimary ? "はい" : "いいえ"}
                      editing={isEditing}
                      options={[
                        { value: "はい", label: "はい" },
                        { value: "いいえ", label: "いいえ" }
                      ]}
                      onChange={(value) => updateContactField(contact.id, "isPrimary", value === "はい")}
                    />
                    <DetailTextarea
                      label="備考"
                      value={contact.notes ?? ""}
                      placeholder="-"
                      editing={isEditing}
                      onChange={(value) => updateContactField(contact.id, "notes", value || undefined)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

interface DetailFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  editing: boolean;
  className?: string;
  onChange: (value: string) => void;
}

function DetailField({ label, value, placeholder, editing, onChange, className }: DetailFieldProps) {
  if (editing) {
    return (
      <label className={`flex flex-col gap-1 ${className ?? ""}`}>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </label>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {value ? (
        <span className="text-sm text-slate-900">{value}</span>
      ) : (
        <span className="text-sm text-slate-400">{placeholder ?? "-"}</span>
      )}
    </div>
  );
}

interface DetailTextareaProps {
  label: string;
  value: string;
  placeholder?: string;
  editing: boolean;
  className?: string;
  onChange: (value: string) => void;
}

function DetailTextarea({ label, value, placeholder, editing, onChange, className }: DetailTextareaProps) {
  if (editing) {
    return (
      <label className={`flex flex-col gap-1 ${className ?? ""}`}>
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        />
      </label>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {value ? (
        <div className="text-sm text-slate-900">{renderMultiline(value)}</div>
      ) : (
        <span className="text-sm text-slate-400">{placeholder ?? "-"}</span>
      )}
    </div>
  );
}

interface DetailSelectOption {
  value: string;
  label: string;
}

interface DetailSelectProps {
  label: string;
  value: string;
  options: DetailSelectOption[];
  editing: boolean;
  onChange: (value: string) => void;
}

function DetailSelect({ label, value, options, editing, onChange }: DetailSelectProps) {
  const displayLabel = options.find((option) => option.value === value)?.label ?? value;

  if (editing) {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm text-slate-900">{displayLabel}</span>
    </div>
  );
}

function buildEntries(data: PartnerLedgerData): PartnerEntry[] {
  return data.partners.map((partner) => ({
    partner,
    offices: data.offices.filter((office) => office.partnerId === partner.id),
    contacts: data.contacts.filter((contact) => contact.partnerId === partner.id)
  }));
}

export default function PartnerLedgerPage() {
  const [partners, setPartners] = useState<PartnerRecord[]>(partnerLedger.partners);
  const [offices, setOffices] = useState<PartnerOffice[]>(partnerLedger.offices);
  const [contacts, setContacts] = useState<PartnerContact[]>(partnerLedger.contacts);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeEntry, setActiveEntry] = useState<PartnerEntry | null>(null);
  const [modalMode, setModalMode] = useState<"view" | "edit">("view");

  const data = useMemo<PartnerLedgerData>(
    () => ({ partners, offices, contacts }),
    [partners, offices, contacts]
  );

  const entries = useMemo(() => buildEntries(data), [data]);

  const officeLookup = useMemo(() => {
    const map = new Map<string, PartnerOffice>();
    offices.forEach((office) => {
      map.set(office.id, office);
    });
    return map;
  }, [offices]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredEntries = useMemo(() => {
    if (!normalizedSearch) {
      return entries;
    }

    const includesTerm = (value?: string) =>
      value ? value.toLowerCase().includes(normalizedSearch) : false;

    return entries.filter(({ partner, offices: partnerOffices, contacts: partnerContacts }) => {
      const partnerMatches = searchCandidatesFromPartner(partner).some(includesTerm);
      const officeMatches = partnerOffices.some((office) =>
        searchCandidatesFromOffice(office).some(includesTerm)
      );
      const contactMatches = partnerContacts.some((contact) =>
        searchCandidatesFromContact(contact).some(includesTerm)
      );
      return partnerMatches || officeMatches || contactMatches;
    });
  }, [entries, normalizedSearch]);

  const handleOpenDetail = (entry: PartnerEntry, mode: "view" | "edit") => {
    setActiveEntry(entry);
    setModalMode(mode);
  };

  const handleSaveEntry = (updated: PartnerEntry) => {
    setPartners((prev) =>
      prev.map((partner) =>
        partner.id === updated.partner.id ? { ...partner, ...updated.partner } : partner
      )
    );

    setOffices((prev) => {
      const remaining = prev.filter((office) => office.partnerId !== updated.partner.id);
      return [...remaining, ...updated.offices.map((office) => ({ ...office }))];
    });

    setContacts((prev) => {
      const remaining = prev.filter((contact) => contact.partnerId !== updated.partner.id);
      return [...remaining, ...updated.contacts.map((contact) => ({ ...contact }))];
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">取引先</h2>
            <p className="mt-1 text-sm text-slate-500">
              Excelライクな一覧で取引先情報を確認し、詳細表示や編集に切り替えられます。
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

      <div className="overflow-x-auto">
        <table className="min-w-full table-fixed divide-y divide-slate-200 border border-slate-200 bg-white text-left text-sm text-slate-900">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="whitespace-nowrap px-4 py-3">取引先ID（内部）</th>
              <th className="whitespace-nowrap px-4 py-3">表示名</th>
              <th className="whitespace-nowrap px-4 py-3">区分</th>
              <th className="whitespace-nowrap px-4 py-3">正式名称</th>
              <th className="whitespace-nowrap px-4 py-3">代表電話</th>
              <th className="whitespace-nowrap px-4 py-3">代表メール</th>
              <th className="whitespace-nowrap px-4 py-3">当日連絡</th>
              <th className="whitespace-nowrap px-4 py-3 text-center">拠点数</th>
              <th className="whitespace-nowrap px-4 py-3 text-center">担当者数</th>
              <th className="whitespace-nowrap px-4 py-3 text-center">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                  条件に合致する取引先が見つかりませんでした。検索条件を変更してください。
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr key={entry.partner.id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-600">
                    {entry.partner.internalId}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold">
                    <div className="flex flex-col">
                      <span>{entry.partner.displayName}</span>
                      <span className="text-xs text-slate-500">{entry.partner.hqName}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{entry.partner.category}</td>
                  <td className="px-4 py-3">
                    {entry.partner.officialName ?? <span className="text-slate-400">-</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {entry.partner.phone}
                  </td>
                  <td className="px-4 py-3">
                    <span className="break-all text-slate-700">{entry.partner.email}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {entry.partner.emergencyContact ?? <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-slate-600">
                    {entry.offices.length}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-slate-600">
                    {entry.contacts.length}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(entry, "view")}
                        className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                      >
                        詳細
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(entry, "edit")}
                        className="inline-flex items-center justify-center rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white shadow transition hover:bg-slate-800"
                      >
                        編集
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {activeEntry && (
        <PartnerDetailModal
          entry={activeEntry}
          mode={modalMode}
          onClose={() => setActiveEntry(null)}
          onSave={handleSaveEntry}
        />
      )}
    </div>
  );
}
