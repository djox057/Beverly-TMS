import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/** Mounted inside the alert popover so notes load only when an alert is opened. */
export function MaintenanceNotePreview({ truckId, onEdit }: { truckId: string; onEdit: () => void }) {
  const note = useQuery({
    queryKey: ["truck-maintenance-note", truckId],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("trucks")
        .select("oil_change_note").eq("id", truckId).single();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mt-2 border-t pt-2 space-y-2">
      {note.isPending ? <p className="text-xs text-muted-foreground">Loading comment…</p>
        : note.isError ? <p className="text-xs text-destructive">Could not load comment.</p>
        : note.data.oil_change_note ? <p className="text-xs whitespace-pre-wrap break-words">{note.data.oil_change_note}</p>
        : <p className="text-xs text-muted-foreground">No comment yet.</p>}
      <Button type="button" size="sm" variant="outline" onClick={event => { event.stopPropagation(); onEdit(); }}>
        Add/change comment
      </Button>
    </div>
  );
}
