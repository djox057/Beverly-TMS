import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { EditDriverDialog } from "@/components/EditDriverDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ReportDriverEditorProps {
  driverId: string;
  onClose: () => void;
}

/** Mounted only while editing; no fleet-list query or background subscription. */
export function ReportDriverEditor({ driverId, onClose }: ReportDriverEditorProps) {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const { data: driver, isPending, isError, refetch } = useQuery({
    queryKey: ["report-driver-editor", user?.id, driverId],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("drivers")
        .select("*")
        .eq("id", driverId)
        .abortSignal(signal)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    // Opening the editor reads fresh details. Background refetches must not
    // replace the form's initial values while someone is typing.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  if (!user || isPending || isError || !driver) {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Driver</DialogTitle>
            <DialogDescription>
              {!user ? "Sign in to edit this driver." : isPending ? "Loading driver…" : "Could not load this driver. It may no longer be available."}
            </DialogDescription>
          </DialogHeader>
          {user && isError && <Button onClick={() => void refetch()}>Try again</Button>}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <EditDriverDialog
      open
      driver={driver}
      onOpenChange={(open) => { if (!open) onClose(); }}
      onSuccess={() => {
        // Reports no longer observes the full fleet lists. Refresh the actual
        // report dependencies after edits, including assignment/active changes.
        void queryClient.invalidateQueries({ queryKey: ["adapter-drivers"] });
        void queryClient.invalidateQueries({ queryKey: ["adapter-trucks"] });
      }}
    />
  );
}
