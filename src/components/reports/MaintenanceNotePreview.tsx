import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MaintenanceNoteAttribution, MAINTENANCE_NOTE_SELECT } from "./MaintenanceNoteAttribution";
import { Button } from "@/components/ui/button";

/** Mounted inside the alert popover so notes load only when an alert is opened. */
export function MaintenanceNotePreview({ truckId, onEdit }: { truckId: string; onEdit: () => void }) {
  const note = useQuery({
    queryKey: ["truck-maintenance-note", truckId],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("trucks")
        .select(MAINTENANCE_NOTE_SELECT).eq("id", truckId).single();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mt-2 border-t pt-2 space-y-2">
      {note.isPending ? <p className="text-xs text-muted-foreground">Loading comment…</p>
        : note.isError ? <p className="text-xs text-destructive">Could not load comment.</p>
        : note.data.oil_change_note ? <div className="space-y-1"><p className="text-xs whitespace-pre-wrap break-words">{note.data.oil_change_note}</p><MaintenanceNoteAttribution note={note.data} /></div>
        : <p className="text-xs text-muted-foreground">No comment yet.</p>}
      <Button type="button" size="sm" variant="ghost" className="h-5 px-1 text-[10px] font-normal text-muted-foreground hover:text-foreground" onClick={event => { event.stopPropagation(); onEdit(); }}>
        Add/change comment
      </Button>
    </div>
  );
}
