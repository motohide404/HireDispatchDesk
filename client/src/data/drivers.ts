export type DriverDocumentType = "resume" | "medical" | "license" | "photo" | "other";

export type DriverDocument = {
  id: string;
  type: DriverDocumentType;
  name: string;
  uri?: string;
  uploadedAt: string;
  notes?: string;
};

export type DriverLedgerEntryStatus = "active" | "archived";

export type DriverLedgerEntry = {
  id: number;
  tenantId: string;
  officeId: string;
  code: string;
  name: string;
  nameKana: string;
  birthDate?: string;
  address?: string;
  phone?: string;
  email?: string;
  licenseClass: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  employmentType: string;
  lastMedicalCheckAt?: string;
  medicalNotes?: string;
  alcoholCheckMethod?: string;
  lastAlcoholCheckAt?: string;
  extUsageCountMonth: number;
  monthlyJobCount: number;
  currentDispatchNumber: number;
  status: DriverLedgerEntryStatus;
  documents: DriverDocument[];
  notes?: string;
};

const now = new Date();
const today = now.toISOString().slice(0, 10);

export const driverLedger: DriverLedgerEntry[] = [
  {
    id: 1,
    tenantId: "tenant-001",
    officeId: "tokyo-hq",
    code: "DRV-001",
    name: "田中 太郎",
    nameKana: "タナカ タロウ",
    birthDate: "1980-04-12",
    address: "東京都千代田区1-1-1",
    phone: "080-1234-5678",
    email: "tanaka@example.com",
    licenseClass: "第二種大型",
    licenseNumber: "A123456789",
    licenseExpiry: "2026-08-31",
    employmentType: "正社員",
    lastMedicalCheckAt: "2023-12-10",
    medicalNotes: "特記事項なし",
    alcoholCheckMethod: "アルコールチェッカー",
    lastAlcoholCheckAt: today,
    extUsageCountMonth: 2,
    monthlyJobCount: 38,
    currentDispatchNumber: 4,
    status: "active",
    documents: [
      {
        id: "doc-1",
        type: "resume",
        name: "履歴書（2020年更新）",
        uri: "https://example.com/docs/tanaka-resume.pdf",
        uploadedAt: "2020-03-01",
        notes: "原本は人事部で保管"
      },
      {
        id: "doc-2",
        type: "medical",
        name: "健康診断結果 2023",
        uploadedAt: "2023-12-15",
        notes: "異常なし"
      }
    ],
    notes: "VIP対応経験豊富。夜間送迎も対応可。"
  },
  {
    id: 2,
    tenantId: "tenant-001",
    officeId: "tokyo-hq",
    code: "DRV-002",
    name: "佐藤 花子",
    nameKana: "サトウ ハナコ",
    birthDate: "1985-11-05",
    address: "神奈川県横浜市2-3-4",
    phone: "080-8765-4321",
    email: "sato@example.com",
    licenseClass: "第二種中型",
    licenseNumber: "B987654321",
    licenseExpiry: "2025-05-20",
    employmentType: "嘱託",
    lastMedicalCheckAt: "2024-01-18",
    medicalNotes: "眼鏡使用",
    alcoholCheckMethod: "リモート点呼",
    lastAlcoholCheckAt: "2024-02-10",
    extUsageCountMonth: 0,
    monthlyJobCount: 42,
    currentDispatchNumber: 6,
    status: "active",
    documents: [
      {
        id: "doc-3",
        type: "license",
        name: "運転免許証写し",
        uploadedAt: "2024-01-05"
      },
      {
        id: "doc-4",
        type: "photo",
        name: "顔写真",
        uploadedAt: "2022-04-02"
      }
    ]
  },
  {
    id: 3,
    tenantId: "tenant-001",
    officeId: "narita",
    code: "DRV-003",
    name: "鈴木 次郎",
    nameKana: "スズキ ジロウ",
    birthDate: "1975-02-24",
    address: "千葉県成田市5-6-7",
    phone: "090-2222-3333",
    email: "suzuki@example.com",
    licenseClass: "大型二種",
    licenseNumber: "C555666777",
    licenseExpiry: "2024-11-15",
    employmentType: "業務委託",
    lastMedicalCheckAt: "2023-07-22",
    medicalNotes: "血圧要経過観察",
    alcoholCheckMethod: "対面点呼",
    lastAlcoholCheckAt: "2024-02-05",
    extUsageCountMonth: 6,
    monthlyJobCount: 35,
    currentDispatchNumber: 3,
    status: "active",
    documents: [
      {
        id: "doc-5",
        type: "other",
        name: "委託契約書",
        uploadedAt: "2021-01-10"
      }
    ],
    notes: "大型バス運行経験豊富。"
  },
  {
    id: 4,
    tenantId: "tenant-001",
    officeId: "tokyo-hq",
    code: "DRV-004",
    name: "高橋 三郎",
    nameKana: "タカハシ サブロウ",
    birthDate: "1968-09-18",
    address: "埼玉県さいたま市8-9-10",
    phone: "070-5555-6666",
    email: "takahashi@example.com",
    licenseClass: "第二種大型",
    licenseNumber: "D888999000",
    licenseExpiry: "2024-03-31",
    employmentType: "正社員",
    lastMedicalCheckAt: "2023-09-12",
    medicalNotes: "次回定期健診は3月予定",
    alcoholCheckMethod: "アルコールチェッカー",
    lastAlcoholCheckAt: "2024-02-08",
    extUsageCountMonth: 1,
    monthlyJobCount: 47,
    currentDispatchNumber: 5,
    status: "archived",
    documents: [
      {
        id: "doc-6",
        type: "resume",
        name: "履歴書",
        uploadedAt: "2018-06-01"
      }
    ],
    notes: "2024年1月末で退職。"
  },
  {
    id: 5,
    tenantId: "tenant-001",
    officeId: "osaka",
    code: "DRV-005",
    name: "山本 美咲",
    nameKana: "ヤマモト ミサキ",
    birthDate: "1990-07-03",
    address: "大阪府大阪市中央区2-4-1",
    phone: "080-2345-6789",
    email: "yamamoto@example.com",
    licenseClass: "第二種大型",
    licenseNumber: "E112233445",
    licenseExpiry: "2027-01-30",
    employmentType: "正社員",
    lastMedicalCheckAt: "2024-01-22",
    alcoholCheckMethod: "アルコールチェッカー",
    lastAlcoholCheckAt: today,
    extUsageCountMonth: 3,
    monthlyJobCount: 40,
    currentDispatchNumber: 2,
    status: "active",
    documents: [
      {
        id: "doc-7",
        type: "medical",
        name: "健康診断結果 2024",
        uploadedAt: "2024-01-23"
      }
    ],
    notes: "英語対応可。関西エリア得意。"
  },
  {
    id: 6,
    tenantId: "tenant-001",
    officeId: "tokyo-hq",
    code: "DRV-006",
    name: "伊藤 健",
    nameKana: "イトウ ケン",
    birthDate: "1988-02-14",
    address: "東京都世田谷区3-2-5",
    phone: "080-6789-1234",
    email: "ito@example.com",
    licenseClass: "第二種中型",
    licenseNumber: "F556677889",
    licenseExpiry: "2025-12-15",
    employmentType: "契約社員",
    lastMedicalCheckAt: "2023-11-30",
    alcoholCheckMethod: "リモート点呼",
    lastAlcoholCheckAt: "2024-02-07",
    extUsageCountMonth: 1,
    monthlyJobCount: 28,
    currentDispatchNumber: 1,
    status: "active",
    documents: [],
    notes: "早朝送迎に対応。"
  },
  {
    id: 7,
    tenantId: "tenant-001",
    officeId: "narita",
    code: "DRV-007",
    name: "小林 優",
    nameKana: "コバヤシ ユウ",
    birthDate: "1992-10-09",
    address: "千葉県船橋市7-8-2",
    phone: "070-1111-2222",
    email: "kobayashi@example.com",
    licenseClass: "大型二種",
    licenseNumber: "G991122334",
    licenseExpiry: "2026-04-01",
    employmentType: "業務委託",
    lastMedicalCheckAt: "2023-08-18",
    alcoholCheckMethod: "対面点呼",
    lastAlcoholCheckAt: "2024-02-06",
    extUsageCountMonth: 4,
    monthlyJobCount: 33,
    currentDispatchNumber: 3,
    status: "active",
    documents: [
      {
        id: "doc-8",
        type: "other",
        name: "委託契約書",
        uploadedAt: "2022-09-01"
      }
    ]
  },
  {
    id: 8,
    tenantId: "tenant-001",
    officeId: "sapporo",
    code: "DRV-008",
    name: "中村 杏奈",
    nameKana: "ナカムラ アンナ",
    birthDate: "1995-05-21",
    address: "北海道札幌市北区5-7-3",
    phone: "080-3210-5432",
    email: "nakamura@example.com",
    licenseClass: "第二種大型",
    licenseNumber: "H443322110",
    licenseExpiry: "2028-06-18",
    employmentType: "正社員",
    lastMedicalCheckAt: "2024-02-01",
    alcoholCheckMethod: "リモート点呼",
    lastAlcoholCheckAt: today,
    extUsageCountMonth: 0,
    monthlyJobCount: 25,
    currentDispatchNumber: 0,
    status: "active",
    documents: [
      {
        id: "doc-9",
        type: "license",
        name: "運転免許証写し",
        uploadedAt: "2023-12-20"
      }
    ]
  },
  {
    id: 9,
    tenantId: "tenant-001",
    officeId: "tokyo-hq",
    code: "DRV-009",
    name: "松本 修",
    nameKana: "マツモト オサム",
    birthDate: "1970-01-30",
    address: "東京都練馬区4-5-2",
    phone: "090-3333-4444",
    email: "matsumoto@example.com",
    licenseClass: "大型二種",
    licenseNumber: "I776655443",
    licenseExpiry: "2024-09-10",
    employmentType: "嘱託",
    lastMedicalCheckAt: "2023-10-05",
    medicalNotes: "次回検査要確認",
    alcoholCheckMethod: "対面点呼",
    lastAlcoholCheckAt: "2024-02-04",
    extUsageCountMonth: 2,
    monthlyJobCount: 19,
    currentDispatchNumber: 1,
    status: "active",
    documents: []
  },
  {
    id: 10,
    tenantId: "tenant-001",
    officeId: "osaka",
    code: "DRV-010",
    name: "大野 さくら",
    nameKana: "オオノ サクラ",
    birthDate: "1998-12-11",
    address: "大阪府堺市1-2-9",
    phone: "080-5555-4444",
    email: "ono@example.com",
    licenseClass: "第二種中型",
    licenseNumber: "J220033445",
    licenseExpiry: "2026-12-31",
    employmentType: "パート",
    lastMedicalCheckAt: "2023-12-02",
    alcoholCheckMethod: "リモート点呼",
    lastAlcoholCheckAt: "2024-02-03",
    extUsageCountMonth: 1,
    monthlyJobCount: 14,
    currentDispatchNumber: 0,
    status: "active",
    documents: [],
    notes: "週末メインで稼働。"
  },
  {
    id: 11,
    tenantId: "tenant-001",
    officeId: "tokyo-hq",
    code: "DRV-011",
    name: "藤田 海斗",
    nameKana: "フジタ カイト",
    birthDate: "1993-03-28",
    address: "東京都杉並区6-1-8",
    phone: "070-7777-6666",
    email: "fujita@example.com",
    licenseClass: "大型二種",
    licenseNumber: "K998877665",
    licenseExpiry: "2027-05-22",
    employmentType: "正社員",
    lastMedicalCheckAt: "2023-06-19",
    alcoholCheckMethod: "アルコールチェッカー",
    lastAlcoholCheckAt: today,
    extUsageCountMonth: 5,
    monthlyJobCount: 36,
    currentDispatchNumber: 4,
    status: "active",
    documents: [
      {
        id: "doc-10",
        type: "resume",
        name: "履歴書",
        uploadedAt: "2019-04-01"
      }
    ]
  },
  {
    id: 12,
    tenantId: "tenant-001",
    officeId: "narita",
    code: "DRV-012",
    name: "清水 麗",
    nameKana: "シミズ レイ",
    birthDate: "1982-06-06",
    address: "千葉県成田市7-2-5",
    phone: "080-9999-8888",
    email: "shimizu@example.com",
    licenseClass: "大型二種",
    licenseNumber: "L332211009",
    licenseExpiry: "2025-03-05",
    employmentType: "契約社員",
    lastMedicalCheckAt: "2023-05-11",
    alcoholCheckMethod: "対面点呼",
    lastAlcoholCheckAt: "2024-02-01",
    extUsageCountMonth: 3,
    monthlyJobCount: 22,
    currentDispatchNumber: 2,
    status: "active",
    documents: []
  },
  {
    id: 13,
    tenantId: "tenant-001",
    officeId: "tokyo-hq",
    code: "DRV-013",
    name: "森田 智子",
    nameKana: "モリタ トモコ",
    birthDate: "1978-08-15",
    address: "東京都文京区2-9-6",
    phone: "070-1212-3434",
    email: "morita@example.com",
    licenseClass: "大型二種",
    licenseNumber: "M554433221",
    licenseExpiry: "2024-04-28",
    employmentType: "嘱託",
    lastMedicalCheckAt: "2023-04-10",
    alcoholCheckMethod: "アルコールチェッカー",
    lastAlcoholCheckAt: "2024-01-31",
    extUsageCountMonth: 0,
    monthlyJobCount: 12,
    currentDispatchNumber: 0,
    status: "archived",
    documents: [],
    notes: "2024年3月で契約終了予定。"
  },
  {
    id: 14,
    tenantId: "tenant-001",
    officeId: "yokohama",
    code: "DRV-014",
    name: "長谷川 翔",
    nameKana: "ハセガワ ショウ",
    birthDate: "1987-09-17",
    address: "神奈川県横浜市西区3-4-9",
    phone: "080-4567-8901",
    email: "hasegawa@example.com",
    licenseClass: "第二種大型",
    licenseNumber: "N664455332",
    licenseExpiry: "2026-02-14",
    employmentType: "正社員",
    lastMedicalCheckAt: "2023-09-02",
    alcoholCheckMethod: "リモート点呼",
    lastAlcoholCheckAt: today,
    extUsageCountMonth: 2,
    monthlyJobCount: 30,
    currentDispatchNumber: 1,
    status: "active",
    documents: []
  },
  {
    id: 15,
    tenantId: "tenant-001",
    officeId: "tokyo-hq",
    code: "DRV-015",
    name: "石井 直樹",
    nameKana: "イシイ ナオキ",
    birthDate: "1973-12-02",
    address: "東京都大田区5-4-3",
    phone: "090-5555-7777",
    email: "ishii@example.com",
    licenseClass: "大型二種",
    licenseNumber: "P110099887",
    licenseExpiry: "2025-10-12",
    employmentType: "正社員",
    lastMedicalCheckAt: "2023-03-15",
    alcoholCheckMethod: "アルコールチェッカー",
    lastAlcoholCheckAt: "2024-01-25",
    extUsageCountMonth: 4,
    monthlyJobCount: 31,
    currentDispatchNumber: 2,
    status: "active",
    documents: [
      {
        id: "doc-11",
        type: "medical",
        name: "健康診断結果 2023",
        uploadedAt: "2023-03-16"
      }
    ]
  }
];

export type DriverLedgerInput = Omit<
  DriverLedgerEntry,
  "id" | "status" | "documents" | "extUsageCountMonth" | "monthlyJobCount" | "currentDispatchNumber"
> & {
  extUsageCountMonth?: number;
  monthlyJobCount?: number;
  currentDispatchNumber?: number;
  documents?: DriverDocument[];
};

export type DriverDocumentInput = Omit<DriverDocument, "id" | "uploadedAt"> & {
  uploadedAt?: string;
};
