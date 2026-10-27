import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { busChannel } from "@/hooks/realtimeBus";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type MaintenanceNoteTarget = {
  truckId: string;
  truckNumber: string;
  details: string;
  canEdit: boolean;
};

// Mounted only while an alert is open: no extra per-truck queries in Reports.
export function TruckMaintenanceNoteDialog({ target, onClose }: {
  target: MaintenanceNoteTarget;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["truck-maintenance-note", target.truckId];
  const [draft, setDraft] = useState("");
  const dirty = useRef(false);
  const note = useQuery({
    queryKey,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("trucks")
        .select("oil_change_note").eq("id", target.truckId).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (note.data && !dirty.current) setDraft(note.data.oil_change_note ?? "");
  }, [note.data]);

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["truck-maintenance-note", target.truckId] });
    };
    const channel = busChannel(refresh, `truck-maintenance-note:${target.truckId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "trucks", filter: `id=eq.${target.truckId}` }, refresh)
      .subscribe();
    return () => channel.unsubscribe();
  }, [queryClient, target.truckId]);

  const save = useMutation({
    mutationFn: async () => {
      const value = draft.trim() || null;
      const { error } = await supabase.rpc("dispatcher_update_truck_oil_change_note", {
        _truck_id: target.truckId,
        _note: value,
      });
      if (error) throw error;
      return value;
    },
    onSuccess: (value) => {
      queryClient.setQueryData(queryKey, { oil_change_note: value });
      queryClient.setQueriesData<Array<{ id: string; oil_change_note: string | null }>>(
        { queryKey: ["live-oil-change-trucks"] },
        rows => rows?.map(row => row.id === target.truckId ? { ...row, oil_change_note: value } : row),
      );
      void queryClient.invalidateQueries({ queryKey: ["live-oil-change-trucks"] });
      void queryClient.invalidateQueries({ queryKey: ["truck-service-log", target.truckId] });
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
      <DialogContent className="w-[calc(100%_-_2rem)] max-h-[85dvh] overflow-y-auto sm:max-w-lg" onClick={event => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Maintenance · Truck {target.truckNumber}</DialogTitle>
          <DialogDescription>{target.details}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (target.canEdit && note.data && !save.isPending) save.mutate(); }}>
          <div className="space-y-2">
            <label htmlFor="maintenance-note" className="text-sm font-medium">Live Oil Change Note</label>
            <p className="text-xs text-muted-foreground">Explain why service is overdue or add a plan. This is the same note shown in Live Oil Change.</p>
            {note.isPending ? <p role="status">Loading note…</p> : note.isError ? (
              <div role="alert">
                <p>Could not load the note. {note.error.message}</p>
                <Button type="button" variant="outline" onClick={() => void note.refetch()}>Retry</Button>
              </div>
            ) : (
              <Textarea id="maintenance-note" className="min-h-40" value={draft}
                placeholder="Add a comment about overdue service…" readOnly={!target.canEdit} disabled={save.isPending}
                onChange={event => { dirty.current = true; setDraft(event.target.value); }} />
            )}
          </div>
          {save.isError && <p role="alert" className="text-sm text-destructive">Could not save the note. {save.error.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>{target.canEdit ? "Cancel" : "Close"}</Button>
            {target.canEdit && <Button type="submit" disabled={!note.data || note.isError || save.isPending}>{save.isPending ? "Saving…" : "Save note"}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
