import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const SCALE_TICKET_LABEL = "Scale ticket required (BOL weight ≥ 30,000 lbs)";

interface ReportStopCell {
  key: string;
  orderId: string;
  location: string;
  time: string;
  color: string;
  scaleTicketRequired: boolean;
}

interface ReportStopCellsProps {
  kind: "pickup" | "delivery";
  stops: ReportStopCell[];
  isToday: boolean;
  onOpenLoad: (orderId: string) => void;
}

export function ReportStopCells({ kind, stops, isToday, onOpenLoad }: ReportStopCellsProps) {
  const multiple = stops.length > 1;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-row" onClick={(event) => event.stopPropagation()}>
      {stops.map((stop) => (
        <button
          key={stop.key}
          type="button"
          className={cn(
            "relative flex h-full min-w-0 cursor-pointer flex-col items-stretch overflow-hidden rounded border px-1 py-0.5 text-left",
            "transition-transform duration-150 ease-out motion-reduce:duration-0",
            "[@media(hover:hover)]:hover:z-[101] [@media(hover:hover)]:hover:scale-150 [@media(hover:hover)]:hover:delay-500",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-current",
            stop.color,
            multiple ? "shrink-0" : "flex-1",
          )}
          style={multiple ? { width: `${100 / stops.length}%` } : undefined}
          aria-label={`Open ${kind} load for ${stop.location}, ${stop.time}${stop.scaleTicketRequired ? `. ${SCALE_TICKET_LABEL}` : ""}`}
          onClick={() => onOpenLoad(stop.orderId)}
        >
          {stop.scaleTicketRequired && (
            <span
              className={cn(
                "absolute top-0 z-20 flex size-3 items-center justify-center rounded-bl rounded-tr bg-yellow-400 text-black",
                isToday ? "right-1" : "right-0",
              )}
              title={SCALE_TICKET_LABEL}
            >
              <AlertTriangle className="size-2.5" strokeWidth={3} />
            </span>
          )}
          <span className={cn("font-medium leading-tight", multiple ? "text-[7px]" : "truncate text-[9px]", isToday && "pl-[2%]")}>
            {stop.location}
          </span>
          <span className={cn("text-[8px] leading-tight opacity-70", !multiple && "truncate", isToday && "pl-[2%]")}>
            {stop.time}
          </span>
        </button>
      ))}
    </div>
  );
}
