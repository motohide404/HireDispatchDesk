import { appendCollectionAndSave, usePersistentState } from "./lib/store";
import { useEffect, useMemo, useRef, useState } from "react";
import VehicleDispatchBoardMock from "./components/VehicleDispatchBoardMock";
import VehicleLedgerPage from "./components/VehicleLedgerPage";
import DriverLedgerPage from "./components/DriverLedgerPage";
import PartnerLedgerPage from "./components/PartnerLedgerPage";
import JobEntryPage from "./components/JobEntryPage";
import DutyLogPage from "./components/DutyLogPage";
import { createJobRow, hasJobInput, type JobEntryRow, type NewWorkJob } from "./lib/jobEntry";
import { todayInJapan } from "./lib/ledger";
import { partnerLedger, type PartnerRecord, type PartnerOffice, type PartnerContact } from './data/partners';
import {
  driverLedger as initialDriverLedger,
  type DriverDocumentInput,
  type DriverLedgerInput
} from "./data/drivers";
import { createDispatchVehicles, vehicleLedger, vehicleMaintenanceRecords } from "./data/vehicles";

type ActivePage = "dispatch" | "jobs" | "duties" | "vehicles" | "drivers" | "partners" | "invoices";

type NavItem = {
  key: ActivePage;
  label: string;
  description: string;
};

const NAV_ITEMS: NavItem[] = [
  { key: 'duties', label: '点呼・出勤簿', description: '勤務ごとの出退勤と点呼を記録し、履歴を残します。' },
  {
    key: "dispatch",
    label: "配車ボード",
    description: "ジョブ・ドライバー・車両の配車状況を確認します。"
  },
  {
    key: "jobs",
    label: "仕事登録",
    description: "仕事を表形式でまとめて入力し、未配車の仕事に登録します。"
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
  },
  {
    key: "invoices",
    label: "請求書",
    description: "請求書作成画面（Excel風UI）を表示します。"
  }
];

export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>("dispatch");
  const [drivers, setDrivers] = usePersistentState("drivers", initialDriverLedger);
  const [vehicles, setVehicles] = usePersistentState("vehicles", vehicleLedger);
  const [partners] = usePersistentState<PartnerRecord[]>('partners', partnerLedger.partners);
  const [offices] = usePersistentState<PartnerOffice[]>('offices', partnerLedger.offices);
  const [contacts] = usePersistentState<PartnerContact[]>('contacts', partnerLedger.contacts);
  const customers = useMemo(() => ({ partners, offices, contacts }), [partners, offices, contacts]);
  const dispatchVehicles = useMemo(() => createDispatchVehicles(vehicles), [vehicles]);
  const [dispatchDate, setDispatchDate] = useState(todayInJapan);
  const [entryDate, setEntryDate] = useState(todayInJapan);
  const [jobRows, setJobRows] = useState<JobEntryRow[]>(() => Array.from({ length: 5 }, () => createJobRow(todayInJapan())));
  const [registeringJobs, setRegisteringJobs] = useState(false);
  const registrationLock = useRef(false);
  const hasDraftJobs = jobRows.some(hasJobInput);

  useEffect(() => {
    if (!hasDraftJobs) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ''; }
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [hasDraftJobs]);

  function openJobEntry() {
    setEntryDate(dispatchDate);
    setJobRows(previous => previous.map(row => hasJobInput(row) ? row : { ...row, values: { ...row.values, startDate: dispatchDate } }));
    setActivePage('jobs');
  }

  async function registerJobs(jobs: NewWorkJob[]) {
    if (registrationLock.current) throw new Error('仕事を登録中です。完了までお待ちください。');
    registrationLock.current = true; setRegisteringJobs(true);
    try { await appendCollectionAndSave('jobPool', jobs); }
    finally { registrationLock.current = false; setRegisteringJobs(false); }
  }

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
        onOpenJobEntry={openJobEntry}
        initialDate={dispatchDate}
        onDateChange={setDispatchDate}
      />
    );
  } else if (activePage === "jobs" || activePage === "duties") {
    pageContent = <></>;
  } else if (activePage === "vehicles") {
    pageContent = (
      <VehicleLedgerPage
        vehicles={vehicles}
        onAddVehicle={(vehicle) => setVehicles(previous => [...previous, { ...vehicle, id: Date.now() }])}
        onUpdateVehicleClass={(id, value) => setVehicles(previous => previous.map(vehicle => vehicle.id === id ? { ...vehicle, class: value } : vehicle))}
        maintenanceRecords={vehicleMaintenanceRecords}
      />
    );
  } else if (activePage === "partners") {
    pageContent = <PartnerLedgerPage />;
  } else if (activePage === "invoices") {
    pageContent = (
      <section className="mx-auto flex w-full max-w-6xl px-6 py-8">
        <div className="w-full rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-lg font-bold text-slate-900">請求書画面（準備中）</h2>
          <p className="mt-2 text-sm text-slate-600">
            次のアクションでExcelライクな請求書画面を作り込みます。
          </p>
        </div>
      </section>
    );
  } else {
    pageContent = (
      <DriverLedgerPage
        drivers={drivers}
        onAddDriver={handleAddDriver}
        onArchiveDriver={handleArchiveDriver}
        onRestoreDriver={handleRestoreDriver}
        onAddDocument={handleAddDriverDocument}
        onUpdateCompliance={(id, patch) => setDrivers(previous => previous.map(driver => driver.id === id ? { ...driver, ...patch } : driver))}
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
                  onClick={() => item.key === 'jobs' ? openJobEntry() : setActivePage(item.key)}
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
        <div hidden={activePage !== 'duties'}><DutyLogPage drivers={drivers} vehicles={vehicles} /></div>
        <div hidden={activePage !== 'jobs'}>
          <JobEntryPage rows={jobRows} onRowsChange={setJobRows} date={entryDate} onDateChange={setEntryDate}
            drivers={drivers} vehicles={vehicles} customers={customers} onRegister={registerJobs} registering={registeringJobs}
            onOpenDispatch={date => { if (date) setDispatchDate(date); setActivePage('dispatch'); }} />
        </div>
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
