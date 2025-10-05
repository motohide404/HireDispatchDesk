export type DispatchStatus = "queued" | "assigned" | "on-route" | "completed" | "canceled";

type StatusBadgeProps = {
  status: DispatchStatus;
  className?: string;
};

export const STATUS_LABELS: Record<DispatchStatus, string> = {
  queued: "Queued",
  assigned: "Assigned",
  "on-route": "On Route",
  completed: "Completed",
  canceled: "Canceled"
};

const STYLES: Record<DispatchStatus, string> = {
  queued: "bg-slate-100 text-slate-700 border-slate-200",
  assigned: "bg-sky-100 text-sky-700 border-sky-200",
  "on-route": "bg-amber-100 text-amber-700 border-amber-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  canceled: "bg-rose-100 text-rose-700 border-rose-200"
};

const merge = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  return (
    <span
      className={merge(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        STYLES[status],
        className
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
};

export default StatusBadge;
