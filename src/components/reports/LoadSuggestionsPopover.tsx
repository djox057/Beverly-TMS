import { Loader2, AlertCircle } from "lucide-react";
import { useMatchedOrders } from "@/hooks/useLoadSuggestions";

interface Props {
  truckId: string;
  truckNumber?: string | null;
  driverName?: string | null;
  /** Whether to actually fire the request. Dispatcher: prefetched. Admin: fires on open. */
  enabled: boolean;
}

const fmtDateTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const fmtMoney = (n: number | null) =>
  n == null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtScore = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export const LoadSuggestionsPopover: React.FC<Props> = ({
  truckId,
  truckNumber,
  driverName,
  enabled,
}) => {
  const { data, isLoading, isFetching, error } = useMatchedOrders(truckId, enabled);

  return (
    <div className="w-[560px] max-h-[420px] overflow-auto text-sm">
      <div className="sticky top-0 bg-background border-b px-3 py-2 flex items-center justify-between">
        <div>
          <div className="font-semibold">Suggested loads</div>
          <div className="text-xs text-muted-foreground">
            {truckNumber ? `Truck ${truckNumber}` : ""}
            {driverName ? ` · ${driverName}` : ""}
          </div>
        </div>
        {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      {isLoading ? (
        <div className="p-4 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading matches…
        </div>
      ) : error ? (
        <div className="p-4 flex items-start gap-2 text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Couldn't reach LoadMatch</div>
            <div className="text-xs">{(error as Error).message}</div>
          </div>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="p-4 text-muted-foreground">No matching loads.</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-2 py-1">Pickup</th>
              <th className="text-left px-2 py-1">Origin → Dest</th>
              <th className="text-right px-2 py-1">Rate</th>
              <th className="text-right px-2 py-1">DH</th>
              <th className="text-right px-2 py-1">Score</th>
              <th className="text-right px-2 py-1">×</th>
            </tr>
          </thead>
          <tbody>
            {data.map((m) => (
              <tr key={m.source_load_id} className="border-t">
                <td className="px-2 py-1 whitespace-nowrap">{fmtDateTime(m.pickup_start)}</td>
                <td className="px-2 py-1">
                  <div>
                    {m.origin_city}, {m.origin_state}
                  </div>
                  <div className="text-muted-foreground">
                    → {m.dest_city}, {m.dest_state}
                  </div>
                </td>
                <td className="px-2 py-1 text-right">{fmtMoney(m.rate)}</td>
                <td className="px-2 py-1 text-right">
                  {m.deadhead_miles == null ? "—" : `${Math.round(m.deadhead_miles)}`}
                </td>
                <td className="px-2 py-1 text-right">{fmtScore(m.score)}</td>
                <td className="px-2 py-1 text-right text-muted-foreground">
                  {m.count > 1 ? `×${m.count}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default LoadSuggestionsPopover;