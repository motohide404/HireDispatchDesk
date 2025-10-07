import { useMemo, useState } from "react";
import VehicleDispatchBoardMock from "./components/VehicleDispatchBoardMock";
import VehicleLedgerPage from "./components/VehicleLedgerPage";
import { vehicleLedger, vehicleMaintenanceRecords } from "./data/vehicles";

type ActivePage = "dispatch" | "vehicles";

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
    key: "vehicles",
    label: "車両台帳",
    description: "登録車両の車検・点検・整備情報を一覧管理します。"
  }
];

export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>("dispatch");

  const activeDescription = useMemo(() => {
    return NAV_ITEMS.find((item) => item.key === activePage)?.description ?? "";
  }, [activePage]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hire Dispatch Desk</p>
            <h1 className="text-xl font-bold text-slate-900">
              {NAV_ITEMS.find((item) => item.key === activePage)?.label ?? ""}
            </h1>
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
        {activePage === "dispatch" ? (
          <VehicleDispatchBoardMock onOpenVehicleLedger={() => setActivePage("vehicles")} />
        ) : (
          <VehicleLedgerPage
            vehicles={vehicleLedger}
            maintenanceRecords={vehicleMaintenanceRecords}
            onBackToDispatch={() => setActivePage("dispatch")}
          />
        )}
      </main>
    </div>
  );
}
