import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Edit, ExternalLink, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface PodPreview {
  loadNumber: string;
  files: { id: string; file_name: string; content_type: string | null; url: string | null }[];
  recipients: { to: string; bookerName: string; replyTo: string[] } | null;
  recipientError: string | null;
}
async function invokePodMessage(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("send-pod-message", { body });
  if (error) {
    let message = error.message;
    try {
      const detail = await error.context?.json();
      if (typeof detail?.error === "string") message = detail.error;
    } catch { /* Network failures have no JSON response. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Only mount the document fetch and preview when a permitted user opens a row. */
export function PodColumnPopup({ loadId }: { loadId: string }) {
  const { hasRole } = useAuthContext();
  if (!hasRole("accounting") && !hasRole("manager") && !hasRole("admin")) return null;
  return <PodPopup loadId={loadId} />;
}
function PodPopup({ loadId }: { loadId: string }) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  return <Dialog open={open} onOpenChange={value => { if (!sending) setOpen(value); }}>
    <DialogTrigger asChild>
      <Button type="button" variant="outline" size="sm" className="absolute right-0 top-0 h-8 w-6 rounded-l-none px-0"
        title="Preview and send PODs" aria-label={`Preview PODs for load ${loadId}`}>
        <Edit className="h-4 w-4" />
      </Button>
    </DialogTrigger>
    <DialogContent className="max-h-[95dvh] max-w-3xl overflow-y-auto">
      <DialogTitle>POD preview &amp; message</DialogTitle>
      <DialogDescription>Review the PODs, select attachments, and send a message to the user who booked this load.</DialogDescription>
      {open && <PodMessageContent loadId={loadId} onSent={() => setOpen(false)} onSendingChange={setSending} />}
    </DialogContent>
  </Dialog>;
}
function PodMessageContent({ loadId, onSent, onSendingChange }: {
  loadId: string; onSent: () => void; onSendingChange: (value: boolean) => void;
}) {
  const [preview, setPreview] = useState<PodPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [imageError, setImageError] = useState(false);
  const submitting = useRef(false);
  const attempt = useRef<{ payload: string; id: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    invokePodMessage({ action: "preview", orderId: loadId }).then((data: PodPreview) => {
      if (cancelled) return;
      setPreview(data);
      setSelected(data.files.length === 1 ? [data.files[0].id] : []);
      setIndex(0);
    }).catch(error => { if (!cancelled) setError(error.message); });
    return () => { cancelled = true; };
  }, [loadId, retry]);
  const file = preview?.files[index];
  useEffect(() => { setImageError(false); }, [file?.id]);
  const send = async () => {
    if (submitting.current || !preview?.recipients || !selected.length || !message.trim()) return;
    submitting.current = true;
    setSending(true);
    onSendingChange(true);
    const payload = JSON.stringify({ message: message.trim(), selectedFileIds: [...selected].sort() });
    if (attempt.current?.payload !== payload) attempt.current = { payload, id: crypto.randomUUID() };
    try {
      const result = await invokePodMessage({ action: "send", orderId: loadId, message: message.trim(), selectedFileIds: selected, requestId: attempt.current.id });
      if (!result?.success) throw new Error("Email delivery was not confirmed.");
      toast.success("POD message sent");
      onSent();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send POD message");
    } finally {
      submitting.current = false;
      setSending(false);
      onSendingChange(false);
    }
  };
  if (error) return <div role="alert" className="space-y-3"><p className="text-destructive">{error}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Retry</Button></div>;
  if (!preview) return <div role="status" className="flex h-64 items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Loading PODs…</div>;
  const isPdf = file?.content_type === "application/pdf" || /\.pdf$/i.test(file?.file_name || "");
  const isImage = file?.content_type?.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(file?.file_name || "");
  return <div className="space-y-4">
    <p className="text-sm font-medium">Load {preview.loadNumber}</p>
    {file ? <>
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" aria-label="Previous POD" disabled={index === 0 || sending} onClick={() => setIndex(value => value - 1)}><ChevronLeft /></Button>
        <div className="min-w-0 text-center text-sm"><p>POD {index + 1} of {preview.files.length}</p><p className="truncate" title={file.file_name}>{file.file_name}</p></div>
        <Button variant="outline" size="icon" aria-label="Next POD" disabled={index === preview.files.length - 1 || sending} onClick={() => setIndex(value => value + 1)}><ChevronRight /></Button>
      </div>
      <div className="flex h-[min(45dvh,400px)] items-center justify-center overflow-hidden rounded-md border bg-muted/30">
        {!file.url || imageError ? <p role="alert" className="p-4 text-sm">The preview could not be loaded. {file.url ? "Use Open POD to view the document." : "Reopen the popup to retry."}</p>
          : isPdf ? <iframe src={file.url} title="POD PDF preview" className="h-full w-full" />
          : isImage ? <img src={file.url} alt={`POD ${index + 1}: ${file.file_name}`} className="h-full w-full object-contain" onError={() => setImageError(true)} />
          : <p className="p-4 text-sm">Use Open POD to view this document.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Checkbox id={`pod-${loadId}-${file.id}`} checked={selected.includes(file.id)} disabled={preview.files.length === 1 || sending}
            onCheckedChange={checked => setSelected(current => checked === true ? [...new Set([...current, file.id])] : current.filter(id => id !== file.id))} />
          <Label htmlFor={`pod-${loadId}-${file.id}`}>{preview.files.length === 1 ? "POD selected automatically" : "Attach this POD"}</Label>
        </div>
        {file.url && <Button variant="outline" size="sm" asChild><a href={file.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" />Open POD</a></Button>}
      </div>
      <p className="text-xs text-muted-foreground">{selected.length} of {preview.files.length} PODs selected</p>
    </> : <p className="rounded-md border p-6 text-center text-muted-foreground">No PODs uploaded for this load.</p>}
    <div className="space-y-2">
      <Label htmlFor={`pod-message-${loadId}`}>Message</Label>
      <Textarea id={`pod-message-${loadId}`} placeholder="Write a message…" value={message} maxLength={5000} disabled={sending} onChange={event => setMessage(event.target.value)} rows={4} />
    </div>
    {preview.recipients ? <div className="break-words text-xs text-muted-foreground">
      <p>To: {preview.recipients.bookerName} ({preview.recipients.to})</p>
      <p>Reply-To: {preview.recipients.replyTo.join(", ")}</p>
    </div> : <p role="alert" className="text-sm text-destructive">{preview.recipientError || "Unable to identify the recipient."}</p>}
    <div className="flex justify-end"><Button onClick={send} disabled={sending || !message.trim() || !selected.length || !preview.recipients}>
      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? "Sending…" : "Send message"}
    </Button></div>
  </div>;
}
