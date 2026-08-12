import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { COMPLAINT_TYPE_LABELS, type ComplaintTypeKey, type DriverComplaint } from "./complaintTypes";

interface Suggestion {
  label: string;
  truckId: string | null;
  driverId: string | null;
}

interface AddComplaintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ComplaintTypeKey;
  complaint?: DriverComplaint | null;
}

export function AddComplaintDialog({ open, onOpenChange, type, complaint }: AddComplaintDialogProps) {
  const { user, profile } = useAuthContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [truckId, setTruckId] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubject(complaint?.subject_text ?? "");
    setContent(complaint?.content ?? "");
    setTruckId(complaint?.truck_id ?? null);
    setDriverId(complaint?.driver_id ?? null);
    setShowSuggestions(false);
  }, [open, complaint]);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["complaint-subject-suggestions"],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Suggestion[]> => {
      const [trucksRes, driversRes] = await Promise.all([
        supabase
          .from("trucks")
          .select("id, truck_number, driver1_id, driver1:drivers!trucks_driver1_id_fkey(id, name, first_name, last_name)")
          .order("truck_number"),
        supabase
          .from("drivers")
          .select("id, name, first_name, last_name")
          .eq("is_active", true)
          .order("name"),
      ]);

      const items: Suggestion[] = [];
      for (const t of trucksRes.data || []) {
        const d: any = (t as any).driver1;
        const driverName = d ? d.name || `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() : "";
        items.push({
          label: `#${t.truck_number}${driverName ? ` - ${driverName}` : ""}`,
          truckId: t.id,
          driverId: d?.id ?? null,
        });
      }
      for (const d of driversRes.data || []) {
        const driverName = d.name || `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim();
        if (!driverName) continue;
        items.push({ label: driverName, truckId: null, driverId: d.id });
      }
      return items;
    },
  });

  const filteredSuggestions = useMemo(() => {
    const q = subject.trim().toLowerCase();
    if (!q) return [];
    return suggestions.filter((s) => s.label.toLowerCase().includes(q)).slice(0, 8);
  }, [subject, suggestions]);

  const handleSave = async () => {
    if (!subject.trim() || !content.trim() || !user) return;
    setSaving(true);

    if (complaint) {
      const { error } = await supabase
        .from("driver_complaints")
        .update({
          subject_text: subject.trim(),
          content: content.trim(),
          truck_id: truckId,
          driver_id: driverId,
        } as never)
        .eq("id", complaint.id);
      setSaving(false);
      if (error) {
        console.error(error);
        toast({ title: "Failed to update complaint", variant: "destructive" });
        return;
      }
      toast({ title: "Complaint updated" });
    } else {
      const { error } = await supabase.from("driver_complaints").insert({
        complaint_type: type,
        subject_text: subject.trim(),
        content: content.trim(),
        truck_id: truckId,
        driver_id: driverId,
        created_by: user.id,
        created_by_name: profile?.full_name || user.email || "Unknown",
      });
      setSaving(false);
      if (error) {
        console.error(error);
        toast({ title: "Failed to add complaint", variant: "destructive" });
        return;
      }
      toast({ title: "Complaint added" });
    }

    queryClient.invalidateQueries({ queryKey: ["driver-complaints"] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {complaint ? "Edit complaint" : "New complaint"} — {COMPLAINT_TYPE_LABELS[type]}
          </DialogTitle>
          <DialogDescription>
            Enter the truck number or driver name and describe the complaint.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5 relative">
            <Label htmlFor="complaint-subject">Truck # / Driver name</Label>
            <Input
              id="complaint-subject"
              value={subject}
              autoComplete="off"
              placeholder="e.g. 4264 or John Smith"
              onChange={(e) => {
                setSubject(e.target.value);
                setTruckId(null);
                setDriverId(null);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
            />
            {showSuggestions && filteredSuggestions.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md">
                {filteredSuggestions.map((s, i) => (
                  <button
                    key={`${s.label}-${i}`}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                    onClick={() => {
                      setSubject(s.label);
                      setTruckId(s.truckId);
                      setDriverId(s.driverId);
                      setShowSuggestions(false);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="complaint-content">Complaint</Label>
            <Textarea
              id="complaint-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={5}
              placeholder="Describe the complaint..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !subject.trim() || !content.trim()}>
            {saving ? "Saving..." : complaint ? "Save changes" : "Add complaint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddComplaintDialog;
