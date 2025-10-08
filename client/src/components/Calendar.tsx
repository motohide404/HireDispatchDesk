import { useEffect, useMemo, useState } from "react";

type CalendarProps = {
  value?: string;
  onSelect: (value: string) => void;
  onClose?: () => void;
};

type CalendarDay = {
  iso: string;
  label: number;
  inCurrentMonth: boolean;
  isToday: boolean;
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

function toDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toIso(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export default function Calendar({ value, onSelect, onClose }: CalendarProps) {
  const todayIso = useMemo(() => toIso(new Date()), []);
  const selectedDate = useMemo(() => toDate(value), [value]);
  const [monthDate, setMonthDate] = useState(() => {
    const base = toDate(value) ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  useEffect(() => {
    const parsed = toDate(value);
    if (!parsed) return;
    if (
      monthDate.getFullYear() !== parsed.getFullYear() ||
      monthDate.getMonth() !== parsed.getMonth()
    ) {
      setMonthDate(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
    }
  }, [value, monthDate]);

  const weeks = useMemo(() => {
    const start = new Date(monthDate);
    const startDay = start.getDay();
    start.setDate(start.getDate() - startDay);
    const matrix: CalendarDay[][] = [];
    const cursor = new Date(start);
    for (let week = 0; week < 6; week += 1) {
      const days: CalendarDay[] = [];
      for (let day = 0; day < 7; day += 1) {
        const iso = toIso(cursor);
        days.push({
          iso,
          label: cursor.getDate(),
          inCurrentMonth: cursor.getMonth() === monthDate.getMonth(),
          isToday: iso === todayIso
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      matrix.push(days);
    }
    return matrix;
  }, [monthDate, todayIso]);

  const monthLabel = useMemo(
    () => `${monthDate.getFullYear()}年${monthDate.getMonth() + 1}月`,
    [monthDate]
  );

  const handlePrevMonth = () => {
    setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleSelectToday = () => {
    const today = new Date();
    const iso = toIso(today);
    setMonthDate(new Date(today.getFullYear(), today.getMonth(), 1));
    onSelect(iso);
    onClose?.();
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100"
          aria-label="前の月"
        >
          ◀
        </button>
        <div className="flex flex-col items-center">
          <span className="text-sm font-semibold text-slate-600">{monthLabel}</span>
          {selectedDate ? (
            <span className="text-xs text-slate-400">
              選択: {selectedDate.getMonth() + 1}月{selectedDate.getDate()}日
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={handleNextMonth}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-700 hover:bg-slate-100"
          aria-label="次の月"
        >
          ▶
        </button>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
        {WEEKDAYS.map((label) => (
          <div key={label}>{label}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((day, index) => {
          const isSelected = selectedDate ? day.iso === toIso(selectedDate) : false;
          return (
            <button
              key={`${day.iso}-${index}`}
              type="button"
              onClick={() => {
                onSelect(day.iso);
                onClose?.();
              }}
              className={`flex h-10 items-center justify-center rounded-full text-sm transition ${
                day.inCurrentMonth ? "text-slate-800" : "text-slate-400"
              } ${
                isSelected
                  ? "bg-slate-900 font-semibold text-white shadow"
                  : day.isToday
                    ? "border border-slate-300 bg-slate-100 font-medium"
                    : "hover:bg-slate-100"
              }`}
            >
              {day.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <button
          type="button"
          onClick={handleSelectToday}
          className="rounded-full border border-slate-300 px-3 py-1 font-medium text-slate-600 hover:bg-slate-100"
        >
          今日
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-transparent px-2 py-1 text-slate-400 hover:border-slate-200 hover:text-slate-600"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
