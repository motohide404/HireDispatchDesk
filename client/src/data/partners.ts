export type PartnerCategory = "旅行会社" | "代理店" | "法人" | "その他";

export interface PartnerRecord {
  id: string;
  internalId: string;
  hqName: string;
  displayName: string;
  officialName?: string;
  nameKana?: string;
  category: PartnerCategory;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2?: string;
  phone: string;
  email: string;
  emergencyContact?: string;
  notes?: string;
}

export interface PartnerOffice {
  id: string;
  internalId: string;
  partnerId: string;
  displayName: string;
  officialName?: string;
  nameKana?: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2?: string;
  phone?: string;
  email?: string;
  emergencyContact?: string;
  notes?: string;
}

export type ContactAffiliationType = "partner" | "office";

export type PartnerContactRole = "営業" | "手配" | "運行" | "会計" | "その他";

export interface PartnerContact {
  id: string;
  internalId: string;
  partnerId: string;
  affiliationType: ContactAffiliationType;
  affiliationId: string;
  name: string;
  nameKana?: string;
  role: PartnerContactRole;
  phone?: string;
  email: string;
  onCall: boolean;
  isPrimary: boolean;
  notes?: string;
}

export interface PartnerLedgerData {
  partners: PartnerRecord[];
  offices: PartnerOffice[];
  contacts: PartnerContact[];
}

export const partnerLedger: PartnerLedgerData = {
  partners: [
    {
      id: "partner-001",
      internalId: "TR-0001",
      hqName: "サンライズツアーズ 本社",
      displayName: "サンライズツアーズ",
      officialName: "株式会社サンライズツアーズ",
      nameKana: "さんらいずつあーず",
      category: "旅行会社",
      postalCode: "100-0001",
      prefecture: "東京都",
      city: "千代田区千代田",
      addressLine1: "1-1-1",
      addressLine2: "麹町ビル5F",
      phone: "03-1234-5678",
      email: "booking@sunrise-tours.jp",
      emergencyContact: "050-1234-0000",
      notes: "VIP顧客多数。請求は月末締め翌月末払い。"
    },
    {
      id: "partner-002",
      internalId: "TR-0018",
      hqName: "グローブリンク 本社",
      displayName: "グローブリンク",
      officialName: "グローブリンク合同会社",
      nameKana: "ぐろーぶりんく",
      category: "法人",
      postalCode: "530-0001",
      prefecture: "大阪府",
      city: "大阪市北区梅田",
      addressLine1: "2-4-9",
      addressLine2: "梅田スクエアタワー18F",
      phone: "06-9876-5432",
      email: "operations@globe-link.co.jp",
      emergencyContact: "080-2222-4444",
      notes: "シャトル運行の繁忙期は臨時便あり。支払サイト45日。"
    }
  ],
  offices: [
    {
      id: "office-001",
      internalId: "TR-0001-01",
      partnerId: "partner-001",
      displayName: "成田空港営業所",
      officialName: "サンライズツアーズ 成田空港営業所",
      nameKana: "なりたくうこうえいぎょうしょ",
      postalCode: "282-0004",
      prefecture: "千葉県",
      city: "成田市古込",
      addressLine1: "1-1 新東京国際空港内",
      phone: "0476-22-1111",
      email: "narita@sunrise-tours.jp",
      emergencyContact: "070-5555-1234",
      notes: "早朝便・深夜便の運用あり。"
    },
    {
      id: "office-002",
      internalId: "TR-0001-02",
      partnerId: "partner-001",
      displayName: "関西空港営業所",
      officialName: "サンライズツアーズ 関西空港営業所",
      postalCode: "549-0011",
      prefecture: "大阪府",
      city: "泉南郡田尻町",
      addressLine1: "泉州空港中1番地",
      phone: "072-455-0001",
      email: "kix@sunrise-tours.jp"
    },
    {
      id: "office-101",
      internalId: "TR-0018-01",
      partnerId: "partner-002",
      displayName: "グローブリンク 東京オフィス",
      officialName: "グローブリンク合同会社 東京支社",
      postalCode: "105-0001",
      prefecture: "東京都",
      city: "港区虎ノ門",
      addressLine1: "4-1-8 虎ノ門本社ビル7F",
      phone: "03-6789-1122",
      email: "tokyo@globe-link.co.jp",
      notes: "東京エリアの法人顧客担当。"
    }
  ],
  contacts: [
    {
      id: "contact-001",
      internalId: "TRC-001",
      partnerId: "partner-001",
      affiliationType: "partner",
      affiliationId: "partner-001",
      name: "佐藤 美咲",
      nameKana: "さとう みさき",
      role: "営業",
      phone: "03-1234-5679",
      email: "misaki.sato@sunrise-tours.jp",
      onCall: true,
      isPrimary: true,
      notes: "主要案件の窓口。契約更新・料金改定の調整も担当。"
    },
    {
      id: "contact-002",
      internalId: "TRC-002",
      partnerId: "partner-001",
      affiliationType: "office",
      affiliationId: "office-001",
      name: "田中 亮",
      nameKana: "たなか りょう",
      role: "運行",
      phone: "0476-22-2222",
      email: "ryo.tanaka@sunrise-tours.jp",
      onCall: true,
      isPrimary: false,
      notes: "成田空港営業所の当日運行管理者。深夜帯も対応。"
    },
    {
      id: "contact-003",
      internalId: "TRC-003",
      partnerId: "partner-001",
      affiliationType: "office",
      affiliationId: "office-002",
      name: "王 明華",
      nameKana: "おう めいか",
      role: "手配",
      email: "meika.oh@sunrise-tours.jp",
      onCall: false,
      isPrimary: false,
      notes: "関西空港営業所の手配担当。中国語案件に強み。"
    },
    {
      id: "contact-101",
      internalId: "TRC-101",
      partnerId: "partner-002",
      affiliationType: "partner",
      affiliationId: "partner-002",
      name: "中村 拓真",
      nameKana: "なかむら たくま",
      role: "運行",
      phone: "06-9876-5433",
      email: "takuma.nakamura@globe-link.co.jp",
      onCall: true,
      isPrimary: true,
      notes: "本社の運行管理責任者。大型案件の主担当。"
    },
    {
      id: "contact-102",
      internalId: "TRC-102",
      partnerId: "partner-002",
      affiliationType: "office",
      affiliationId: "office-101",
      name: "小林 彩",
      nameKana: "こばやし あや",
      role: "営業",
      phone: "03-6789-1133",
      email: "aya.kobayashi@globe-link.co.jp",
      onCall: false,
      isPrimary: false,
      notes: "東京オフィスの法人営業。見積・提案の一次窓口。"
    }
  ]
};
