import { Draggable, Droppable } from "react-beautiful-dnd";
import type { Job } from "../data/mockData";

type JobPoolProps = {
  jobs: Job[];
};

const JobPool = ({ jobs }: JobPoolProps) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-700">Job Pool</h2>
          <p className="text-xs text-slate-500">Drag jobs to assign them to vehicles</p>
        </div>
        <span className="text-sm font-medium text-slate-500">{jobs.length} open</span>
      </div>
      <Droppable droppableId="jobPool" type="JOB">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`px-4 py-4 space-y-3 min-h-[180px] transition-colors ${
              snapshot.isDraggingOver ? "bg-amber-50" : "bg-white"
            }`}
          >
            {jobs.map((job, index) => (
              <Draggable draggableId={job.id} index={index} key={job.id}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className={`rounded-lg border border-amber-200 bg-white px-3 py-2 shadow-sm transition ${
                      dragSnapshot.isDragging ? "ring-2 ring-amber-400" : ""
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-700">{job.title}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {job.pickup} → {job.dropoff}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Window: {job.windowStart} - {job.windowEnd}
                    </p>
                  </div>
                )}
              </Draggable>
            ))}
            {jobs.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">
                All jobs are currently scheduled.
              </p>
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

export default JobPool;
