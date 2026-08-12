import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  ASSIGNABLE_TYPES,
  COMPLAINT_TYPE_LABELS,
  type ComplaintTypeKey,
  type DriverComplaint,
} from "./complaintTypes";

interface AssignComplaintTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reporting: DriverComplaint | null;
}

export function AssignComplaintTypeDialog({
  open,
  onOpenChange,
  reporting,
}: AssignComplaintTypeDialogProps) {
  const { user, profile } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [type, setType] = useState<ComplaintTypeKey | "">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setType("");
  }, [open]);

  const handleAssign = async () => {
    if (!reporting || !type || !user) return;
    setSaving(true);

    // Is there already a copy for this reporting?
    const { data: existing, error: findError } = await supabase
      .from("driver_complaints")
      .select("id")
      .eq("source_complaint_id", reporting.id)
      .maybeSingle();

    if (findError) {
      console.error(findError);
      setSaving(false);
      toast({ title: "Failed to assign category", variant: "destructive" });
      return;
    }

    const error = existing
      ? (
          await supabase
            .from("driver_complaints")
            .update({ complaint_type: type } as never)
            .eq("id", existing.id)
        ).error
      : (
          await supabase.from("driver_complaints").insert({
            complaint_type: type,
            subject_text: reporting.subject_text,
            content: reporting.content,
            truck_id: reporting.truck_id,
            driver_id: reporting.driver_id,
            source_complaint_id: reporting.id,
            created_by: user.id,
            created_by_name: reporting.created_by_name || profile?.full_name || "Unknown",
            created_at: reporting.created_at,
          } as never)
        ).error;

    setSaving(false);
    if (error) {
      console.error(error);
      toast({ title: "Failed to assign category", variant: "destructive" });
      return;
    }

    toast({ title: `Assigned to ${COMPLAINT_TYPE_LABELS[type]}` });
    queryClient.invalidateQueries({ queryKey: ["driver-complaints"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign category</DialogTitle>
          <DialogDescription>
            Creates a copy of this dispatcher reporting in the chosen category. The dispatcher keeps
            seeing their original reporting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={type} onValueChange={(v) => setType(v as ComplaintTypeKey)}>
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {ASSIGNABLE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {COMPLAINT_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAssign} disabled={saving || !type}>
            {saving ? "Assigning..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AssignComplaintTypeDialog;
