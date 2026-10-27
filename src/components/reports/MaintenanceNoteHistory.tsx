import { subMonths } from "date-fns";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MaintenanceNoteAttribution } from "./MaintenanceNoteAttribution";

export function MaintenanceNoteHistory({ truckId }: { truckId: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const history = useQuery({
    queryKey: ["truck-maintenance-note-history", truckId],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      const cutoff = subMonths(new Date(), 3).toISOString();
      const rows = [];
      for (let offset = 0; ; offset += 200) {
        const { data, error } = await supabase.from("truck_maintenance_note_history")
          .select("id, old_note, new_note, changed_by_name, changed_at")
          .eq("truck_id", truckId).gte("changed_at", cutoff)
          .order("changed_at", { ascending: false }).order("id", { ascending: false })
          .range(offset, offset + 199);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 200) return rows;
      }
    },
  });
  const rows = history.data ?? [];
  const cursor = Math.min(index, Math.max(0, rows.length - 1));
  const entry = rows[cursor];

  return <Popover open={open} onOpenChange={value => { setOpen(value); if (value) setIndex(0); }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" className="h-5 gap-1 px-1 text-[10px] font-normal text-muted-foreground" onClick={event => event.stopPropagation()} title="Note edit history · last 3 months">
        <History className="h-3 w-3" />3-month history
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-3 space-y-3" onClick={event => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">Edit history · last 3 months</span>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" className="h-6 w-6 p-0" aria-label="Older note" disabled={!entry || cursor >= rows.length - 1} onClick={() => setIndex(cursor + 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button type="button" variant="ghost" className="h-6 w-6 p-0" aria-label="Newer note" disabled={!entry || cursor === 0} onClick={() => setIndex(cursor - 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      {history.isPending ? <p className="text-xs" role="status">Loading history…</p>
        : history.isError ? <div role="alert" className="text-xs text-destructive">Could not load history. <button type="button" className="underline" onClick={() => void history.refetch()}>Retry</button></div>
        : !entry ? <p className="text-xs text-muted-foreground">No note edits in the last 3 months.</p>
        : <>
          <MaintenanceNoteAttribution note={{ oil_change_note_author: entry.changed_by_name, oil_change_note_updated_at: entry.changed_at }} />
          <div className="max-h-48 overflow-y-auto border-t pt-2 text-xs whitespace-pre-wrap break-words">
            {entry.old_note && <><span className="font-semibold">{entry.new_note ? "Replaced: " : "Cleared: "}</span><span className="italic">{entry.old_note}</span></>}
            {entry.new_note && <><span className="font-semibold">{entry.old_note ? "\nWith: " : "Saved: "}</span><span>{entry.new_note}</span></>}
          </div>
          <p className="text-[10px] text-muted-foreground">{cursor + 1} of {rows.length} edits · newest first</p>
        </>}
    </PopoverContent>
  </Popover>;
}
