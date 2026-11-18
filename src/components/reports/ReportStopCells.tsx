import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const STOP_PREVIEW_DELAY_MS = 500;
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

function StopPreview({
  kind,
  stops,
  activeKey,
}: Pick<ReportStopCellsProps, "kind" | "stops"> & { activeKey: string }) {
  const multiple = stops.length > 1;
  const heading = kind === "pickup" ? "Pickup" : "Delivery";
  const plural = kind === "pickup" ? "pickups" : "deliveries";

  return (
    <TooltipContent
      side={kind === "delivery" ? "top" : "bottom"}
      sideOffset={4}
      collisionPadding={8}
      aria-label={multiple ? `${stops.length} ${plural}. ${stops.map((stop) => `${stop.location} ${stop.time}`).join("; ")}` : heading}
      className={cn(
        "max-w-[calc(100vw-1rem)] select-none p-2 shadow-lg duration-150 motion-reduce:animate-none",
        multiple ? "w-64" : "w-52",
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-1.5 px-1 text-xs font-semibold">
        {multiple ? `${stops.length} ${plural}` : heading}
      </div>
      <ol
        className="grid max-h-[min(40vh,16rem,var(--radix-tooltip-content-available-height))] gap-1 overflow-y-auto overscroll-contain"
      >
        {stops.map((stop, index) => (
          <li
            key={stop.key}
            className={cn(
              "flex items-start gap-2 rounded border px-2.5 py-1.5",
              stop.color,
              multiple && stop.key === activeKey && "ring-2 ring-inset ring-current",
            )}
          >
            {multiple && <span className="mt-0.5 w-4 shrink-0 text-xs font-semibold tabular-nums">{index + 1}</span>}
            <div className="min-w-0 break-words">
              <div className="text-sm font-semibold leading-tight">{stop.location}</div>
              <div className="text-xs tabular-nums leading-tight">{stop.time}</div>
              {stop.scaleTicketRequired && (
                <div className="mt-1 flex items-center gap-1 text-xs leading-tight">
                  <AlertTriangle className="size-3 shrink-0" />
                  Scale ticket required
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </TooltipContent>
  );
}

export function ReportStopCells({ kind, stops, isToday, onOpenLoad }: ReportStopCellsProps) {
  const multiple = stops.length > 1;

  return (
    <TooltipProvider delayDuration={STOP_PREVIEW_DELAY_MS} skipDelayDuration={0}>
      <div className="flex flex-1 flex-row overflow-hidden" onClick={(event) => event.stopPropagation()}>
        {stops.map((stop) => (
          <Tooltip key={stop.key}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "relative flex h-full min-w-0 cursor-pointer flex-col items-stretch rounded border px-1 py-0.5 text-left",
                  "hover:ring-1 hover:ring-inset hover:ring-current",
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
            </TooltipTrigger>
            <StopPreview kind={kind} stops={stops} activeKey={stop.key} />
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
