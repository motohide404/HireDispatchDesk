import { Draggable, Droppable } from "react-beautiful-dnd";
import type { Driver, Job, Lane, Reservation } from "../data/mockData";

type MotorPoolTimelineProps = {
  lanes: Lane[];
  reservations: Record<string, Reservation>;
  jobs: Record<string, Job>;
  drivers: Record<string, Driver>;
};

const MotorPoolTimeline = ({ lanes, reservations, jobs, drivers }: MotorPoolTimelineProps) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden xl:max-h-[calc(100vh-240px)]">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-700">Motor Pool Timeline</h2>
          <p className="text-xs text-slate-500">Reorder reservations or drop jobs & drivers into cards</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {lanes.map((lane) => (
          <Droppable droppableId={`lane-${lane.id}`} type="RESERVATION" key={lane.id}>
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="relative bg-slate-50/80 border border-slate-200 rounded-lg p-4"
              >
                <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 border-l border-slate-200/60" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-700">{lane.name}</h3>
                      <p className="text-xs text-slate-500">{lane.reservationIds.length} reservations</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-3">
                    {lane.reservationIds.map((reservationId, index) => {
                      const reservation = reservations[reservationId];
                      if (!reservation) {
                        return null;
                      }
                      const assignedJob = reservation.jobId ? jobs[reservation.jobId] : undefined;
                      const assignedDriver = reservation.driverId ? drivers[reservation.driverId] : undefined;

                      return (
                        <Draggable draggableId={reservation.id} index={index} key={reservation.id}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={`bg-white border border-slate-300 rounded-lg shadow-md p-4 transition ${
                                dragSnapshot.isDragging ? "ring-2 ring-sky-400" : ""
                              }`}
                            >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-semibold text-slate-700">{reservation.vehicleName}</p>
                                <p className="text-xs text-slate-500">
                                  {reservation.start} - {reservation.end}
                                </p>
                              </div>
                              <span
                                className="text-xs uppercase font-semibold text-slate-400"
                                {...dragProvided.dragHandleProps}
                              >
                                Move
                              </span>
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                              <Droppable droppableId={`reservation-job-${reservation.id}`} type="JOB">
                                {(jobProvided, jobSnapshot) => (
                                  <div
                                    ref={jobProvided.innerRef}
                                    {...jobProvided.droppableProps}
                                    className={`rounded-md border border-dashed px-3 py-3 min-h-[88px] transition-colors ${
                                      jobSnapshot.isDraggingOver
                                        ? "border-amber-400 bg-amber-50"
                                        : "border-amber-200 bg-amber-50/40"
                                    }`}
                                  >
                                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                                      Job
                                    </p>
                                    {assignedJob ? (
                                      <Draggable draggableId={assignedJob.id} index={0} key={assignedJob.id}>
                                        {(jobDragProvided, jobDragSnapshot) => (
                                          <div
                                            ref={jobDragProvided.innerRef}
                                            {...jobDragProvided.draggableProps}
                                            {...jobDragProvided.dragHandleProps}
                                            className={`mt-2 rounded-md border border-amber-200 bg-white px-2 py-2 text-sm shadow-sm transition ${
                                              jobDragSnapshot.isDragging ? "ring-2 ring-amber-400" : ""
                                            }`}
                                          >
                                            <p className="font-medium text-slate-700">{assignedJob.title}</p>
                                            <p className="text-xs text-slate-500">
                                              {assignedJob.pickup} → {assignedJob.dropoff}
                                            </p>
                                          </div>
                                        )}
                                      </Draggable>
                                    ) : (
                                      <p className="mt-2 text-xs text-slate-500">Drop a job here</p>
                                    )}
                                    {jobProvided.placeholder}
                                  </div>
                                )}
                              </Droppable>
                              <Droppable droppableId={`reservation-driver-${reservation.id}`} type="DRIVER">
                                {(driverProvided, driverSnapshot) => (
                                  <div
                                    ref={driverProvided.innerRef}
                                    {...driverProvided.droppableProps}
                                    className={`rounded-md border border-dashed px-3 py-3 min-h-[88px] transition-colors ${
                                      driverSnapshot.isDraggingOver
                                        ? "border-sky-400 bg-sky-50"
                                        : "border-sky-200 bg-sky-50/40"
                                    }`}
                                  >
                                    <p className="text-xs font-semibold text-sky-700 uppercase tracking-wide">
                                      Driver
                                    </p>
                                    {assignedDriver ? (
                                      <Draggable draggableId={assignedDriver.id} index={0} key={assignedDriver.id}>
                                        {(driverDragProvided, driverDragSnapshot) => (
                                          <div
                                            ref={driverDragProvided.innerRef}
                                            {...driverDragProvided.draggableProps}
                                            {...driverDragProvided.dragHandleProps}
                                            className={`mt-2 rounded-md border border-sky-200 bg-white px-2 py-2 text-sm shadow-sm transition ${
                                              driverDragSnapshot.isDragging ? "ring-2 ring-sky-400" : ""
                                            }`}
                                          >
                                            <p className="font-medium text-slate-700">{assignedDriver.name}</p>
                                            <p className="text-xs text-slate-500">ID: {assignedDriver.id}</p>
                                          </div>
                                        )}
                                      </Draggable>
                                    ) : (
                                      <p className="mt-2 text-xs text-slate-500">Drop a driver here</p>
                                    )}
                                    {driverProvided.placeholder}
                                  </div>
                                )}
                              </Droppable>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                    {provided.placeholder}
                  </div>
                </div>
              </div>
            )}
          </Droppable>
        ))}
      </div>
    </div>
  );
};

export default MotorPoolTimeline;
