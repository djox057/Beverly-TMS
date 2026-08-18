import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { useToast } from "@/hooks/use-toast";
import { useAuthContext } from "@/contexts/AuthContext";

interface AssignRecoveryLoadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  loadNumber?: string;
  onAssigned?: () => void;
}

export function AssignRecoveryLoadDialog({
  open,
  onOpenChange,
  orderId,
  loadNumber,
  onAssigned,
}: AssignRecoveryLoadDialogProps) {
  const { toast } = useToast();
  const { user, hasRole } = useAuthContext();
  const dispatcherOnly =
    hasRole("dispatch") &&
    !hasRole("admin") &&
    !hasRole("manager") &&
    !hasRole("supervisor");
  const [truckId, setTruckId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [trailerId, setTrailerId] = useState("");
  const [driverRate, setDriverRate] = useState("");
  const [dhMiles, setDhMiles] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTruckId("");
      setDriverId("");
      setTrailerId("");
      setDriverRate("");
      setDhMiles("");
    }
  }, [open, orderId]);

  const { data: trucks = [] } = useQuery({
    queryKey: ["recovery-assign-trucks", dispatcherOnly ? user?.id : "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trucks")
        .select("id, truck_number, driver1_id, driver2_id, trailer_id")
        .eq("is_active", true)
        .order("truck_number");
      if (error) throw error;
      let rows = data || [];

      if (dispatcherOnly && user?.id) {
        const driverIds = [
          ...new Set(rows.flatMap((t: any) => [t.driver1_id, t.driver2_id]).filter(Boolean)),
        ] as string[];
        if (driverIds.length === 0) return [];
        const { data: myDrivers, error: dErr } = await supabase
          .from("drivers")
          .select("id")
          .in("id", driverIds)
          .eq("dispatcher_id", user.id);
        if (dErr) throw dErr;
        const mine = new Set((myDrivers || []).map((d) => d.id));
        rows = rows.filter(
          (t: any) => (t.driver1_id && mine.has(t.driver1_id)) || (t.driver2_id && mine.has(t.driver2_id))
        );
      }
      return rows;
    },
    enabled: open,
    staleTime: 60000,
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ["recovery-assign-drivers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
    staleTime: 60000,
  });

  const { data: trailers = [] } = useQuery({
    queryKey: ["recovery-assign-trailers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trailers")
        .select("id, trailer_number")
        .order("trailer_number");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
    staleTime: 60000,
  });

  const truckOptions = useMemo(
    () => trucks.map((t: any) => ({ value: t.id, label: t.truck_number || "—" })),
    [trucks]
  );
  const driverOptions = useMemo(
    () => drivers.map((d: any) => ({ value: d.id, label: d.name || "—" })),
    [drivers]
  );
  const trailerOptions = useMemo(
    () => trailers.map((t: any) => ({ value: t.id, label: t.trailer_number || "—" })),
    [trailers]
  );

  // Autofill driver + trailer from the selected truck
  const handleTruckChange = (nextTruckId: string) => {
    setTruckId(nextTruckId);
    const truck = trucks.find((t: any) => t.id === nextTruckId) as any;
    if (!truck) return;
    if (truck.driver1_id) setDriverId(truck.driver1_id);
    if (truck.trailer_id) setTrailerId(truck.trailer_id);
  };

  const handleSave = async () => {
    if (!orderId) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      truck_id: truckId || null,
      driver1_id: driverId || null,
      trailer_id: trailerId || null,
      driver_price: driverRate ? parseFloat(driverRate) : null,
      dh_miles: dhMiles ? parseInt(dhMiles, 10) : null,
    };
    const { error } = await supabase
      .from("orders")
      .update(payload as never)
      .eq("id", orderId);
    setSaving(false);

    if (error) {
      toast({
        title: "Assignment failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Assigned", description: `Load ${loadNumber || ""} updated.` });
    onOpenChange(false);
    onAssigned?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Assign Recovery Load {loadNumber ? `#${loadNumber}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Truck #</Label>
            <Combobox
              options={truckOptions}
              value={truckId}
              onValueChange={handleTruckChange}
              placeholder="Select truck"
              searchPlaceholder="Search truck#..."
              modal={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Driver</Label>
            <Combobox
              options={driverOptions}
              value={driverId}
              onValueChange={setDriverId}
              placeholder="Select driver"
              searchPlaceholder="Search driver..."
              modal={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Trailer #</Label>
            <Combobox
              options={trailerOptions}
              value={trailerId}
              onValueChange={setTrailerId}
              placeholder="Select trailer"
              searchPlaceholder="Search trailer#..."
              modal={false}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Driver Rate</Label>
              <Input
                type="number"
                step="0.01"
                value={driverRate}
                onChange={(e) => setDriverRate(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>DH Miles</Label>
              <Input
                type="number"
                value={dhMiles}
                onChange={(e) => setDhMiles(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
