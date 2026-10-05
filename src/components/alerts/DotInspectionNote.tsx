import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function DotInspectionNote({ table, id, unit, note, canEdit }: {
  table: "trucks" | "trailers";
  id: string;
  unit: string;
  note: string | null;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const save = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.from(table)
        .update({ dot_inspection_note: draft.trim() || null })
        .eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("You do not have permission to update this unit.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [table] }),
        queryClient.invalidateQueries({ queryKey: [`expiring-${table}`] }),
      ]);
      setOpen(false);
      toast({ title: "DOT note saved" });
    } catch (error: any) {
      toast({ title: "Could not save DOT note", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return <>
    {(canEdit || note) && <Button variant="ghost" size="sm" className="h-6 px-1 text-xs gap-1"
      onClick={() => { setDraft(note || ""); setOpen(true); }} title={note || "Add a DOT inspection note"}>
      <MessageSquare className="h-3 w-3" />{note ? "Note" : "Add note"}
    </Button>}
    {note && <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words max-w-xs line-clamp-2" title={note}>{note}</p>}
    <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>DOT note — {unit}</DialogTitle>
          <DialogDescription>This note is included in DOT reminder emails.</DialogDescription>
        </DialogHeader>
        <Textarea aria-label="DOT inspection note" value={draft} onChange={(e) => setDraft(e.target.value)}
          readOnly={!canEdit} disabled={saving} placeholder="Inspection scheduled, repair needed, instructions…" className="min-h-28" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
          {canEdit && <Button disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save note"}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
