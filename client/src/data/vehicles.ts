export type VehicleClass = "sedan" | "van" | "luxury" | "suv" | "minibus";
export type OwnerType = "自社" | "協力" | "レンタル";

export type VehicleLedgerVehicle = {
  id: number;
  vehiclesId: string;
  officeId: string;
  name: string;
  plateNo: string;
  vin: string;
  class: VehicleClass;
  seats: number;
  ownerType: OwnerType;
  shakenExpiry: string;
  inspection3mExpiry: string;
  maintenanceNotes?: string;
  appsSupported: {
    uber: boolean;
    go: boolean;
    diDi: boolean;
    nearMe: boolean;
  };
};

export type VehicleMaintenanceRecord = {
  id: string;
  vehicleId: number;
  type: "法定" | "任意" | "3ヶ月";
  performedAt: string;
  odometer: number;
  vendorId?: string;
  vendorName?: string;
  notes?: string;
  nextDueAt?: string;
};

export const vehicleLedger: VehicleLedgerVehicle[] = [
  {
    id: 11,
    vehiclesId: "VH-00011",
    officeId: "TOKYO-01",
    name: "セダンA",
    plateNo: "品川300 あ 12-34",
    vin: "JF1BT67C34G012345",
    class: "sedan",
    seats: 4,
    ownerType: "自社",
    shakenExpiry: "2025-02-28",
    inspection3mExpiry: "2024-06-15",
    maintenanceNotes: "スタッドレスタイヤ要交換（11月）",
    appsSupported: {
      uber: true,
      go: true,
      diDi: false,
      nearMe: true
    }
  },
  {
    id: 12,
    vehiclesId: "VH-00012",
    officeId: "TOKYO-01",
    name: "ワゴンB",
    plateNo: "品川300 い 56-78",
    vin: "JTMHU01J704020001",
    class: "van",
    seats: 7,
    ownerType: "自社",
    shakenExpiry: "2026-08-10",
    inspection3mExpiry: "2024-05-30",
    maintenanceNotes: "左側スライドドアローラーの摩耗確認中",
    appsSupported: {
      uber: true,
      go: false,
      diDi: true,
      nearMe: true
    }
  },
  {
    id: 13,
    vehiclesId: "VH-00013",
    officeId: "TOKYO-02",
    name: "ハイグレードC",
    plateNo: "品川300 う 90-12",
    vin: "JTHBK1GGXF2012345",
    class: "luxury",
    seats: 4,
    ownerType: "協力",
    shakenExpiry: "2024-11-22",
    inspection3mExpiry: "2024-07-05",
    maintenanceNotes: "内装リフレッシュ完了（2024/01）",
    appsSupported: {
      uber: false,
      go: true,
      diDi: true,
      nearMe: false
    }
  },
  {
    id: 14,
    vehiclesId: "VH-00014",
    officeId: "YOKOHAMA-01",
    name: "ワゴンD",
    plateNo: "品川300 え 34-56",
    vin: "5TDYK3DC7CS200789",
    class: "van",
    seats: 8,
    ownerType: "レンタル",
    shakenExpiry: "2025-05-18",
    inspection3mExpiry: "2024-08-20",
    maintenanceNotes: "ハイシーズン貸出用。返却後にコーティング予定",
    appsSupported: {
      uber: true,
      go: true,
      diDi: true,
      nearMe: true
    }
  }
];

export const vehicleMaintenanceRecords: VehicleMaintenanceRecord[] = [
  {
    id: "VM-202403-01",
    vehicleId: 11,
    type: "法定",
    performedAt: "2024-03-12",
    odometer: 52340,
    vendorId: "VN-001",
    vendorName: "東京整備センター",
    notes: "12ヶ月点検。エンジンオイル／フィルター交換、タイヤローテーション",
    nextDueAt: "2025-03-12"
  },
  {
    id: "VM-202402-02",
    vehicleId: 11,
    type: "3ヶ月",
    performedAt: "2024-02-05",
    odometer: 50880,
    vendorId: "VN-001",
    vendorName: "東京整備センター",
    notes: "ブレーキパッド残量チェック（フロント6mm、リア5mm）",
    nextDueAt: "2024-05-05"
  },
  {
    id: "VM-202401-05",
    vehicleId: 12,
    type: "任意",
    performedAt: "2024-01-18",
    odometer: 64210,
    vendorId: "VN-002",
    vendorName: "首都圏メンテリース",
    notes: "スライドドアローラー部グリスアップと点検",
    nextDueAt: "2024-07-18"
  },
  {
    id: "VM-202310-11",
    vehicleId: 12,
    type: "法定",
    performedAt: "2023-10-02",
    odometer: 58800,
    vendorId: "VN-003",
    vendorName: "品川オートワークス",
    notes: "車検整備一式。冷却水交換、エアコンフィルター交換",
    nextDueAt: "2025-10-02"
  },
  {
    id: "VM-202402-08",
    vehicleId: 13,
    type: "法定",
    performedAt: "2024-02-22",
    odometer: 35800,
    vendorId: "VN-004",
    vendorName: "ラグジュアリーガレージ東京",
    notes: "ショックアブソーバーブッシュ交換。内装クリーニング",
    nextDueAt: "2025-02-22"
  },
  {
    id: "VM-202401-09",
    vehicleId: 13,
    type: "任意",
    performedAt: "2024-01-11",
    odometer: 35220,
    vendorId: "VN-004",
    vendorName: "ラグジュアリーガレージ東京",
    notes: "冬用タイヤ交換、ホイールバランス調整",
    nextDueAt: "2024-12-01"
  },
  {
    id: "VM-202312-14",
    vehicleId: 14,
    type: "3ヶ月",
    performedAt: "2023-12-05",
    odometer: 41700,
    vendorId: "VN-005",
    vendorName: "横浜リース整備",
    notes: "定期点検。バッテリー比重点検、補充なし",
    nextDueAt: "2024-03-05"
  },
  {
    id: "VM-202309-03",
    vehicleId: 14,
    type: "法定",
    performedAt: "2023-09-17",
    odometer: 38950,
    vendorId: "VN-005",
    vendorName: "横浜リース整備",
    notes: "車検整備。ブレーキフルード交換、ワイパーブレード交換",
    nextDueAt: "2025-09-17"
  }
];

export const vehiclesForDispatch = vehicleLedger.map((vehicle) => ({
  id: vehicle.id,
  name: vehicle.name,
  plate: vehicle.plateNo,
  class: vehicle.class
}));

export type DispatchVehicle = (typeof vehiclesForDispatch)[number];
