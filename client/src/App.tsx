import { useMemo, useState } from "react";
import VehicleDispatchBoardMock from "./components/VehicleDispatchBoardMock";
import VehicleLedgerPage from "./components/VehicleLedgerPage";
import DriverLedgerPage from "./components/DriverLedgerPage";
import PartnerLedgerPage from "./components/PartnerLedgerPage";
import {
  driverLedger as initialDriverLedger,
  type DriverDocumentInput,
  type DriverLedgerInput
} from "./data/drivers";
import { createDispatchVehicles, vehicleLedger, vehicleMaintenanceRecords } from "./data/vehicles";

type ActivePage = "dispatch" | "vehicles" | "drivers" | "partners";

type NavItem = {
  key: ActivePage;
  label: string;
  description: string;
};

const NAV_ITEMS: NavItem[] = [
  {
    key: "dispatch",
    label: "配車ボード",
    description: "ジョブ・ドライバー・車両の配車状況を確認します。"
  },
  {
    key: "drivers",
    label: "運転者台帳",
    description: "ドライバーの資格・書類・点呼記録を管理します。"
  },
  {
    key: "vehicles",
    label: "車両台帳",
    description: "登録車両の車検・点検・整備情報を一覧管理します。"
  },
  {
    key: "partners",
    label: "取引先",
    description: "取引先・拠点・担当者の情報を管理します。"
  }
];

export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>("dispatch");
  const [drivers, setDrivers] = useState(initialDriverLedger);
  const dispatchVehicles = useMemo(() => createDispatchVehicles(vehicleLedger), []);

  const activeDescription = useMemo(() => {
    return NAV_ITEMS.find((item) => item.key === activePage)?.description ?? "";
  }, [activePage]);

  const handleAddDriver = (input: DriverLedgerInput) => {
    setDrivers((prev) => {
      const nextId = prev.reduce((max, driver) => Math.max(max, driver.id), 0) + 1;
      const timestamp = Date.now();
      const documents = (input.documents ?? []).map((doc, index) => ({
        id: `doc-${timestamp}-${index}`,
        type: doc.type,
        name: doc.name,
        uri: doc.uri,
        notes: doc.notes,
        uploadedAt: doc.uploadedAt ?? new Date().toISOString().slice(0, 10)
      }));
      return [
        ...prev,
        {
          id: nextId,
          tenantId: input.tenantId,
          officeId: input.officeId,
          code: input.code,
          name: input.name,
          nameKana: input.nameKana,
          birthDate: input.birthDate,
          address: input.address,
          phone: input.phone,
          email: input.email,
          licenseClass: input.licenseClass,
          licenseNumber: input.licenseNumber,
          licenseExpiry: input.licenseExpiry,
          employmentType: input.employmentType,
          lastMedicalCheckAt: input.lastMedicalCheckAt,
          medicalNotes: input.medicalNotes,
          alcoholCheckMethod: input.alcoholCheckMethod,
          lastAlcoholCheckAt: input.lastAlcoholCheckAt,
          extUsageCountMonth: input.extUsageCountMonth ?? 0,
          monthlyJobCount: input.monthlyJobCount ?? 0,
          currentDispatchNumber: input.currentDispatchNumber ?? 0,
          status: "active" as const,
          documents,
          notes: input.notes
        }
      ];
    });
  };

  const handleArchiveDriver = (id: number) => {
    setDrivers((prev) => prev.map((driver) => (driver.id === id ? { ...driver, status: "archived" } : driver)));
  };

  const handleRestoreDriver = (id: number) => {
    setDrivers((prev) => prev.map((driver) => (driver.id === id ? { ...driver, status: "active" } : driver)));
  };

  const handleAddDriverDocument = (driverId: number, document: DriverDocumentInput) => {
    setDrivers((prev) =>
      prev.map((driver) => {
        if (driver.id !== driverId) return driver;
        const newDocument = {
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: document.type,
          name: document.name,
          uri: document.uri,
          notes: document.notes,
          uploadedAt: document.uploadedAt ?? new Date().toISOString().slice(0, 10)
        };
        return { ...driver, documents: [...driver.documents, newDocument] };
      })
    );
  };

  const activeDriversForBoard = useMemo(
    () =>
      drivers
        .filter((driver) => driver.status === "active")
        .map((driver) => ({
          id: driver.id,
          name: driver.name,
          code: driver.code,
          extUsed: driver.extUsageCountMonth,
          monthlyJobs: driver.monthlyJobCount,
          currentDispatchNumber: driver.currentDispatchNumber
        })),
    [drivers]
  );

  let pageContent: JSX.Element;

  if (activePage === "dispatch") {
    pageContent = (
      <VehicleDispatchBoardMock
        drivers={activeDriversForBoard}
        vehicles={dispatchVehicles}
        onOpenDriverLedger={() => setActivePage("drivers")}
      />
    );
  } else if (activePage === "vehicles") {
    pageContent = (
      <VehicleLedgerPage
        vehicles={vehicleLedger}
        maintenanceRecords={vehicleMaintenanceRecords}
      />
    );
  } else if (activePage === "partners") {
    pageContent = <PartnerLedgerPage />;
  } else {
    pageContent = (
      <DriverLedgerPage
        drivers={drivers}
        onAddDriver={handleAddDriver}
        onArchiveDriver={handleArchiveDriver}
        onRestoreDriver={handleRestoreDriver}
        onAddDocument={handleAddDriverDocument}
        onBackToDispatch={() => setActivePage("dispatch")}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wide text-slate-900">HIRE DISPATCH DESK</h1>
            <p className="text-xs text-slate-500">{activeDescription}</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {NAV_ITEMS.map((item) => {
              const isActive = item.key === activePage;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActivePage(item.key)}
                  className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-slate-900 text-white shadow"
                      : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        {pageContent}
      </main>
      <footer className="border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto w-full max-w-6xl px-6 py-6">
          <p className="text-center text-sm font-semibold tracking-wide text-slate-600">
            ハイヤーディスパッチデスク
          </p>
        </div>
      </footer>
    </div>
  );
}
