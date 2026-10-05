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
export interface DueTask { service_type: ServiceType; due_date: string; status: RepairStatus }
export function hasOverdueTruckRequirement(tasks: readonly DueTask[], truckDot: string | null | undefined, trailerDot: string | null | undefined, today: string) {
  return isPastDue(truckDot, today) || isPastDue(trailerDot, today) || tasks.some(task =>
    isOpenRepair(task.status) && task.service_type !== "oil_change" && isPastDue(task.due_date, today));
}
