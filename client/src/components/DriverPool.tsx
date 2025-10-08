import { Draggable, Droppable } from "react-beautiful-dnd";
import type { Driver } from "../data/mockData";

type DriverPoolProps = {
  drivers: Driver[];
};

const DriverPool = ({ drivers }: DriverPoolProps) => {
  const visibleDrivers = drivers.slice(0, 10);
  const hiddenDriverCount = Math.max(drivers.length - visibleDrivers.length, 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col overflow-hidden xl:max-h-[calc(100vh-240px)]">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-700">Driver Pool</h2>
        <p className="text-xs text-slate-500">Assign drivers by dragging onto reservations.</p>
      </div>
      <Droppable droppableId="driverPool" type="DRIVER">
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 overflow-y-auto px-4 py-4 space-y-3 transition-colors min-h-0 ${
              snapshot.isDraggingOver ? "bg-sky-50" : "bg-white"
            }`}
          >
            {visibleDrivers.map((driver, index) => (
              <Draggable draggableId={driver.id} index={index} key={driver.id}>
                {(dragProvided, dragSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    className={`rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm transition text-sm ${
                      dragSnapshot.isDragging ? "ring-2 ring-sky-400" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-slate-700 truncate">{driver.name}</span>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                          driver.status === "available"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {driver.status === "available" ? "Available" : "Assigned"}
                      </span>
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {drivers.length === 0 && (
              <p className="text-sm text-slate-500 text-center py-6">
                All drivers are currently assigned.
              </p>
            )}
            {hiddenDriverCount > 0 && (
              <p className="text-xs text-slate-500 text-center">
                +{hiddenDriverCount} more drivers not shown.
              </p>
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

export default DriverPool;
