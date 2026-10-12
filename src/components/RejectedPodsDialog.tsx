import { useEffect, useRef, useState } from "react";
import { FileX, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Rejection = Database["public"]["Tables"]["pod_rejections"]["Row"];
interface Scope { companyId?: string; excludedCompanyIds?: string }
const PAGE_SIZE = 50;
function documents(value: Json): { id: string; file_name: string; file_path: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(file => {
    if (!file || typeof file !== "object" || Array.isArray(file) || typeof file.id !== "string" || typeof file.file_name !== "string" || typeof file.file_path !== "string") return [];
    return [{ id: file.id, file_name: file.file_name, file_path: file.file_path }];
  });
}
export function RejectedPodsDialog(scope: Scope) {
  const { hasRole } = useAuthContext();
  if (!hasRole("accounting") && !hasRole("manager") && !hasRole("admin")) return null;
  return <RejectedPodsPopup {...scope} />;
}
function RejectedPodsPopup(scope: Scope) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button variant="outline" className="text-xs md:text-sm"><FileX className="h-4 w-4" />Rejected PODs</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] max-w-6xl overflow-y-auto">
      <DialogTitle>Rejected PODs</DialogTitle>
      <DialogDescription>Rejected documents for this load page, with the broker load number, dispatcher, reason, and reporter.</DialogDescription>
      {open && <RejectedPodsList {...scope} />}
    </DialogContent>
  </Dialog>;
}
function RejectedPodsList({ companyId, excludedCompanyIds }: Scope) {
  const [rows, setRows] = useState<Rejection[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Rejection | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteInProgress = useRef(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    const load = async () => {
      let query = supabase.from("pod_rejections").select("*", { count: "exact" })
        .is("deleted_at", null)
        .order("created_at", { ascending: false }).order("id", { ascending: false });
      if (companyId) query = query.eq("booked_by_company_id", companyId);
      else if (excludedCompanyIds) query = query.or(`booked_by_company_id.is.null,booked_by_company_id.not.in.(${excludedCompanyIds})`);
      const { data, count: total, error: queryError } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (queryError) throw queryError;
      if (!cancelled) { setRows(data || []); setCount(total || 0); }
    };
    load().catch(error => { if (!cancelled) setError(error.message || "Failed to load rejected PODs."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId, excludedCompanyIds, page, refresh]);
  const deleteReport = async () => {
    if (!pendingDelete || deleteInProgress.current) return;
    deleteInProgress.current = true;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-pod-message", { body: { action: "delete-rejection", rejectionId: pendingDelete.id } });
      if (error || !data?.success) {
        let message = data?.error || error?.message || "Failed to delete rejection report.";
        try { const detail = await error?.context?.json(); if (typeof detail?.error === "string") message = detail.error; } catch { /* Network errors have no JSON response. */ }
        throw new Error(message);
      }
      setPendingDelete(null);
      toast.success("Rejection report deleted");
      if (rows.length === 1 && page > 0) setPage(value => value - 1);
      else setRefresh(value => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete rejection report.");
    } finally {
      deleteInProgress.current = false;
      setDeleting(false);
    }
  };
  const openDocument = async (file: { id: string; file_path: string }) => {
    const target = window.open("", "_blank");
    if (!target) { toast.error("Please allow popups to preview the rejected POD."); return; }
    target.opener = null;
    setOpeningId(file.id);
    try {
      const { data, error } = await supabase.storage.from("order-files").createSignedUrl(file.file_path, 3600);
      if (error || !data?.signedUrl) throw new Error("The rejected POD is no longer available.");
      target.location.href = data.signedUrl;
    } catch (error) {
      target.close(); toast.error(error instanceof Error ? error.message : "Failed to open POD.");
    } finally { setOpeningId(null); }
  };
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{count} rejection report{count === 1 ? "" : "s"}</p>
      <Button variant="outline" size="sm" onClick={() => setRefresh(value => value + 1)} disabled={loading}><RefreshCw className="h-4 w-4" />Refresh</Button>
    </div>
    {loading ? <div role="status" className="flex h-40 items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Loading rejected PODs…</div>
      : error ? <p role="alert" className="text-destructive">{error}</p>
      : !rows.length ? <p className="rounded-md border p-8 text-center text-muted-foreground">No rejected PODs for this load page.</p>
      : <Table><TableHeader><TableRow>
        <TableHead>Rejected PODs</TableHead><TableHead>Broker load number</TableHead><TableHead>Dispatcher</TableHead><TableHead>Reason</TableHead><TableHead>Reported by</TableHead><TableHead>Actions</TableHead>
      </TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.id}>
        <TableCell className="max-w-56 align-top"><div className="flex flex-col items-start gap-1">{documents(row.pods).map(file =>
          <Button key={file.id} variant="link" size="sm" className="h-auto max-w-full whitespace-normal break-all px-0 text-left" disabled={openingId !== null} onClick={() => openDocument(file)}>
            {openingId === file.id && <Loader2 className="h-4 w-4 animate-spin" />}{file.file_name}
          </Button>)}</div></TableCell>
        <TableCell className="align-top font-medium">{row.broker_load_number || "—"}</TableCell>
        <TableCell className="min-w-40 align-top">{row.dispatcher_name || "—"}</TableCell>
        <TableCell className="min-w-56 max-w-md whitespace-pre-wrap break-words align-top">{row.reason}</TableCell>
        <TableCell className="min-w-40 align-top"><p>{row.reporter_name}</p><p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("en-US", { timeZone: "America/Chicago" })}</p>
          {row.notification_status !== "sent" && <p className="text-xs text-destructive">{row.notification_status === "failed" ? "Email not confirmed" : "Email pending"}</p>}
        </TableCell>
        <TableCell className="align-top"><Button variant="outline" size="icon" aria-label={`Delete rejection for load ${row.broker_load_number || row.order_id}`} title="Delete rejection report" disabled={deleting} onClick={() => setPendingDelete(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
      </TableRow>)}</TableBody></Table>}
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>Previous</Button>
      <span className="text-sm">Page {page + 1} of {Math.max(1, Math.ceil(count / PAGE_SIZE))}</span>
      <Button variant="outline" size="sm" disabled={loading || (page + 1) * PAGE_SIZE >= count} onClick={() => setPage(value => value + 1)}>Next</Button>
    </div>
    <AlertDialog open={pendingDelete !== null} onOpenChange={open => { if (!open && !deleting) setPendingDelete(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Delete rejection report?</AlertDialogTitle><AlertDialogDescription>
          Remove the rejection report for load {pendingDelete?.broker_load_number || pendingDelete?.order_id} from the list? The original POD documents will stay on the load.
        </AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel><Button variant="destructive" onClick={deleteReport} disabled={deleting}>
          {deleting && <Loader2 className="h-4 w-4 animate-spin" />}{deleting ? "Deleting…" : "Delete report"}
        </Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
