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
