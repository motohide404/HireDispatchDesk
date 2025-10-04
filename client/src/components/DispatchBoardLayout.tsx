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
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
        <div className="min-h-[420px]">{driverPool}</div>
        <div className="min-h-[420px]">{motorPool}</div>
        <div className="min-h-[420px]">{summary}</div>
      </div>
      <div>{jobPool}</div>
    </div>
  );
};

export default DispatchBoardLayout;
