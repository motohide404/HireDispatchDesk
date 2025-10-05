import type { MouseEventHandler } from "react";

type Tab = "home" | "booking" | "dispatch";

type NavbarProps = {
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
};

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "booking", label: "Booking" },
  { id: "dispatch", label: "Dispatch" }
];

const merge = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

const handleClick = (
  tab: Tab,
  onNavigate: (tab: Tab) => void
): MouseEventHandler<HTMLButtonElement> =>
  (event) => {
    event.preventDefault();
    onNavigate(tab);
  };

const Navbar = ({ activeTab, onNavigate }: NavbarProps) => {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <button
          type="button"
          onClick={handleClick("home", onNavigate)}
          className="text-lg font-semibold text-slate-800 transition hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Hire Dispatch Desk
        </button>
        <nav className="flex items-center gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={handleClick(tab.id, onNavigate)}
              className={merge(
                "rounded-full px-4 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                activeTab === tab.id
                  ? "bg-slate-900 text-white focus-visible:outline-slate-900"
                  : "text-slate-600 hover:text-slate-900 focus-visible:outline-slate-400"
              )}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default Navbar;
