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
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { useToast } from "@/hooks/use-toast";
import { calculateDhMiles, geocodeAddress } from "@/utils/mapboxRouteCalculator";
import { suggestedPrebookTrucks } from "@/utils/truckProximity";
import { getCompanySuffix } from "@/utils/formatInternalLoadNumber";
import { useHosAssessment, checkCreatedOrderHos } from "@/hooks/useHosAssessment";
import { HosLoadLight } from "@/components/HosLoadLight";
import { previousDelivery } from "@/utils/previousDelivery";

const YARD_COORDS = "41.53782517269106,-87.57865749016162";

interface AssignRecoveryLoadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string | null;
  loadNumber?: string;
  pickupAddress?: string;
  onAssigned?: () => void;
  isPrebook?: boolean;
}

export function AssignRecoveryLoadDialog({
  open,
  onOpenChange,
  orderId,
  loadNumber,
  pickupAddress,
  onAssigned,
  isPrebook = false,
}: AssignRecoveryLoadDialogProps) {
  const { toast } = useToast();
  const [truckId, setTruckId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [trailerId, setTrailerId] = useState("");
  const [driverRate, setDriverRate] = useState("");
  const [dhMiles, setDhMiles] = useState("");
  const [saving, setSaving] = useState(false);
  const [calculatingDh, setCalculatingDh] = useState(false);
  const [suggestedOnly, setSuggestedOnly] = useState(false);

  useEffect(() => {
    if (open) {
      setTruckId("");
      setDriverId("");
      setTrailerId("");
      setDriverRate("");
      setDhMiles("");
      setCalculatingDh(false);
      setSuggestedOnly(false);
    }
  }, [open, orderId]);

  const { data: trucks = [] } = useQuery({
    queryKey: ["recovery-assign-trucks", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trucks")
        .select("id, truck_number, driver1_id, driver2_id, trailer_id, company:companies!trucks_company_id_fkey(name)")
        .eq("is_active", true)
        .order("truck_number");
      if (error) throw error;
      return data || [];
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

  const { data: hosOrder, isFetching: loadingHosOrder, error: hosOrderError } = useQuery({
    queryKey: ['hos-prebook-order', orderId],
    enabled: open && isPrebook && !!orderId,
    queryFn: async () => {
      const {data,error} = await supabase.from('orders')
        .select('loaded_miles,pickup_drops(type,datetime,end_datetime,latitude,longitude,sequence_number)').eq('id',orderId!).single();
      if(error) throw error;
      return data;
    },
    staleTime: 30000,
  });
  const hos = useHosAssessment(hosOrder ? {
    orderId, driverId:driverId||null, truckId:truckId||null,
    teamDriverId:trucks.find((t:any)=>t.id===truckId)?.driver2_id||null,
    dhMiles:dhMiles.trim()?Number(dhMiles):null,
    loadedMiles:hosOrder.loaded_miles==null?null:Number(hosOrder.loaded_miles),
    stops:[...(hosOrder.pickup_drops||[])].sort((a:any,b:any)=>(a.sequence_number||0)-(b.sequence_number||0))
      .map((s:any)=>({type:s.type,datetime:s.datetime,end_datetime:s.end_datetime,latitude:s.latitude,longitude:s.longitude})),
  } : null, open && isPrebook);

  const firstPickup = useMemo(() => [...(hosOrder?.pickup_drops || [])]
    .filter(stop => stop.type === 'pickup').sort((a, b) => a.sequence_number - b.sequence_number)[0], [hosOrder]);
  const { data: suggestions = [], isFetching: loadingSuggestions, error: suggestionsError } = useQuery({
    queryKey: ['prebook-suggested-trucks', orderId, firstPickup, pickupAddress],
    enabled: open && isPrebook && suggestedOnly && !!firstPickup?.datetime,
    queryFn: async () => {
      const pickup = firstPickup!;
      const coords = pickup.latitude != null && pickup.longitude != null
        ? { lat: Number(pickup.latitude), lon: Number(pickup.longitude) }
        : await geocodeAddress(pickupAddress || '');
      if (!coords) throw new Error('Pickup location is unavailable.');
      // Limit the embedded relation per truck, rather than downloading fleet load history.
      const { data, error } = await supabase.from('trucks')
        .select('id,orders!orders_truck_id_fkey(delivery_datetime,delivery_end_datetime,pickup_drops(type,datetime,end_datetime,latitude,longitude,sequence_number))')
        .eq('is_active', true).not('driver1_id', 'is', null)
        .eq('orders.canceled', false).neq('orders.id', orderId!)
        .or('notes.is.null,notes.neq.GAME|OVER', { referencedTable: 'orders' })
        .not('orders.driver1_id', 'is', null)
        .lte('orders.pickup_datetime', pickup.datetime!)
        .order('pickup_datetime', { referencedTable: 'orders', ascending: false })
        .order('id', { referencedTable: 'orders', ascending: false })
        .limit(1, { referencedTable: 'orders' });
      if (error) throw error;
      return suggestedPrebookTrucks(data || [], coords, pickup.datetime!);
    },
    staleTime: 30000,
    retry: false,
  });

  const truckOptions = useMemo(
    () => {
      const names = new Map(drivers.map((driver) => [driver.id, driver.name]));
      return trucks.map((truck) => {
        const driverNames = [truck.driver1_id, truck.driver2_id]
          .filter((id, index, ids) => id && ids.indexOf(id) === index)
          .map((id) => names.get(id!)).filter(Boolean).join(" / ");
        const company = getCompanySuffix(truck.company?.name);
        return { value: truck.id, label: `${company ? `${company} ` : ""}${truck.truck_number || "—"}${driverNames ? ` - ${driverNames}` : ""}` };
      });
    },
    [trucks, drivers]
  );
  const driverOptions = useMemo(
    () => drivers.map((d: any) => ({ value: d.id, label: d.name || "—" })),
    [drivers]
  );
  const visibleTruckOptions = suggestedOnly && isPrebook
    ? suggestions.flatMap(suggestion => {
      const option = truckOptions.find(truck => truck.value === suggestion.id);
      return option ? [{ ...option, label: `${option.label} · ~${suggestion.miles} mi` }] : [];
    }) : truckOptions;
  const trailerOptions = useMemo(
    () => trailers.map((t: any) => ({ value: t.id, label: t.trailer_number || "—" })),
    [trailers]
  );

  // Autofill driver + trailer from the selected truck
  const handleTruckChange = (nextTruckId: string) => {
    setTruckId(nextTruckId);
    const truck = trucks.find((t: any) => t.id === nextTruckId) as any;
    setDriverId(truck?.driver1_id || "");
    setTrailerId(truck?.trailer_id || "");
    setDhMiles("");
    setCalculatingDh(false);
  };

  // Auto-calculate DH miles from the assigned driver's last delivery to this load's pickup
  useEffect(() => {
    if (!open || !driverId) return;
    let cancelled = false;

    const run = async () => {
      const pickup = (pickupAddress || "").trim();
      if (!pickup || pickup === "—") return;
      setCalculatingDh(true);
      try {
        const targetPickup = [...(hosOrder?.pickup_drops||[])].filter((p:any)=>p.type==='pickup')
          .sort((a:any,b:any)=>(a.sequence_number||0)-(b.sequence_number||0))[0]?.datetime || new Date().toISOString();
        const { data: lastOrders } = await supabase
          .from("orders")
          .select(
            "id, delivery_datetime, delivery_end_datetime, pickup_drops ( type, address, city, state, zip_code, sequence_number )"
          )
          .eq("driver1_id", driverId)
          .eq("canceled", false)
          .neq("id", orderId || "")
          .not("delivery_datetime", "is", null)
          .lte("delivery_datetime", targetPickup)
          .order("delivery_datetime", { ascending: false })
          .limit(100);

        let origin = YARD_COORDS;
        const stops = (previousDelivery(lastOrders||[],targetPickup) as any)?.pickup_drops || [];
        const deliveries = [...stops]
          .filter((s: any) => s.type === "delivery")
          .sort((a: any, b: any) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
        const last = deliveries[deliveries.length - 1];
        if (last) {
          const parts = [last.address, last.city, last.state, last.zip_code].filter(Boolean);
          if (parts.length > 0) origin = parts.join(", ");
        }

        const miles = await calculateDhMiles(origin, pickup);
        if (!cancelled && miles !== null) setDhMiles(String(miles));
      } finally {
        if (!cancelled) setCalculatingDh(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [open, truckId, driverId, orderId, pickupAddress, hosOrder]);

  const handleSave = async () => {
    if (!orderId) return;
    if (isPrebook && (!truckId || !driverId)) {
      toast({ title: "Select a truck and driver", variant: "destructive" });
      return;
    }
    setSaving(true);

    const truck = trucks.find((t: any) => t.id === truckId) as any;

    // Booked by becomes the dispatcher of the assigned driver/truck
    let bookedBy: string | null = null;
    const dispatcherLookupDriverId = driverId || truck?.driver1_id || null;
    if (dispatcherLookupDriverId) {
      const { data: driverRow, error: driverError } = await supabase
        .from("drivers")
        .select("dispatcher_id")
        .eq("id", dispatcherLookupDriverId)
        .maybeSingle();
      if (driverError) {
        setSaving(false);
        toast({ title: "Assignment failed", description: driverError.message, variant: "destructive" });
        return;
      }
      const dispatcherId = driverRow?.dispatcher_id;
      if (dispatcherId) {
        const { data: prof, error: profileError } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", dispatcherId)
          .maybeSingle();

        if (profileError) {
          setSaving(false);
          toast({ title: "Assignment failed", description: profileError.message, variant: "destructive" });
          return;
        }
        bookedBy = prof?.full_name?.trim() || null;
      }
    }

    if (isPrebook && !bookedBy) {
      setSaving(false);
      toast({
        title: "Driver has no dispatcher",
        description: "Set the driver's dispatcher before assigning this prebook load.",
        variant: "destructive",
      });
      return;
    }

    const payload: Record<string, unknown> = {
      truck_id: truckId || null,
      driver1_id: driverId || null,
      driver2_id: truck?.driver2_id ?? null,
      trailer_id: trailerId || null,
      driver_price: driverRate ? parseFloat(driverRate) : null,
      dh_miles: dhMiles ? parseInt(dhMiles, 10) : null,
      retrieval: false,
      prebook: isPrebook,
      ...(isPrebook ? { p_status: "Covered" } : {}),
      recovery_assigned: !isPrebook,
      recovery_auto_cancel_at: null,
      recovery_cancel_payload: null,
    };
    if (bookedBy) payload.booked_by = bookedBy;

    const { data: updated, error } = await supabase
      .from("orders")
      .update(payload as never)
      .eq("id", orderId)
      .select("id");
    setSaving(false);

    if (error || !updated?.length) {
      toast({
        title: "Assignment failed",
        description: error?.message || "The load was not updated. Check your permissions.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Assigned", description: `Load ${loadNumber || ""} updated.` });
    if (isPrebook) void checkCreatedOrderHos(orderId);
    onOpenChange(false);
    onAssigned?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Assign {isPrebook ? "Prebook" : "Recovery"} Load {loadNumber ? `#${loadNumber}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Truck #</Label>
            <Combobox
              options={visibleTruckOptions}
              value={truckId}
              selectedLabel={truckOptions.find(truck => truck.value === truckId)?.label}
              onValueChange={handleTruckChange}
              placeholder="Select truck"
              searchPlaceholder="Search truck# or driver..."
              modal={false}
              preserveOrder={suggestedOnly}
              emptyText={loadingSuggestions ? 'Finding suggested trucks…' : suggestionsError ? 'Could not load suggested trucks.' : suggestedOnly ? 'No trucks within 150 miles for this pickup.' : 'No results found.'}
              dropdownHeader={isPrebook ? <div className="space-y-1 border-b px-3 py-2">
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>Suggested</span>
                  <Switch aria-label="Suggested trucks" checked={suggestedOnly} onCheckedChange={setSuggestedOnly} />
                </label>
                <p className="text-xs text-muted-foreground">
                  {suggestedOnly && loadingSuggestions ? 'Finding nearby trucks…' : suggestedOnly && suggestionsError ? 'Could not load suggestions. Toggle off to view all trucks.' : suggestedOnly && !firstPickup?.datetime ? 'Pickup date is unavailable.' : `Within 150 mi${firstPickup?.datetime ? ` · Pickup ${firstPickup.datetime.slice(5, 10).replace('-', '/')}` : ''} · Closest first`}
                </p>
              </div> : undefined}
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
                placeholder={calculatingDh ? "Calculating..." : "0"}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {isPrebook && <HosLoadLight {...hos} error={hosOrderError || hos.error} loading={loadingHosOrder || hos.loading || calculatingDh} />}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
