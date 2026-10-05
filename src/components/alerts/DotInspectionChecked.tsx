import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function DotInspectionChecked({ table, id, unit, checked, canEdit }: {
  table: "trucks" | "trailers";
  id: string;
  unit: string;
  checked: boolean;
  canEdit: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const update = async (next: boolean) => {
    setSaving(true);
    try {
      const { data, error } = await supabase.from(table)
        .update({ dot_inspection_checked: next }).eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("You do not have permission to update this unit.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [table] }),
        queryClient.invalidateQueries({ queryKey: [`expiring-${table}`] }),
      ]);
      toast({ title: next ? "DOT reminders paused" : "DOT reminders enabled", description: unit });
    } catch (error: any) {
      toast({ title: "Could not update DOT check", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return <div className="flex items-center justify-center gap-1" title={checked ? "DOT reminders paused until unchecked" : "Check to pause DOT reminders"}>
    <Checkbox aria-label={`DOT checked for ${unit}`} checked={checked} disabled={!canEdit || saving}
      onCheckedChange={(next) => { if (typeof next === "boolean") void update(next); }} />
    {saving && <Loader2 className="h-3 w-3 animate-spin" aria-label="Saving DOT check" />}
  </div>;
}
