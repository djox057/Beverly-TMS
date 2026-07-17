import { Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useMatchedOrders } from "@/hooks/useLoadSuggestions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  truckId: string | null;
  truckNumber?: string | null;
  driverName?: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmtDateTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fmtMoney = (n: number | null) =>
  n == null ? "—" : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtScore = (n: number | null) => (n == null ? "—" : n.toFixed(3));

export const LoadSuggestionsDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  truckId,
  truckNumber,
  driverName,
}) => {
  const { data, isLoading, isFetching, error } = useMatchedOrders(truckId, open && !!truckId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl p-0"
        // Prevent clicks inside the dialog from bubbling through the React tree
        // to the underlying cell's onClick (which would open the Home Time dialog).
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2">
            Suggested loads
            {isFetching && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </DialogTitle>
          <DialogDescription>
            {truckNumber ? `Truck ${truckNumber}` : ""}
            {driverName ? ` · ${driverName}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-auto text-sm">
          {isLoading ? (
            <div className="p-6 flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading matches…
            </div>
          ) : error ? (
            <div className="p-6 flex items-start gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">Couldn't reach LoadMatch</div>
                <div className="text-xs">{(error as Error).message}</div>
              </div>
            </div>
          ) : !data || data.length === 0 ? (
            <div className="p-6 text-muted-foreground">No matching loads.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">source_load_id</th>
                  <th className="text-right px-3 py-2">count</th>
                  <th className="text-left px-3 py-2">origin</th>
                  <th className="text-left px-3 py-2">destination</th>
                  <th className="text-left px-3 py-2">equipment</th>
                  <th className="text-right px-3 py-2">rate</th>
                  <th className="text-right px-3 py-2">deadhead_miles</th>
                  <th className="text-right px-3 py-2">score</th>
                  <th className="text-left px-3 py-2">pickup_start</th>
                  <th className="text-left px-3 py-2">pickup_end</th>
                </tr>
              </thead>
              <tbody>
                {data.map((m) => (
                  <tr key={m.source_load_id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap font-mono">{m.source_load_id}</td>
                    <td className="px-3 py-2 text-right">{m.count}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {m.origin_city}, {m.origin_state}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {m.dest_city}, {m.dest_state}
                    </td>
                    <td className="px-3 py-2">{m.equipment}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(m.rate)}</td>
                    <td className="px-3 py-2 text-right">
                      {m.deadhead_miles == null ? "—" : m.deadhead_miles.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtScore(m.score)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(m.pickup_start)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDateTime(m.pickup_end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoadSuggestionsDialog;