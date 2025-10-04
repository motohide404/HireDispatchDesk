export interface Driver {
  id: string;
  name: string;
  status: "available" | "assigned";
  assignedReservationId?: string;
}

export interface Job {
  id: string;
  title: string;
  pickup: string;
  dropoff: string;
  windowStart: string;
  windowEnd: string;
  status: "unassigned" | "scheduled";
  reservationId?: string;
}

export interface Reservation {
  id: string;
  laneId: string;
  vehicleName: string;
  start: string;
  end: string;
  jobId?: string;
  driverId?: string;
}

export interface Lane {
  id: string;
  name: string;
  reservationIds: string[];
}

export const mockDrivers: Driver[] = [
  { id: "driver-1", name: "Alex Johnson", status: "available" },
  { id: "driver-2", name: "Robin Singh", status: "assigned", assignedReservationId: "reservation-1" },
  { id: "driver-3", name: "Jamie Chen", status: "available" },
  { id: "driver-4", name: "Morgan Lee", status: "assigned", assignedReservationId: "reservation-2" }
];

export const mockJobs: Job[] = [
  {
    id: "job-1",
    title: "Airport Transfer - Smith",
    pickup: "Warehouse",
    dropoff: "Airport",
    windowStart: "08:00",
    windowEnd: "09:30",
    status: "scheduled",
    reservationId: "reservation-1"
  },
  {
    id: "job-2",
    title: "Corporate Shuttle",
    pickup: "HQ",
    dropoff: "Conference Center",
    windowStart: "09:00",
    windowEnd: "12:00",
    status: "unassigned"
  },
  {
    id: "job-3",
    title: "Hotel Pick-up - Garcia",
    pickup: "Hotel Indigo",
    dropoff: "Main Office",
    windowStart: "10:30",
    windowEnd: "11:00",
    status: "unassigned"
  },
  {
    id: "job-4",
    title: "Equipment Run",
    pickup: "Storage Lot",
    dropoff: "Client Site",
    windowStart: "13:00",
    windowEnd: "15:00",
    status: "scheduled",
    reservationId: "reservation-2"
  }
];

export const mockReservations: Reservation[] = [
  {
    id: "reservation-1",
    laneId: "lane-1",
    vehicleName: "Sprinter 100",
    start: "07:45",
    end: "10:00",
    jobId: "job-1",
    driverId: "driver-2"
  },
  {
    id: "reservation-2",
    laneId: "lane-2",
    vehicleName: "Transit 55",
    start: "12:30",
    end: "16:00",
    jobId: "job-4",
    driverId: "driver-4"
  },
  {
    id: "reservation-3",
    laneId: "lane-1",
    vehicleName: "Sprinter 100",
    start: "16:30",
    end: "18:00"
  },
  {
    id: "reservation-4",
    laneId: "lane-3",
    vehicleName: "City Van 12",
    start: "08:30",
    end: "11:00"
  }
];

export const mockLanes: Lane[] = [
  { id: "lane-1", name: "Sprinter 100", reservationIds: ["reservation-1", "reservation-3"] },
  { id: "lane-2", name: "Transit 55", reservationIds: ["reservation-2"] },
  { id: "lane-3", name: "City Van 12", reservationIds: ["reservation-4"] }
];
