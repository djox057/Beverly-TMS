import { compareLoadsByPickupAndAvailability } from "@/utils/prebookLoadSort";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { useRecoveryLoadsRealtime } from "@/hooks/useRecoveryLoadsRealtime";
import { useDebounce } from "@/hooks/useDebounce";
import { getOrderFileSignedUrl } from "@/utils/orderFileSignedUrl";
import { useToast } from "@/hooks/use-toast";
import { AssignRecoveryLoadDialog } from "@/components/recovery/AssignRecoveryLoadDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { RecoveryLoadsStats } from "@/components/recovery/RecoveryLoadsStats";

interface Stop {
  type: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  sequence_number: number | null;
}

interface RetrievalOrder {
  id: string;
  retrieval: boolean;
  prebook: boolean;
  prebook_note: string | null;
  status: string | null;
  p_status: string;
  truck: { truck_number: string } | null;
  trailer: { trailer_number: string } | null;
  driver1: { name: string; dispatcher_id: string | null; dispatcher_name?: string } | null;
  driver2: { name: string } | null;
  broker_load_number: string | null;
  freight_amount: number | null;
  loaded_miles: number | null;
  canceled: boolean | null;
  booked_by: string | null;
  pickup_datetime: string | null;
  pickup_end_datetime: string | null;
  delivery_datetime: string | null;
  recovery_auto_cancel_at: string | null;
  broker: { name: string | null } | null;
  booked_by_company: { name: string | null } | null;
  pickup_drops: Stop[] | null;
  order_files:
    | { id: string; file_category: string | null; file_name: string | null; file_path: string }[]
    | null;
}

// City, ST only
const formatStop = (stop?: Stop | null) => {
  if (!stop) return "—";
  const parts = [stop.city, stop.state].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
};

const formatFullStop = (stop?: Stop | null) => {
  if (!stop) return "—";
  const parts = [stop.address, stop.city, stop.state, stop.zip_code].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  // Stored values are Chicago wall-time (often with a +00 offset) — read them naively.
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return "—";
  return `${m[2]}/${m[3]} ${m[4]}:${m[5]}`;
};

// Auto-cancel deadlines are true UTC timestamps — render them in Chicago time.
const formatChicago = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

// Trim legal suffixes so "C.H. ROBINSON COMPANY, LLC" renders as "C.H. ROBINSON"
const shortenBrokerName = (name?: string | null) => {
  if (!name) return "—";
  let out = name.trim();
  out = out.replace(
    /[\s,.-]+(?:L\.?L\.?C\.?|L\.?L\.?P\.?|INC\.?|INCORPORATED|CORP\.?|CORPORATION|CO\.?|COMPANY|LTD\.?|LIMITED|PLC|LP|PC|USA|GROUP|HOLDINGS?|ENTERPRISES?|LOGISTICS|TRANSPORTATION|TRANSPORT|TRUCKING|FREIGHT|BROKERAGE|SERVICES?|SOLUTIONS)\b\.?/gi,
    ""
  );
  out = out.replace(/[\s,.-]+$/, "").trim();
  return out || name.trim();
};

const RecoveryLoads = () => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("prebook");
  const [statusOrderId, setStatusOrderId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const [noteOrder, setNoteOrder] = useState<{ id: string; loadNumber: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [assignOrder, setAssignOrder] = useState<{
    id: string;
    loadNumber: string;
    pickupAddress: string;
    prebook: boolean;
  } | null>(null);
  const { hasRole, profile } = useAuth();
  const canSeeStats = hasRole("manager") || hasRole("admin");
  const canAssignAny = hasRole("manager") || hasRole("admin");
  const myName = (profile?.full_name || "").trim().toLowerCase();
  const { toast } = useToast();

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["recovery-loads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `id, broker_load_number, freight_amount, loaded_miles, canceled, booked_by, retrieval, prebook, prebook_note, status, p_status, recovery_assigned, recovery_auto_cancel_at,
           pickup_datetime, pickup_end_datetime, delivery_datetime,
           truck:trucks!orders_truck_id_fkey ( truck_number ),
           trailer:trailers!orders_trailer_id_fkey ( trailer_number ),
           driver1:drivers!orders_driver1_id_fkey ( name, dispatcher_id ),
           driver2:drivers!orders_driver2_id_fkey ( name ),
           broker:brokers ( name ),
           booked_by_company:companies!orders_booked_by_company_id_fkey ( name ),
           pickup_drops ( type, address, city, state, zip_code, sequence_number ),
           order_files ( id, file_category, file_name, file_path )`
        )
        .or("retrieval.eq.true,recovery_assigned.eq.true,prebook.eq.true")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const loads = (data || []) as unknown as RetrievalOrder[];
      const dispatcherIds = [...new Set(loads.map(load => load.driver1?.dispatcher_id).filter((id): id is string => !!id))];
      if (dispatcherIds.length) {
        const { data: dispatchers, error: dispatcherError } = await supabase.from("profiles").select("user_id, full_name").in("user_id", dispatcherIds);
        if (dispatcherError) throw dispatcherError;
        const names = new Map((dispatchers || []).map(person => [person.user_id, person.full_name]));
        loads.forEach(load => { if (load.driver1) load.driver1.dispatcher_name = names.get(load.driver1.dispatcher_id || "") || "—"; });
      }
      return loads;
    },
    staleTime: 30000,
    // Realtime handles changes; keep a slow fallback for missed events.
    refetchInterval: 120000,
    refetchIntervalInBackground: false,
  });

  useRecoveryLoadsRealtime(orders);

  const rows = useMemo(() => {
    return orders.map((order) => {
      const stops = [...(order.pickup_drops || [])].sort(
        (a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0)
      );
      const pickup = stops.find((s) => s.type === "pickup") || stops[0];
      const deliveries = stops.filter((s) => s.type === "delivery");
      const delivery = deliveries[deliveries.length - 1] || stops[stops.length - 1];
      const rpm =
        order.freight_amount && order.loaded_miles
          ? order.freight_amount / order.loaded_miles
          : null;

      return {
        id: order.id,
        loadNumber: order.broker_load_number || "—",
        pickupAddress: formatStop(pickup),
        deliveryAddress: formatStop(delivery),
        pickupFullAddress: formatFullStop(pickup),
        pickupDatetime: order.pickup_end_datetime || order.pickup_datetime,
        deliveryDatetime: order.delivery_datetime,
        bookedBy: order.booked_by || "—",
        rcFile: (order.order_files || []).find((f) => f.file_category === "RC") || null,
        freightAmount: order.freight_amount,
        rpm,
        loadedMiles: order.loaded_miles,
        bookedByCompany: order.booked_by_company?.name || "—",
        brokerName: shortenBrokerName(order.broker?.name),
        canceled: !!order.canceled,
        autoCancelAt: order.recovery_auto_cancel_at,
        retrieval: !!order.retrieval,
        prebook: !!order.prebook,
        prebookNote: order.prebook_note || "",
        hasPod: (order.order_files || []).some(file => file.file_category === "POD"),
        recovered: !!(order as RetrievalOrder & { recovery_assigned?: boolean }).recovery_assigned,
        pStatus: order.canceled ? "Canceled" : order.p_status || "Available",
        status: order.canceled ? "Canceled" : (order.order_files || []).some(file => file.file_category === "POD") ? "Completed" : order.p_status === "Covered" && (order.order_files || []).some(file => file.file_category === "BOL") ? "Loaded" : order.p_status || "Available",
        assignment: { truck: order.truck?.truck_number, trailer: order.trailer?.trailer_number, driver1: order.driver1?.name, driver2: order.driver2?.name, dispatcher: order.driver1?.dispatcher_name },
      };
    });
  }, [orders]);

  const filteredRows = useMemo(() => {
    const activeRows = rows.filter((r) => activeTab === "stats" ? r.prebook : activeTab === "prebook" ? r.prebook && !r.canceled && !r.hasPod : !r.canceled && r.retrieval && !r.prebook).sort(compareLoadsByPickupAndAvailability);
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return activeRows;
    return activeRows.filter((row) =>
      [
        row.loadNumber,
        row.pickupAddress,
        row.deliveryAddress,
        row.bookedBy,
        row.bookedByCompany,
        row.brokerName,
        ...(activeTab !== "recovery" ? [row.status, row.prebookNote] : []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, debouncedSearch, activeTab]);

  const handleOpenRc = async (file: {
    id: string;
    file_category: string | null;
    file_name: string | null;
    file_path: string;
  } | null, orderId: string) => {
    return handleOpenRcImpl(file, orderId);
  };

  const updateDeadline = async (orderId: string, minutesFromNow: number | null) => {
    const value = minutesFromNow == null ? null : new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("orders")
      .update({ recovery_auto_cancel_at: value } as never)
      .eq("id", orderId);
    if (error) {
      toast({ title: "Could not update deadline", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: value ? "Deadline updated" : "Deadline cleared" });
    refetch();
  };

  const handleOpenRcImpl = async (file: {
    id: string;
    file_category: string | null;
    file_name: string | null;
    file_path: string;
  } | null, orderId: string) => {
    if (!file) {
      toast({ title: "No RC", description: "This load has no RC file uploaded.", variant: "destructive" });
      return;
    }
    const { signedUrl } = await getOrderFileSignedUrl({
      id: file.id,
      order_id: orderId,
      file_category: file.file_category || "RC",
      file_name: file.file_name || "rc",
      file_path: file.file_path,
    });
    if (signedUrl) window.open(signedUrl, "_blank");
    else toast({ title: "Could not open RC", variant: "destructive" });
  };

  const savePrebookNote = async (id: string, note: string) => {
    if (!canAssignAny || savingNote) return;
    setSavingNote(true);
    try {
      const { data, error } = await supabase.from("orders").update({ prebook_note: note || null }).eq("id", id).select("id");
      if (error || !data?.length) {
        toast({ title: "Could not save note", description: error?.message || "Check your permissions and try again.", variant: "destructive" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["recovery-loads"] });
      toast({ title: "Note saved" });
      setNoteOrder(null);
    } catch (error) {
      toast({ title: "Could not save note", description: (error as Error).message, variant: "destructive" });
    } finally { setSavingNote(false); }
  };

  const statusRow = rows.find(row => row.id === statusOrderId);
  const saveStatus = async () => {
    if (!canAssignAny || !statusOrderId || !statusDraft.trim() || savingStatus) return;
    setSavingStatus(true);
    try {
      const { data, error } = await supabase.from("orders").update({ p_status: statusDraft }).eq("id", statusOrderId).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Status was not saved. Check your permissions.");
      await queryClient.invalidateQueries({ queryKey: ["recovery-loads"] });
      setStatusOrderId(null);
      toast({ title: "Status saved" });
    } catch (error) { toast({ title: "Could not save status", description: (error as Error).message, variant: "destructive" }); }
    finally { setSavingStatus(false); }
  };

  const loadsView = (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search load#, address, broker, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card className="overflow-x-auto">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Load#</TableHead>
              <TableHead className="w-[130px]">Pickup</TableHead>
              <TableHead className="w-[95px]">PU Date</TableHead>
              <TableHead className="w-[130px]">Delivery</TableHead>
              <TableHead className="w-[95px]">DEL Date</TableHead>
              <TableHead className="w-[95px]">Freight</TableHead>
              <TableHead className="w-[65px]">Miles</TableHead>
              <TableHead className="w-[150px]">{activeTab !== "recovery" ? "Status" : "Booked By"}</TableHead>
              <TableHead className="w-[160px]">Booked By Company</TableHead>
              <TableHead className="w-[130px]">Broker</TableHead>
              <TableHead className="w-[150px]">{activeTab !== "recovery" ? "Note" : "Cancels At"}</TableHead>
              <TableHead className="w-[60px]">RC</TableHead>
              {(activeTab === "recovery" || (activeTab === "prebook" && canAssignAny)) && <TableHead className="w-[90px]">Assign</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={activeTab === "stats" || (activeTab === "prebook" && !canAssignAny) ? 12 : 13} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={activeTab === "stats" || (activeTab === "prebook" && !canAssignAny) ? 12 : 13} className="text-center text-muted-foreground py-8">
                  No {activeTab !== "recovery" ? "prebook" : "recovery"} loads found.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="truncate" title={row.loadNumber}>
                    <div className="font-medium truncate">{row.loadNumber}</div>
                    {activeTab !== "recovery" && <div className="text-xs text-muted-foreground truncate" title={row.bookedBy}>{row.bookedBy}</div>}
                  </TableCell>
                  <TableCell className="whitespace-normal break-words text-sm">
                    {row.pickupAddress}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDateTime(row.pickupDatetime)}</TableCell>
                  <TableCell className="whitespace-normal break-words text-sm">
                    {row.deliveryAddress}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDateTime(row.deliveryDatetime)}</TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {row.freightAmount != null ? formatCurrency(row.freightAmount) : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.rpm != null ? `${row.rpm.toFixed(2)} RPM` : "— RPM"}
                    </div>
                  </TableCell>
                  <TableCell>{row.loadedMiles ?? "—"}</TableCell>
                  <TableCell className="truncate capitalize" title={activeTab !== "recovery" ? row.status : row.bookedBy}>
                    {activeTab !== "recovery" ? <button type="button" className={`block w-full truncate text-left hover:underline rounded px-1 ${row.status === "Loaded" ? "text-sky-700 dark:text-sky-200" : row.status === "Available" ? "text-green-700 dark:text-green-200" : row.status === "Covered" ? "text-red-700 dark:text-red-200" : ""}`} aria-label={`View status for ${row.loadNumber}`} onClick={() => { setStatusOrderId(row.id); setStatusDraft(row.pStatus); }}>{row.status}</button> : row.bookedBy}
                  </TableCell>
                  <TableCell className="truncate">{row.bookedByCompany}</TableCell>
                  <TableCell className="truncate" title={row.brokerName}>
                    {row.brokerName}
                  </TableCell>
                  <TableCell className="text-sm">
                    {activeTab !== "recovery" ? (
                      <button
                        type="button"
                        className="block w-full truncate text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        aria-label={`View prebook note for ${row.loadNumber}`}
                        onClick={() => { setNoteOrder({ id: row.id, loadNumber: row.loadNumber }); setNoteDraft(row.prebookNote); }}
                      >
                        {row.prebookNote || (canAssignAny ? "Add note…" : "—")}
                      </button>
                    ) : (<>
                    {row.autoCancelAt ? (
                      <div
                        className={
                          new Date(row.autoCancelAt).getTime() <= Date.now()
                            ? "text-destructive font-medium"
                            : new Date(row.autoCancelAt).getTime() - Date.now() < 60 * 60 * 1000
                            ? "text-amber-600 font-medium"
                            : ""
                        }
                      >
                        {formatChicago(row.autoCancelAt)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {canAssignAny && (
                      <div className="flex gap-1 pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1 text-xs"
                          onClick={() => updateDeadline(row.id, 120)}
                        >
                          +2h
                        </Button>
                        {row.autoCancelAt && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1 text-xs"
                            onClick={() => updateDeadline(row.id, null)}
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    )}
                    </>)}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!row.rcFile}
                      onClick={() => handleOpenRc(row.rcFile, row.id)}
                    >
                      RC
                    </Button>
                  </TableCell>
                  {(activeTab === "recovery" || (activeTab === "prebook" && canAssignAny)) && <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canAssignAny && (!myName || row.bookedBy.trim().toLowerCase() !== myName)}
                      title={
                        !canAssignAny && (!myName || row.bookedBy.trim().toLowerCase() !== myName)
                          ? "Only the dispatcher who booked this load can assign it"
                          : undefined
                      }
                      onClick={() =>
                        setAssignOrder({
                          id: row.id,
                          loadNumber: row.loadNumber,
                          pickupAddress: row.pickupFullAddress,
                          prebook: row.prebook,
                        })
                      }
                    >
                      {row.prebook && row.assignment.truck && row.assignment.driver1 ? "Assigned" : "Assign"}
                    </Button>
                  </TableCell>}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!noteOrder} onOpenChange={open => { if (!open && !savingNote) setNoteOrder(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prebook note · {noteOrder?.loadNumber}</DialogTitle>
            <DialogDescription>{canAssignAny ? "Edit the note and save your changes." : "Full note for this load."}</DialogDescription>
          </DialogHeader>
          {canAssignAny ? (
            <Textarea aria-label="Prebook note" value={noteDraft} onChange={event => setNoteDraft(event.target.value)} disabled={savingNote} className="min-h-[180px]" />
          ) : <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap break-words text-sm">{noteDraft || "No note."}</div>}
          {canAssignAny && <DialogFooter><Button disabled={savingNote} onClick={() => noteOrder && savePrebookNote(noteOrder.id, noteDraft)}>{savingNote ? "Saving…" : "Save note"}</Button></DialogFooter>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!statusOrderId} onOpenChange={open => { if (!open && !savingStatus) setStatusOrderId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Prebook status · {statusRow?.loadNumber}</DialogTitle><DialogDescription>Current status and load assignment.</DialogDescription></DialogHeader>
          {statusRow?.assignment.truck && statusRow.assignment.driver1 && <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt>Truck #</dt><dd>{statusRow.assignment.truck}</dd>
            <dt>Trailer #</dt><dd>{statusRow.assignment.trailer || "—"}</dd>
            <dt>Driver 1</dt><dd>{statusRow.assignment.driver1}</dd>
            {statusRow.assignment.driver2 && <><dt>Driver 2</dt><dd>{statusRow.assignment.driver2}</dd></>}
            <dt>Dispatcher</dt><dd>{statusRow.assignment.dispatcher || "—"}</dd>
          </dl>}
          {canAssignAny && !statusRow?.canceled && !statusRow?.hasPod ? <select aria-label="Prebook status" value={statusDraft} onChange={event => setStatusDraft(event.target.value)} disabled={savingStatus} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="Available">Available</option><option value="Covered">Covered</option>
          </select> : <p>{statusRow?.status}</p>}
          {canAssignAny && !statusRow?.canceled && !statusRow?.hasPod && <DialogFooter><Button disabled={savingStatus || !statusDraft.trim()} onClick={saveStatus}>{savingStatus ? "Saving…" : "Save status"}</Button></DialogFooter>}
        </DialogContent>
      </Dialog>

      <AssignRecoveryLoadDialog
        open={!!assignOrder}
        onOpenChange={(open) => !open && setAssignOrder(null)}
        orderId={assignOrder?.id ?? null}
        isPrebook={assignOrder?.prebook}
        loadNumber={assignOrder?.loadNumber}
        pickupAddress={assignOrder?.pickupAddress}
        onAssigned={() => refetch()}
      />
    </>
  );

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Recovery Loads &amp; Prebook</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="prebook">Prebook loads</TabsTrigger>
          <TabsTrigger value="recovery">Recovery loads</TabsTrigger>
          {canSeeStats && <TabsTrigger value="stats">Statistics</TabsTrigger>}
        </TabsList>
        <TabsContent value="prebook" className="space-y-4">{loadsView}</TabsContent>
        <TabsContent value="recovery" className="space-y-4">{loadsView}</TabsContent>
        {canSeeStats && <TabsContent value="stats" className="space-y-4"><RecoveryLoadsStats isLoading={isLoading} rows={rows.map(r => ({ canceled: r.canceled, freightAmount: r.freightAmount, bookedByCompany: r.bookedByCompany, prebook: r.prebook, recovered: r.recovered, covered: r.pStatus === "Covered", completed: r.hasPod }))} /><h2 className="text-lg font-semibold">All Prebook loads</h2>{loadsView}</TabsContent>}
      </Tabs>
    </div>
  );
};

export default RecoveryLoads;
