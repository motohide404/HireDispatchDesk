import type { ReactNode } from "react";

type DispatchBoardLayoutProps = {
  driverPool: ReactNode;
  motorPool: ReactNode;
  summary: ReactNode;
  jobPool: ReactNode;
};

const DispatchBoardLayout = ({ driverPool, motorPool, summary, jobPool }: DispatchBoardLayoutProps) => {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_280px] xl:auto-rows-[minmax(0,1fr)] xl:items-start">
        <div className="min-h-[420px] xl:h-full xl:min-h-0">{driverPool}</div>
        <div className="min-h-[420px] xl:h-full xl:min-h-0">{motorPool}</div>
        <div className="min-h-[420px] xl:h-full xl:min-h-0">{summary}</div>
      </div>
      <div>{jobPool}</div>
    </div>
  );
};

export default DispatchBoardLayout;
