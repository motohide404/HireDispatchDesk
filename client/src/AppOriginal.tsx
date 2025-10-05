import { useMemo, useReducer } from "react";
import { DragDropContext, type DropResult } from "react-beautiful-dnd";
import DispatchBoardLayout from "./components/DispatchBoardLayout";
import DriverPool from "./components/DriverPool";
import JobPool from "./components/JobPool";
import MotorPoolTimeline from "./components/MotorPoolTimeline";
import type { Driver, Job, Reservation } from "./data/mockData";
import { mockDrivers, mockJobs, mockLanes, mockReservations } from "./data/mockData";

type DispatchState = {
  jobs: Record<string, Job>;
  jobOrder: string[];
  drivers: Record<string, Driver>;
  driverOrder: string[];
  reservations: Record<string, Reservation>;
  lanes: Record<string, { id: string; name: string; reservationIds: string[] }>;
  laneOrder: string[];
};

type DispatchAction =
  | {
      type: "MOVE_RESERVATION";
      reservationId: string;
      sourceLaneId: string;
      destinationLaneId: string;
      sourceIndex: number;
      destinationIndex: number;
    }
  | { type: "ASSIGN_JOB"; jobId: string; reservationId: string }
  | { type: "UNASSIGN_JOB"; jobId: string; reservationId: string }
  | { type: "ASSIGN_DRIVER"; driverId: string; reservationId: string }
  | { type: "UNASSIGN_DRIVER"; driverId: string; reservationId: string };

const buildInitialState = (): DispatchState => {
  const jobs: Record<string, Job> = {};
  const drivers: Record<string, Driver> = {};
  const reservations: Record<string, Reservation> = {};
  const lanes: DispatchState["lanes"] = {};

  mockJobs.forEach((job) => {
    jobs[job.id] = { ...job };
  });

  mockDrivers.forEach((driver) => {
    drivers[driver.id] = { ...driver };
  });

  mockReservations.forEach((reservation) => {
    reservations[reservation.id] = { ...reservation };
  });

  mockLanes.forEach((lane) => {
    lanes[lane.id] = { ...lane };
  });

  return {
    jobs,
    jobOrder: mockJobs.map((job) => job.id),
    drivers,
    driverOrder: mockDrivers.map((driver) => driver.id),
    reservations,
    lanes,
    laneOrder: mockLanes.map((lane) => lane.id)
  };
};

const releaseDriverFromReservation = (
  state: DispatchState,
  reservationId: string
): DispatchState => {
  const reservation = state.reservations[reservationId];
  if (!reservation?.driverId) {
    return state;
  }
  const driverId = reservation.driverId;
  const driver = state.drivers[driverId];
  if (!driver) {
    return state;
  }
  return {
    ...state,
    drivers: {
      ...state.drivers,
      [driverId]: { ...driver, status: "available", assignedReservationId: undefined }
    },
    reservations: {
      ...state.reservations,
      [reservationId]: { ...reservation, driverId: undefined }
    }
  };
};

const reducer = (state: DispatchState, action: DispatchAction): DispatchState => {
  switch (action.type) {
    case "MOVE_RESERVATION": {
      const { reservationId, sourceLaneId, destinationLaneId, sourceIndex, destinationIndex } = action;
      const sourceLane = state.lanes[sourceLaneId];
      const destinationLane = state.lanes[destinationLaneId];
      if (!sourceLane || !destinationLane) {
        return state;
      }

      const updatedSourceIds = Array.from(sourceLane.reservationIds);
      updatedSourceIds.splice(sourceIndex, 1);

      if (sourceLaneId === destinationLaneId) {
        updatedSourceIds.splice(destinationIndex, 0, reservationId);
        return {
          ...state,
          lanes: {
            ...state.lanes,
            [sourceLaneId]: { ...sourceLane, reservationIds: updatedSourceIds }
          }
        };
      }

      const updatedDestinationIds = Array.from(destinationLane.reservationIds);
      updatedDestinationIds.splice(destinationIndex, 0, reservationId);

      return {
        ...state,
        lanes: {
          ...state.lanes,
          [sourceLaneId]: { ...sourceLane, reservationIds: updatedSourceIds },
          [destinationLaneId]: { ...destinationLane, reservationIds: updatedDestinationIds }
        },
        reservations: {
          ...state.reservations,
          [reservationId]: { ...state.reservations[reservationId], laneId: destinationLaneId }
        }
      };
    }
    case "ASSIGN_JOB": {
      const { jobId, reservationId } = action;
      const job = state.jobs[jobId];
      const reservation = state.reservations[reservationId];
      if (!job || !reservation) {
        return state;
      }

      let nextState: DispatchState = state;

      if (job.reservationId && job.reservationId !== reservationId) {
        const previousReservation = state.reservations[job.reservationId];
        if (previousReservation) {
          nextState = {
            ...nextState,
            reservations: {
              ...nextState.reservations,
              [job.reservationId]: { ...previousReservation, jobId: undefined }
            }
          };
        }
      }

      if (reservation.jobId && reservation.jobId !== jobId) {
        const displacedJob = state.jobs[reservation.jobId];
        if (displacedJob) {
          nextState = {
            ...nextState,
            jobs: {
              ...nextState.jobs,
              [reservation.jobId]: { ...displacedJob, reservationId: undefined, status: "unassigned" }
            }
          };
        }
      }

      return {
        ...nextState,
        jobs: {
          ...nextState.jobs,
          [jobId]: { ...job, reservationId, status: "scheduled" }
        },
        reservations: {
          ...nextState.reservations,
          [reservationId]: { ...nextState.reservations[reservationId], jobId }
        }
      };
    }
    case "UNASSIGN_JOB": {
      const { jobId, reservationId } = action;
      const job = state.jobs[jobId];
      const reservation = state.reservations[reservationId];
      if (!job || !reservation) {
        return state;
      }

      const stateWithoutDriver = releaseDriverFromReservation(state, reservationId);

      return {
        ...stateWithoutDriver,
        jobs: {
          ...stateWithoutDriver.jobs,
          [jobId]: { ...job, reservationId: undefined, status: "unassigned" }
        },
        reservations: {
          ...stateWithoutDriver.reservations,
          [reservationId]: { ...stateWithoutDriver.reservations[reservationId], jobId: undefined }
        }
      };
    }
    case "ASSIGN_DRIVER": {
      const { driverId, reservationId } = action;
      const driver = state.drivers[driverId];
      const reservation = state.reservations[reservationId];
      if (!driver || !reservation) {
        return state;
      }

      let nextState: DispatchState = state;

      if (driver.assignedReservationId && driver.assignedReservationId !== reservationId) {
        const previousReservation = state.reservations[driver.assignedReservationId];
        if (previousReservation) {
          nextState = {
            ...nextState,
            reservations: {
              ...nextState.reservations,
              [driver.assignedReservationId]: { ...previousReservation, driverId: undefined }
            }
          };
        }
      }

      if (reservation.driverId && reservation.driverId !== driverId) {
        const replacedDriver = state.drivers[reservation.driverId];
        if (replacedDriver) {
          nextState = {
            ...nextState,
            drivers: {
              ...nextState.drivers,
              [reservation.driverId]: {
                ...replacedDriver,
                status: "available",
                assignedReservationId: undefined
              }
            }
          };
        }
      }

      return {
        ...nextState,
        drivers: {
          ...nextState.drivers,
          [driverId]: { ...driver, status: "assigned", assignedReservationId: reservationId }
        },
        reservations: {
          ...nextState.reservations,
          [reservationId]: { ...nextState.reservations[reservationId], driverId: driverId }
        }
      };
    }
    case "UNASSIGN_DRIVER": {
      const { driverId, reservationId } = action;
      const driver = state.drivers[driverId];
      const reservation = state.reservations[reservationId];
      if (!driver || !reservation) {
        return state;
      }

      return {
        ...state,
        drivers: {
          ...state.drivers,
          [driverId]: { ...driver, status: "available", assignedReservationId: undefined }
        },
        reservations: {
          ...state.reservations,
          [reservationId]: { ...reservation, driverId: undefined }
        }
      };
    }
    default:
      return state;
  }
};

const App = () => {
  const [state, dispatch] = useReducer(reducer, undefined, buildInitialState);

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId, type } = result;
    if (!destination) {
      return;
    }

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    if (type === "RESERVATION") {
      const sourceLaneId = source.droppableId.replace("lane-", "");
      const destinationLaneId = destination.droppableId.replace("lane-", "");
      dispatch({
        type: "MOVE_RESERVATION",
        reservationId: draggableId,
        sourceLaneId,
        destinationLaneId,
        sourceIndex: source.index,
        destinationIndex: destination.index
      });
      return;
    }

    if (type === "JOB") {
      const isSourceJobPool = source.droppableId === "jobPool";
      const isDestinationJobPool = destination.droppableId === "jobPool";

      if (isDestinationJobPool && !isSourceJobPool) {
        const reservationId = source.droppableId.replace("reservation-job-", "");
        dispatch({ type: "UNASSIGN_JOB", jobId: draggableId, reservationId });
        return;
      }

      if (!isDestinationJobPool) {
        const reservationId = destination.droppableId.replace("reservation-job-", "");
        dispatch({ type: "ASSIGN_JOB", jobId: draggableId, reservationId });
      }
      return;
    }

    if (type === "DRIVER") {
      const isSourceDriverPool = source.droppableId === "driverPool";
      const isDestinationDriverPool = destination.droppableId === "driverPool";

      if (isDestinationDriverPool && !isSourceDriverPool) {
        const reservationId = source.droppableId.replace("reservation-driver-", "");
        dispatch({ type: "UNASSIGN_DRIVER", driverId: draggableId, reservationId });
        return;
      }

      if (!isDestinationDriverPool) {
        const reservationId = destination.droppableId.replace("reservation-driver-", "");
        dispatch({ type: "ASSIGN_DRIVER", driverId: draggableId, reservationId });
      }
    }
  };

  const availableDrivers = useMemo(
    () =>
      state.driverOrder
        .map((driverId) => state.drivers[driverId])
        .filter((driver) => driver && driver.status === "available"),
    [state.driverOrder, state.drivers]
  );

  const unassignedJobs = useMemo(
    () =>
      state.jobOrder
        .map((jobId) => state.jobs[jobId])
        .filter((job) => job && !job.reservationId),
    [state.jobOrder, state.jobs]
  );

  const lanes = useMemo(
    () => state.laneOrder.map((laneId) => state.lanes[laneId]).filter(Boolean),
    [state.laneOrder, state.lanes]
  );

  const summaryPanel = (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full flex flex-col">
      <div className="px-4 py-3 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-700">Dispatch Summary</h2>
        <p className="text-xs text-slate-500">Snapshot of today&apos;s allocation</p>
      </div>
      <div className="flex-1 p-4 space-y-4 text-sm text-slate-600">
        <div>
          <p className="text-xs uppercase text-slate-400">Scheduled Jobs</p>
          <p className="text-2xl font-semibold text-emerald-600">
            {Object.values(state.jobs).filter((job) => job.status === "scheduled").length}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-400">Unassigned Jobs</p>
          <p className="text-2xl font-semibold text-amber-500">{unassignedJobs.length}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-400">Available Drivers</p>
          <p className="text-2xl font-semibold text-sky-500">{availableDrivers.length}</p>
        </div>
        <div className="space-y-2">
          <p className="text-xs uppercase text-slate-400">Active Reservations</p>
          <ul className="space-y-1 text-sm">
            {lanes.map((lane) => (
              <li key={lane.id} className="flex justify-between">
                <span className="font-medium text-slate-700">{lane.name}</span>
                <span className="text-slate-500">{lane.reservationIds.length} slots</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Vehicle Dispatch Board</h1>
          <p className="text-sm text-slate-500">Assign jobs and drivers across the motor pool timeline.</p>
        </div>
      </div>
      <DragDropContext onDragEnd={handleDragEnd}>
        <DispatchBoardLayout
          driverPool={<DriverPool drivers={availableDrivers} />}
          motorPool={
            <MotorPoolTimeline
              lanes={lanes}
              reservations={state.reservations}
              jobs={state.jobs}
              drivers={state.drivers}
            />
          }
          summary={summaryPanel}
          jobPool={<JobPool jobs={unassignedJobs} />}
        />
      </DragDropContext>
    </div>
  );
};

export default App;
