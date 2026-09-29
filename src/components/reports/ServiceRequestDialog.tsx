import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface LoadOption {
  orderId: string;
  loadNumber: string;
  underLoad: boolean | null;
  deliveryTime: string;
  deliveryLocation: string;
}

interface Preview {
  driverName: string;
  truckNumber: string;
  trailerNumber: string;
  suggestedUnderLoad: boolean | null;
  suggestedOrderId: string | null;
  loads: LoadOption[];
}

interface Props {
  truckId: string;
  driverId: string;
  driverName: string;
  truckNumber: string;
  trailerNumber: string;
  onClose: () => void;
}

const displayAppointment = (value: string) => value.replace("T", " ").slice(0, 16);

export function ServiceRequestDialog({ truckId, driverId, driverName, truckNumber, trailerNumber: initialTrailer, onClose }: Props) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sending, setSending] = useState(false);
  const [enteredDriverName, setEnteredDriverName] = useState(driverName);
  const [enteredTruckNumber, setEnteredTruckNumber] = useState(truckNumber);
  const [trailerNumber, setTrailerNumber] = useState(initialTrailer);
  const [repairInfo, setRepairInfo] = useState("");
  const [underLoad, setUnderLoad] = useState<boolean | null>(null);
  const [orderId, setOrderId] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase.functions.invoke<Preview>("send-service-request", {
      body: { action: "preview", truckId, driverId },
    }).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data || "error" in data) {
        setLoadError("Could not verify the current driver assignment. Refresh Reports and reopen this form.");
      } else {
        setPreview(data);
        setEnteredDriverName(data.driverName || driverName);
        setEnteredTruckNumber(data.truckNumber || truckNumber);
        setTrailerNumber(data.trailerNumber || initialTrailer);
        setUnderLoad(data.suggestedUnderLoad);
        if (data.suggestedOrderId) {
          const selected = data.loads.find((load) => load.orderId === data.suggestedOrderId);
          setOrderId(data.suggestedOrderId);
          setDeliveryTime(selected?.deliveryTime ? displayAppointment(selected.deliveryTime) : "");
          setDeliveryLocation(selected?.deliveryLocation || "");
        }
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setLoadError("Could not verify the current driver assignment. Refresh Reports and reopen this form.");
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [truckId, driverId, initialTrailer, driverName, truckNumber]);

  const selectLoad = (value: string) => {
    setOrderId(value === "manual" ? "" : value);
    const selected = preview?.loads.find((load) => load.orderId === value);
    setDeliveryTime(selected?.deliveryTime ? displayAppointment(selected.deliveryTime) : "");
    setDeliveryLocation(selected?.deliveryLocation || "");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loadError || underLoad === null || !enteredDriverName.trim() || !enteredTruckNumber.trim() || !repairInfo.trim() ||
        (underLoad && (!deliveryTime.trim() || !deliveryLocation.trim()))) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>("send-service-request", {
        body: {
          action: "send", truckId, driverId, trailerNumber: trailerNumber.trim(),
          driverName: enteredDriverName.trim(), truckNumber: enteredTruckNumber.trim(),
          repairInfo: repairInfo.trim(), underLoad, orderId: orderId || null,
          deliveryTime: underLoad ? deliveryTime.trim() : "",
          deliveryLocation: underLoad ? deliveryLocation.trim() : "",
        },
      });
      if (error || !data?.success) throw new Error(data?.error || "Email was not accepted. Please try again.");
      toast({ title: "Service request sent", description: "The request was emailed successfully." });
      onClose();
    } catch (error) {
      toast({ title: "Service request failed", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !sending) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" /> Service Request</DialogTitle>
          <DialogDescription>Describe the repair and confirm whether the driver is carrying a load.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="service-driver">Driver</Label><Input id="service-driver" value={enteredDriverName} onChange={(e) => setEnteredDriverName(e.target.value)} maxLength={120} required /></div>
            <div className="space-y-1"><Label htmlFor="service-truck">Truck</Label><Input id="service-truck" value={enteredTruckNumber} onChange={(e) => setEnteredTruckNumber(e.target.value)} maxLength={60} required /></div>
          </div>
          <div className="space-y-1"><Label htmlFor="service-trailer">Trailer</Label><Input id="service-trailer" value={trailerNumber} onChange={(e) => setTrailerNumber(e.target.value)} maxLength={60} placeholder="Not assigned (optional)" /></div>
          <div className="space-y-1"><Label htmlFor="service-repair">Repair info — describe the issue the driver is having</Label><Textarea id="service-repair" value={repairInfo} onChange={(e) => setRepairInfo(e.target.value)} maxLength={5000} rows={4} required /></div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Is the driver under a load?</legend>
            <div className="flex gap-2">
              <Button type="button" variant={underLoad === true ? "default" : "outline"} aria-pressed={underLoad === true} onClick={() => {
                if (!orderId && preview?.loads.length === 1) selectLoad(preview.loads[0].orderId);
                setUnderLoad(true);
              }}>Yes</Button>
              <Button type="button" variant={underLoad === false ? "default" : "outline"} aria-pressed={underLoad === false} onClick={() => setUnderLoad(false)}>No</Button>
            </div>
            <p className="text-xs text-muted-foreground">Under a load means freight has been picked up and has not been fully delivered or handed off. Confirm the suggested answer if records are incomplete.</p>
          </fieldset>
          {loading && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Checking current load…</p>}
          {loadError && <p role="alert" className="text-sm text-destructive">{loadError}</p>}
          {!loading && !loadError && underLoad === null && <p className="text-sm text-muted-foreground">Load records need confirmation. Choose Yes or No.</p>}
          {underLoad === true && (
            <div className="space-y-3 rounded-md border p-3">
              {!!preview?.loads.length && (
                <div className="space-y-1">
                  <Label htmlFor="service-load">Current load</Label>
                  <Select value={orderId || "manual"} onValueChange={selectLoad}>
                    <SelectTrigger id="service-load"><SelectValue placeholder="Select a load" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Enter delivery manually</SelectItem>
                      {preview.loads.map((load) => <SelectItem key={load.orderId} value={load.orderId}>Load {load.loadNumber}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1"><Label htmlFor="service-delivery-time">Delivery time (TMS local appointment)</Label><Input id="service-delivery-time" value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} maxLength={150} placeholder="MM/DD/YYYY HH:MM" required /></div>
              <div className="space-y-1"><Label htmlFor="service-delivery-location">Delivery location</Label><Input id="service-delivery-location" value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} maxLength={500} placeholder="Street, city, state" required /></div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={sending} onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading || !!loadError || sending || underLoad === null || !enteredDriverName.trim() || !enteredTruckNumber.trim() || !repairInfo.trim() || (underLoad && (!deliveryTime.trim() || !deliveryLocation.trim()))}>
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send Service Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
