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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquareWarning, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  ASSIGNABLE_TYPES,
  COMPLAINT_TYPE_LABELS,
  DISPATCHER_REPORTING,
  type ComplaintTypeKey,
} from "./complaintTypes";

interface DriverComplaintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverId: string;
  driverName: string;
  truckNumber: string;
}

export function DriverComplaintDialog({
  open,
  onOpenChange,
  driverId,
  driverName,
  truckNumber,
}: DriverComplaintDialogProps) {
  const { user, profile, hasRole } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canChooseType = hasRole("admin") || hasRole("manager");
  const [content, setContent] = useState("");
  const [type, setType] = useState<ComplaintTypeKey | "">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setContent("");
    setType("");
  }, [open]);

  const handleSubmit = async () => {
    if (!content.trim() || !user) return;
    if (canChooseType && !type) return;
    setSaving(true);

    const { error } = await supabase.from("driver_complaints").insert({
      complaint_type: canChooseType ? (type as ComplaintTypeKey) : DISPATCHER_REPORTING,
      subject_text: `#${truckNumber}${driverName ? ` - ${driverName}` : ""}`,
      content: content.trim(),
      driver_id: driverId || null,
      created_by: user.id,
      created_by_name: profile?.full_name || user.email || "Unknown",
    });

    setSaving(false);
    if (error) {
      console.error(error);
      toast({ title: "Failed to add driver complaint", variant: "destructive" });
      return;
    }

    toast({ title: "Driver complaint added" });
    queryClient.invalidateQueries({ queryKey: ["driver-complaints"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5 text-destructive" />
            Add Driver Complaint
          </DialogTitle>
          <DialogDescription>
            {driverName} (Truck #{truckNumber})
            {!canChooseType && " — filed as a Dispatcher Reporting"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {canChooseType && (
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ComplaintTypeKey)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select complaint type" />
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
          )}

          <div className="space-y-1.5">
            <Label htmlFor="driver-complaint-content">Complaint</Label>
            <Textarea
              id="driver-complaint-content"
              placeholder="Describe the complaint..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !content.trim() || (canChooseType && !type)}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...
              </>
            ) : (
              "Add complaint"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DriverComplaintDialog;
