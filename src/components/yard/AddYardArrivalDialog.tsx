import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const arrivalTypes = [{ value: "maintenance", label: "Maintenance" }, { value: "return_truck", label: "Return Truck" }, { value: "safety", label: "Safety" }, { value: "recovery", label: "Recovery" }];
const chicagoDateTime = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).replace(" ", "T");

export function AddYardArrivalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [truckId, setTruckId] = useState("");
  const [arrival, setArrival] = useState(chicagoDateTime);
  const [type, setType] = useState("maintenance");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const client = useQueryClient();
  const { data: trucks = [], isLoading, error } = useQuery({
    queryKey: ["yard-arrival-truck-options"], enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("trucks").select("id,truck_number,driver1_id,driver2_id,driver:drivers!trucks_driver1_id_fkey(name)").order("truck_number");
      if (error) throw error;
      return data ?? [];
    },
  });
  const selected = trucks.find(truck => truck.id === truckId);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selected || !arrival || saving) return;
    setSaving(true);
    try {
      // Yard dates elsewhere in the application use Chicago wall-time stored
      // with +00. Preserve that convention instead of the browser's timezone.
      const { data, error } = await supabase.rpc("add_truck_yard_arrival", { p_truck_id: selected.id, p_arrival_datetime: `${arrival}:00+00:00`, p_action_type: type, p_comment: comment.trim() });
      if (error) throw error;
      if (!data) throw new Error("The arrival was not saved.");
      await Promise.all(["yard-arrivals", "reports", "drivers"].map(key => client.invalidateQueries({ queryKey: [key] })));
      toast({ title: "Yard arrival added" });
      onOpenChange(false); setTruckId(""); setComment(""); setType("maintenance"); setArrival(chicagoDateTime());
    } catch (error) {
      toast({ title: "Could not add yard arrival", description: error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "Please try again."), variant: "destructive" });
    } finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={value => { if (!saving) onOpenChange(value); }}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Add yard arrival</DialogTitle></DialogHeader>
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-2"><Label>Truck</Label><Combobox options={trucks.map(truck => ({ value: truck.id, label: `${truck.truck_number} — ${truck.driver?.name || "No driver assigned"}` }))} value={truckId} onValueChange={setTruckId} disabled={saving || isLoading || !!error} placeholder={isLoading ? "Loading trucks…" : "Select truck"} searchPlaceholder="Search truck number…" modal />{error && <p role="alert" className="text-sm text-destructive">Could not load trucks.</p>}{selected && <p className="text-sm text-muted-foreground">{selected.driver?.name ? `Driver: ${selected.driver.name}${selected.driver2_id ? " (team)" : ""}` : "No driver assigned. This arrival will be recorded for the truck."}</p>}</div>
      <div className="space-y-2"><Label htmlFor="yard-arrival-date">Arrival date and time (Chicago)</Label><Input id="yard-arrival-date" type="datetime-local" required value={arrival} onChange={event => setArrival(event.target.value)} disabled={saving} /></div>
      <div className="space-y-2"><Label htmlFor="yard-arrival-type">Arrival type</Label><select id="yard-arrival-type" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={type} onChange={event => setType(event.target.value)} disabled={saving}>{arrivalTypes.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
      <div className="space-y-2"><Label htmlFor="yard-arrival-reason">Reason / note</Label><Textarea id="yard-arrival-reason" value={comment} onChange={event => setComment(event.target.value)} disabled={saving} /></div>
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !selected || !arrival}>{saving ? "Adding…" : "Add yard arrival"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}
