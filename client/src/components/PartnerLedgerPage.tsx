import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
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

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}

function Modal({ title, description, onClose, children }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      <div
        className="relative w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
            {description ? (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
          >
            閉じる
          </button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

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

  const [partners, setPartners] = useState<PartnerRecord[]>(
    partnerLedger.partners
  );
  const [offices, setOffices] = useState<PartnerOffice[]>(
    partnerLedger.offices
  );
  const [contacts] = useState<PartnerContact[]>(partnerLedger.contacts);
  const [officeOrder, setOfficeOrder] = useState<Record<string, string[]>>(() => {
    const order: Record<string, string[]> = {};
    partnerLedger.partners.forEach((partner) => {
      order[partner.id] = partnerLedger.offices
        .filter((office) => office.partnerId === partner.id)
        .map((office) => office.id);
    });
    return order;
  });
  const [draggingOfficeId, setDraggingOfficeId] = useState<string | null>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [isDetailModalOpen, setDetailModalOpen] = useState(false);

  const partnerCategories: PartnerRecord["category"][] = [
    "旅行会社",
    "代理店",
    "法人",
    "その他"
  ];

  type PartnerFormState = {
    internalId: string;
    hqName: string;
    displayName: string;
    officialName: string;
    nameKana: string;
    category: PartnerRecord["category"];
    postalCode: string;
    prefecture: string;
    city: string;
    addressLine1: string;
    addressLine2: string;
    phone: string;
    fax: string;
    email: string;
    emergencyContact: string;
    notes: string;
  };

  const createInitialPartnerForm = (): PartnerFormState => ({
    internalId: "",
    hqName: "",
    displayName: "",
    officialName: "",
    nameKana: "",
    category: "旅行会社",
    postalCode: "",
    prefecture: "",
    city: "",
    addressLine1: "",
    addressLine2: "",
    phone: "",
    fax: "",
    email: "",
    emergencyContact: "",
    notes: ""
  });

  const [isPartnerModalOpen, setPartnerModalOpen] = useState(false);
  const [partnerForm, setPartnerForm] = useState<PartnerFormState>(
    createInitialPartnerForm
  );

  type OfficeFormState = {
    partnerId: string;
    internalId: string;
    displayName: string;
    officialName: string;
    nameKana: string;
    postalCode: string;
    prefecture: string;
    city: string;
    addressLine1: string;
    addressLine2: string;
    phone: string;
    email: string;
    emergencyContact: string;
    notes: string;
  };

  const createInitialOfficeForm = (partnerId?: string): OfficeFormState => ({
    partnerId: partnerId ?? partners[0]?.id ?? "",
    internalId: "",
    displayName: "",
    officialName: "",
    nameKana: "",
    postalCode: "",
    prefecture: "",
    city: "",
    addressLine1: "",
    addressLine2: "",
    phone: "",
    email: "",
    emergencyContact: "",
    notes: ""
  });

  const [isOfficeModalOpen, setOfficeModalOpen] = useState(false);
  const [officeForm, setOfficeForm] = useState<OfficeFormState>(
    createInitialOfficeForm
  );

  const entries = useMemo<PartnerEntry[]>(
    () =>
      partners.map((partner) => ({
        partner,
        offices: offices.filter((office) => office.partnerId === partner.id),
        contacts: contacts.filter((contact) => contact.partnerId === partner.id)
      })),
    [contacts, offices, partners]
  );

  const officeLookup = useMemo(() => {
    const map = new Map<string, PartnerOffice>();
    offices.forEach((office) => {
      map.set(office.id, office);
    });
    return map;
  }, [offices]);

  const getOrderedOffices = useCallback(
    (partnerId: string) => {
      const order = officeOrder[partnerId];
      const partnerOffices = offices.filter(
        (office) => office.partnerId === partnerId
      );
      if (!order) {
        return partnerOffices;
      }
      const orderMap = new Map(order.map((id, index) => [id, index]));
      return [...partnerOffices].sort((a, b) => {
        const aIndex = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bIndex = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aIndex - bIndex;
      });
    },
    [officeOrder, offices]
  );

  const openPartnerModal = () => {
    setPartnerForm(createInitialPartnerForm());
    setPartnerModalOpen(true);
  };

  const closePartnerModal = () => {
    setPartnerModalOpen(false);
  };

  const openPartnerDetail = (partnerId: string) => {
    setSelectedPartnerId(partnerId);
    setDetailModalOpen(true);
  };

  const closePartnerDetail = () => {
    setDetailModalOpen(false);
  };

  const handlePartnerFormChange = (
    field: keyof PartnerFormState,
    value: string
  ) => {
    setPartnerForm((previous) => ({
      ...previous,
      [field]: value
    }));
  };

  const handlePartnerSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!partnerForm.internalId || !partnerForm.hqName || !partnerForm.displayName) {
      return;
    }

    const id = `partner-${Date.now()}`;
    const newPartner: PartnerRecord = {
      id,
      internalId: partnerForm.internalId,
      hqName: partnerForm.hqName,
      displayName: partnerForm.displayName,
      officialName: partnerForm.officialName || undefined,
      nameKana: partnerForm.nameKana || undefined,
      category: partnerForm.category,
      postalCode: partnerForm.postalCode,
      prefecture: partnerForm.prefecture,
      city: partnerForm.city,
      addressLine1: partnerForm.addressLine1,
      addressLine2: partnerForm.addressLine2 || undefined,
      phone: partnerForm.phone,
      fax: partnerForm.fax || undefined,
      email: partnerForm.email,
      emergencyContact: partnerForm.emergencyContact || undefined,
      notes: partnerForm.notes || undefined
    };

    setPartners((previous) => [...previous, newPartner]);
    setOfficeOrder((previous) => ({
      ...previous,
      [id]: []
    }));
    closePartnerModal();
  };

  const openOfficeModal = (partnerId?: string) => {
    setOfficeForm(createInitialOfficeForm(partnerId));
    setOfficeModalOpen(true);
  };

  const closeOfficeModal = () => {
    setOfficeModalOpen(false);
  };

  const handleOfficeFormChange = (
    field: keyof OfficeFormState,
    value: string
  ) => {
    setOfficeForm((previous) => ({
      ...previous,
      [field]: value
    }));
  };

  const handleOfficeSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!officeForm.partnerId || !officeForm.internalId || !officeForm.displayName) {
      return;
    }

    const id = `office-${Date.now()}`;
    const newOffice: PartnerOffice = {
      id,
      partnerId: officeForm.partnerId,
      internalId: officeForm.internalId,
      displayName: officeForm.displayName,
      officialName: officeForm.officialName || undefined,
      nameKana: officeForm.nameKana || undefined,
      postalCode: officeForm.postalCode,
      prefecture: officeForm.prefecture,
      city: officeForm.city,
      addressLine1: officeForm.addressLine1,
      addressLine2: officeForm.addressLine2 || undefined,
      phone: officeForm.phone || undefined,
      email: officeForm.email || undefined,
      emergencyContact: officeForm.emergencyContact || undefined,
      notes: officeForm.notes || undefined
    };

    setOffices((previous) => [...previous, newOffice]);
    setOfficeOrder((previous) => {
      const existingOrder = previous[newOffice.partnerId]
        ? [...previous[newOffice.partnerId]]
        : [];
      return {
        ...previous,
        [newOffice.partnerId]: [...existingOrder, newOffice.id]
      };
    });
    closeOfficeModal();
  };

  const handleOfficeDragStart = (officeId: string) => {
    setDraggingOfficeId(officeId);
  };

  const handleOfficeDragEnd = () => {
    setDraggingOfficeId(null);
  };

  const handleOfficeDrop = (partnerId: string, targetOfficeId: string) => {
    if (!draggingOfficeId || draggingOfficeId === targetOfficeId) {
      return;
    }

    setOfficeOrder((previous) => {
      const fallbackOrder = offices
        .filter((office) => office.partnerId === partnerId)
        .map((office) => office.id);
      const existingOrder = previous[partnerId]
        ? [...previous[partnerId]]
        : fallbackOrder;
      if (
        !existingOrder.includes(draggingOfficeId) ||
        !existingOrder.includes(targetOfficeId)
      ) {
        return previous;
      }
      const filteredOrder = existingOrder.filter(
        (officeId) => officeId !== draggingOfficeId
      );
      const targetIndex = filteredOrder.indexOf(targetOfficeId);
      if (targetIndex === -1) {
        return previous;
      }
      filteredOrder.splice(targetIndex, 0, draggingOfficeId);
      return {
        ...previous,
        [partnerId]: filteredOrder
      };
    });
    setDraggingOfficeId(null);
  };

  const handleOfficeDropToEnd = (partnerId: string) => {
    if (!draggingOfficeId) {
      return;
    }

    setOfficeOrder((previous) => {
      const fallbackOrder = offices
        .filter((office) => office.partnerId === partnerId)
        .map((office) => office.id);
      const existingOrder = previous[partnerId]
        ? [...previous[partnerId]]
        : fallbackOrder;
      if (!existingOrder.includes(draggingOfficeId)) {
        return previous;
      }
      const filteredOrder = existingOrder.filter(
        (officeId) => officeId !== draggingOfficeId
      );
      filteredOrder.push(draggingOfficeId);
      return {
        ...previous,
        [partnerId]: filteredOrder
      };
    });
    setDraggingOfficeId(null);
  };

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

  useEffect(() => {
    if (filteredEntries.length === 0) {
      if (selectedPartnerId !== null) {
        setSelectedPartnerId(null);
      }
      if (isDetailModalOpen) {
        setDetailModalOpen(false);
      }
      return;
    }

    const exists = filteredEntries.some(
      ({ partner }) => partner.id === selectedPartnerId
    );

    if (!exists) {
      setSelectedPartnerId(filteredEntries[0].partner.id);
    }
  }, [filteredEntries, isDetailModalOpen, selectedPartnerId]);

  const selectedEntry =
    filteredEntries.find(({ partner }) => partner.id === selectedPartnerId) ??
    null;
  const orderedOffices = selectedEntry
    ? getOrderedOffices(selectedEntry.partner.id)
    : [];
  const selectedPartner = selectedEntry?.partner ?? null;
  const selectedContacts = selectedEntry?.contacts ?? [];
  const selectedPartnerAddress = selectedEntry
    ? [
        selectedEntry.partner.prefecture,
        selectedEntry.partner.city,
        selectedEntry.partner.addressLine1
      ]
        .filter(Boolean)
        .join("")
    : "";

  return (
    <>
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
              onClick={openPartnerModal}
              className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800"
            >
              取引先を追加
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

      <div className="space-y-6">
        {filteredEntries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
            条件に合致する取引先が見つかりませんでした。検索条件を変更してください。
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map(({ partner }) => {
              const partnerAddress = [
                partner.prefecture,
                partner.city,
                partner.addressLine1
              ]
                .filter(Boolean)
                .join("");
              const isSelected = partner.id === selectedPartnerId;
              return (
                <button
                  key={partner.id}
                  type="button"
                  onClick={() => openPartnerDetail(partner.id)}
                  className={`w-full rounded-2xl border px-5 py-4 text-left transition ${
                    isSelected
                      ? "border-slate-500 bg-white shadow-md ring-2 ring-slate-200"
                      : "border-slate-200 bg-white shadow-sm hover:border-slate-300 hover:shadow"
                  }`}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-semibold">{partner.internalId}</span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-700">
                        {partner.category}
                      </span>
                    </div>
                    <div>
                      <p className="text-base font-semibold text-slate-900">
                        {partner.displayName}
                      </p>
                      <p className="text-xs text-slate-500">正式名称：{partner.hqName}</p>
                    </div>
                    <div className="text-xs text-slate-600">
                      <div>
                        {partner.postalCode ? (
                          `〒${partner.postalCode}`
                        ) : (
                          <span className="text-slate-400">郵便番号未登録</span>
                        )}
                      </div>
                      <div>
                        {partnerAddress ? (
                          partnerAddress
                        ) : (
                          <span className="text-slate-400">住所未登録</span>
                        )}
                      </div>
                      <div>代表電話：{partner.phone}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {isDetailModalOpen && selectedPartner ? (
          <Modal
            title={selectedPartner.displayName}
            description="取引先詳細"
            onClose={closePartnerDetail}
          >
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-col gap-6 border-b border-slate-100 bg-slate-50/60 px-6 py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="font-semibold">{selectedPartner.internalId}</span>
                      <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 font-medium text-slate-700">
                        {selectedPartner.category}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">{selectedPartner.hqName}</h3>
                    <p className="text-sm text-slate-500">表示名：{selectedPartner.displayName}</p>
                  </div>
                  <div className="flex flex-col items-start gap-3 sm:items-end">
                    <div className="flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold uppercase text-white">
                        HQ
                      </div>
                      <span>本社</span>
                    </div>
                    <div className="text-right text-sm text-slate-600">
                      <div>代表電話：{selectedPartner.phone}</div>
                      <div>代表メール：{selectedPartner.email}</div>
                      <div>
                        当日連絡先：
                        {selectedPartner.emergencyContact ?? (
                          <span className="text-slate-400">-</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-slate-200 text-xs text-slate-600">
                  <thead className="bg-white/70 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="border border-slate-200 px-3 py-2 text-left font-medium">取引先ID</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-medium">区分</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-medium">HQ名称</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-medium">表示名</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-medium">正式名称</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-medium">よみ</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-medium">郵便番号</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-medium">住所</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-medium">建物名</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-medium">代表電話</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-medium">FAX</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-medium">代表メール</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-medium">当日連絡先</th>
                      <th className="border border-slate-200 px-3 py-2 text-left font-medium">備考</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
                      <td className="border border-slate-200 px-3 py-2 font-semibold text-slate-700">
                        {selectedPartner.internalId}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {selectedPartner.category}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {selectedPartner.hqName}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {selectedPartner.displayName}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {selectedPartner.officialName ?? (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {selectedPartner.nameKana ?? (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {selectedPartner.postalCode ? (
                          `〒${selectedPartner.postalCode}`
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {selectedPartnerAddress ? (
                          selectedPartnerAddress
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {selectedPartner.addressLine2 ? (
                          selectedPartner.addressLine2
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {selectedPartner.phone}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {selectedPartner.fax ? (
                          selectedPartner.fax
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {selectedPartner.email}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {selectedPartner.emergencyContact ?? (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="border border-slate-200 px-3 py-2 text-slate-700">
                        {renderMultiline(selectedPartner.notes)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>

              <div className="flex flex-col gap-8 px-6 py-6">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => openOfficeModal(selectedPartner.id)}
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900"
                >
                  拠点を追加
                </button>
              </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold tracking-wide text-slate-500">
                      拠点（営業所）
                    </h4>
                    <span className="text-xs text-slate-400">{orderedOffices.length} 拠点</span>
                  </div>
                  {orderedOffices.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      登録された拠点はありません。
                    </div>
                  ) : (
                    <div
                      className="grid gap-4 sm:grid-cols-2"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        handleOfficeDropToEnd(selectedPartner.id);
                      }}
                    >
                      {orderedOffices.map((office) => {
                      const officeAddress = [
                        office.prefecture,
                        office.city,
                        office.addressLine1
                      ]
                        .filter(Boolean)
                        .join("");
                      return (
                        <div
                          key={office.id}
                          draggable
                          onDragStart={() => handleOfficeDragStart(office.id)}
                          onDragEnd={handleOfficeDragEnd}
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            handleOfficeDrop(selectedPartner.id, office.id);
                          }}
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
                                郵便番号
                              </dt>
                              <dd className="mt-1 text-slate-900">
                                {office.postalCode ? (
                                  `〒${office.postalCode}`
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                住所
                              </dt>
                              <dd className="mt-1 text-slate-900">
                                {officeAddress ? (
                                  officeAddress
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                建物名
                              </dt>
                              <dd className="mt-1 text-slate-900">
                                {office.addressLine2 ?? (
                                  <span className="text-slate-400">-</span>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                電話
                              </dt>
                              <dd className="mt-1 text-slate-900">
                                {office.phone ?? (
                                  <span className="text-slate-400">-</span>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                メール
                              </dt>
                              <dd className="mt-1 text-slate-900">
                                {office.email ?? (
                                  <span className="text-slate-400">-</span>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                当日連絡先
                              </dt>
                              <dd className="mt-1 text-slate-900">
                                {office.emergencyContact ?? (
                                  <span className="text-slate-400">-</span>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                備考
                              </dt>
                              <dd className="mt-1 text-slate-900">
                                {renderMultiline(office.notes)}
                              </dd>
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
                      担当者
                    </h4>
                    <span className="text-xs text-slate-400">{selectedContacts.length} 名</span>
                  </div>
                  {selectedContacts.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      登録された担当者はありません。
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedContacts.map((contact) => {
                        const affiliation =
                          contact.affiliationType === "office"
                            ? officeLookup.get(contact.affiliationId)?.displayName ?? "-"
                            : selectedPartner.displayName;
                        return (
                          <div
                            key={contact.id}
                            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
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
                                {contact.nameKana ? (
                                  <p className="text-xs text-slate-500">{contact.nameKana}</p>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                                  {contact.role}
                                </span>
                                {contact.isPrimary ? (
                                  <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                                    主担当
                                  </span>
                                ) : null}
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
                        </div>
                      );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </Modal>
        ) : null}
      </div>
    </div>

      {isPartnerModalOpen ? (
        <Modal
          title="取引先を追加"
          description="Excelで整形したような横並びの情報構成と同じ項目を入力します。"
          onClose={closePartnerModal}
        >
          <form onSubmit={handlePartnerSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">取引先ID（内部用）</span>
                <input
                  type="text"
                  required
                  value={partnerForm.internalId}
                  onChange={(event) =>
                    handlePartnerFormChange("internalId", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">区分</span>
                <select
                  value={partnerForm.category}
                  onChange={(event) =>
                    handlePartnerFormChange(
                      "category",
                      event.target.value as PartnerFormState["category"]
                    )
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {partnerCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">HQ名称</span>
                <input
                  type="text"
                  required
                  value={partnerForm.hqName}
                  onChange={(event) =>
                    handlePartnerFormChange("hqName", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">表示名（優先表示）</span>
                <input
                  type="text"
                  required
                  value={partnerForm.displayName}
                  onChange={(event) =>
                    handlePartnerFormChange("displayName", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">正式名称（任意）</span>
                <input
                  type="text"
                  value={partnerForm.officialName}
                  onChange={(event) =>
                    handlePartnerFormChange("officialName", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">取引先名の“よみ”（任意）</span>
                <input
                  type="text"
                  value={partnerForm.nameKana}
                  onChange={(event) =>
                    handlePartnerFormChange("nameKana", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">郵便番号</span>
                <input
                  type="text"
                  required
                  value={partnerForm.postalCode}
                  onChange={(event) =>
                    handlePartnerFormChange("postalCode", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">都道府県</span>
                <input
                  type="text"
                  required
                  value={partnerForm.prefecture}
                  onChange={(event) =>
                    handlePartnerFormChange("prefecture", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">市区町村</span>
                <input
                  type="text"
                  required
                  value={partnerForm.city}
                  onChange={(event) =>
                    handlePartnerFormChange("city", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">住所（番地）</span>
                <input
                  type="text"
                  required
                  value={partnerForm.addressLine1}
                  onChange={(event) =>
                    handlePartnerFormChange("addressLine1", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">建物名</span>
                <input
                  type="text"
                  value={partnerForm.addressLine2}
                  onChange={(event) =>
                    handlePartnerFormChange("addressLine2", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">代表電話</span>
                <input
                  type="tel"
                  required
                  value={partnerForm.phone}
                  onChange={(event) =>
                    handlePartnerFormChange("phone", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">FAX</span>
                <input
                  type="tel"
                  value={partnerForm.fax}
                  onChange={(event) =>
                    handlePartnerFormChange("fax", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">代表メール（依頼受付用）</span>
                <input
                  type="email"
                  required
                  value={partnerForm.email}
                  onChange={(event) =>
                    handlePartnerFormChange("email", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">当日連絡先（24h・任意）</span>
                <input
                  type="tel"
                  value={partnerForm.emergencyContact}
                  onChange={(event) =>
                    handlePartnerFormChange(
                      "emergencyContact",
                      event.target.value
                    )
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span className="font-medium text-slate-800">備考</span>
              <textarea
                value={partnerForm.notes}
                onChange={(event) =>
                  handlePartnerFormChange("notes", event.target.value)
                }
                rows={4}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closePartnerModal}
                className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800"
              >
                取引先を追加
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {isOfficeModalOpen ? (
        <Modal
          title="拠点を追加"
          description="拠点カードに表示される項目と同じ内容を入力します。"
          onClose={closeOfficeModal}
        >
          <form onSubmit={handleOfficeSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">紐付ける取引先</span>
                <select
                  value={officeForm.partnerId}
                  onChange={(event) =>
                    handleOfficeFormChange("partnerId", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {partners.map((partner) => (
                    <option key={partner.id} value={partner.id}>
                      {partner.hqName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">拠点ID（内部用）</span>
                <input
                  type="text"
                  required
                  value={officeForm.internalId}
                  onChange={(event) =>
                    handleOfficeFormChange("internalId", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">表示名</span>
                <input
                  type="text"
                  required
                  value={officeForm.displayName}
                  onChange={(event) =>
                    handleOfficeFormChange("displayName", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">正式名称（任意）</span>
                <input
                  type="text"
                  value={officeForm.officialName}
                  onChange={(event) =>
                    handleOfficeFormChange("officialName", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">拠点名の“よみ”（任意）</span>
                <input
                  type="text"
                  value={officeForm.nameKana}
                  onChange={(event) =>
                    handleOfficeFormChange("nameKana", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">郵便番号</span>
                <input
                  type="text"
                  value={officeForm.postalCode}
                  onChange={(event) =>
                    handleOfficeFormChange("postalCode", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">都道府県</span>
                <input
                  type="text"
                  value={officeForm.prefecture}
                  onChange={(event) =>
                    handleOfficeFormChange("prefecture", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">市区町村</span>
                <input
                  type="text"
                  value={officeForm.city}
                  onChange={(event) =>
                    handleOfficeFormChange("city", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">住所（番地）</span>
                <input
                  type="text"
                  value={officeForm.addressLine1}
                  onChange={(event) =>
                    handleOfficeFormChange("addressLine1", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">建物名</span>
                <input
                  type="text"
                  value={officeForm.addressLine2}
                  onChange={(event) =>
                    handleOfficeFormChange("addressLine2", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">代表電話（拠点）</span>
                <input
                  type="tel"
                  value={officeForm.phone}
                  onChange={(event) =>
                    handleOfficeFormChange("phone", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">メール（拠点）</span>
                <input
                  type="email"
                  value={officeForm.email}
                  onChange={(event) =>
                    handleOfficeFormChange("email", event.target.value)
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                <span className="font-medium text-slate-800">当日連絡先（24h・任意）</span>
                <input
                  type="tel"
                  value={officeForm.emergencyContact}
                  onChange={(event) =>
                    handleOfficeFormChange(
                      "emergencyContact",
                      event.target.value
                    )
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              <span className="font-medium text-slate-800">備考</span>
              <textarea
                value={officeForm.notes}
                onChange={(event) =>
                  handleOfficeFormChange("notes", event.target.value)
                }
                rows={4}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeOfficeModal}
                className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-800"
              >
                拠点を追加
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
