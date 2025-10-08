import { ReactNode, useLayoutEffect, useRef, useState } from "react";

type DispatchBoardLayoutProps = {
  driverPool: ReactNode;
  motorPool: ReactNode;
  summary: ReactNode;
  jobPool: ReactNode;
};

const DispatchBoardLayout = ({ driverPool, motorPool, summary, jobPool }: DispatchBoardLayoutProps) => {
  const baseMinHeight = 420;
  const [sharedHeight, setSharedHeight] = useState(baseMinHeight);
  const driverContainerRef = useRef<HTMLDivElement>(null);
  const motorContainerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const driverEl = driverContainerRef.current;
    const motorEl = motorContainerRef.current;

    if (!driverEl || !motorEl) {
      return;
    }

    let animationFrame: number | null = null;

    const updateHeights = () => {
      animationFrame = null;
      const driverHeight = driverEl.scrollHeight;
      const motorHeight = motorEl.scrollHeight;
      const nextHeight = Math.max(baseMinHeight, driverHeight, motorHeight);

      setSharedHeight((previous) => (previous === nextHeight ? previous : nextHeight));
    };

    const scheduleUpdate = () => {
      if (animationFrame === null) {
        animationFrame = requestAnimationFrame(updateHeights);
      }
    };

    scheduleUpdate();

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(driverEl);
    resizeObserver.observe(motorEl);

    return () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      resizeObserver.disconnect();
    };
  }, [baseMinHeight]);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[260px_minmax(0,1fr)_280px] xl:gap-4 xl:items-start">
      <div
        ref={driverContainerRef}
        className="min-h-[420px] xl:h-full xl:min-h-0"
        style={{ minHeight: sharedHeight }}
      >
        {driverPool}
      </div>
      <div
        ref={motorContainerRef}
        className="min-h-[420px] xl:h-full xl:min-h-0"
        style={{ minHeight: sharedHeight }}
      >
        {motorPool}
      </div>
      <div className="min-h-[420px] xl:h-full xl:min-h-0">{summary}</div>
      <div className="xl:col-start-2">{jobPool}</div>
    </div>
  );
};

export default DispatchBoardLayout;
