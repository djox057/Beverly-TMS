import { formatInTimeZone } from "date-fns-tz";

export const SERVICE_LABELS = {
  mandatory_yard_repair: "Mandatory Yard Repair",
  dot: "DOT",
  oil_change: "Oil Change",
} as const;
export const STATUS_LABELS = { pending: "Pending", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" } as const;
export type ServiceType = keyof typeof SERVICE_LABELS;
export type RepairStatus = keyof typeof STATUS_LABELS;
export const chicagoToday = (now = new Date()) => formatInTimeZone(now, "America/Chicago", "yyyy-MM-dd");
export const isOpenRepair = (status: string) => status === "pending" || status === "in_progress";
export const isPastDue = (date: string | null | undefined, today: string) => !!date && date.slice(0, 10) < today;
export const formatDueDate = (date: string | null | undefined) => date ? `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}` : "—";
export interface DueTask { service_type: ServiceType | string; due_date: string; status: RepairStatus | string }
export function hasOverdueTruckRequirement(tasks: readonly DueTask[], truckDot: string | null | undefined, trailerDot: string | null | undefined, today: string) {
  return isPastDue(truckDot, today) || isPastDue(trailerDot, today) || tasks.some(task =>
    isOpenRepair(task.status) && task.service_type !== "oil_change" && isPastDue(task.due_date, today));
}

export function getActiveMandatoryYardRepairAlerts<T extends DueTask>(tasks: readonly T[]): T[] {
  return tasks.filter(task => task.service_type === "mandatory_yard_repair" && isOpenRepair(task.status));
}

// threshold helper
export function __testMarker() { return true; }
