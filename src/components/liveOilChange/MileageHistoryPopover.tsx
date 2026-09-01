import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  truckId: string;
  field: "last_oil_change_miles" | "miles";
  label: string;
};

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : Number(n).toLocaleString();

export const MileageHistoryPopover = ({ truckId, field, label }: Props) => {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["truck-mileage-history", truckId, field],
    enabled: open,
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("truck_mileage_history")
        .select("id, old_value, new_value, changed_at, changed_by")
        .eq("truck_id", truckId)
        .eq("field", field)
        .order("changed_at", { ascending: false })
        .limit(30);
      if (error) throw error;

      const userIds = [...new Set((data || []).map((r) => r.changed_by).filter(Boolean))] as string[];
      let nameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", userIds);
        nameMap = new Map(
          (profiles || []).map((p: any) => [p.user_id, p.full_name || p.email || ""]),
        );
      }

      return (data || []).map((r) => ({
        ...r,
        changed_by_name: r.changed_by ? nameMap.get(r.changed_by) ?? null : null,
      }));
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
          title={`${label} history`}
          onClick={(e) => e.stopPropagation()}
        >
          <History className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">{label} history</div>
        <div className="max-h-72 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">Loading…</div>
          ) : !data || data.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground">No changes recorded yet.</div>
          ) : (
            <ul className="divide-y">
              {data.map((entry) => (
                <li key={entry.id} className="px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {fmtNum(entry.old_value as any)} → {fmtNum(entry.new_value as any)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {(() => {
                        try {
                          return format(parseISO(entry.changed_at), "MM/dd/yyyy HH:mm");
                        } catch {
                          return "";
                        }
                      })()}
                    </span>
                  </div>
                  {entry.changed_by_name && (
                    <div className="text-xs text-muted-foreground">{entry.changed_by_name}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
