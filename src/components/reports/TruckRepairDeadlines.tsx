import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SERVICE_LABELS, formatDueDate, isPastDue } from "@/lib/yardRepairDue";
import type { YardRepair } from "@/hooks/useMandatoryYardRepairs";

interface Props { tasks: YardRepair[]; truckDot?: string | null; trailerDot?: string | null; today: string }
export function TruckRepairDeadlines({ tasks, truckDot, trailerDot, today }: Props) {
  const entries = [
    ...tasks.map(task => ({ id: task.id, label: SERVICE_LABELS[task.service_type], short: task.service_type === "mandatory_yard_repair" ? "MYR" : task.service_type === "dot" ? "DOT" : "Oil", date: task.due_date, detail: task.description })),
    ...(truckDot ? [{ id: "truck-dot", label: "Truck DOT", short: "DOT", date: truckDot, detail: "Truck DOT expiration" }] : []),
    ...(trailerDot ? [{ id: "trailer-dot", label: "Trailer DOT", short: "T DOT", date: trailerDot, detail: "Trailer DOT expiration" }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date));
  if (!entries.length) return null;
  return <div className="flex flex-col gap-0.5 text-[9px] leading-tight font-normal">
    {entries.map(entry => <Popover key={entry.id}><PopoverTrigger asChild><button type="button" className={`text-left underline decoration-dotted ${isPastDue(entry.date, today) ? "font-semibold text-red-600" : "text-black"}`} onClick={e => e.stopPropagation()} aria-label={`${entry.label} due ${formatDueDate(entry.date)}`}>
      {entry.short} {formatDueDate(entry.date)}
    </button></PopoverTrigger><PopoverContent className="w-72 p-3"><p className="text-xs font-semibold">{entry.label}</p><p className="text-xs">Due: {formatDueDate(entry.date)}{isPastDue(entry.date, today) ? " · Overdue" : entry.date === today ? " · Due today" : ""}</p><p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{entry.detail}</p></PopoverContent></Popover>)}
  </div>;
}
