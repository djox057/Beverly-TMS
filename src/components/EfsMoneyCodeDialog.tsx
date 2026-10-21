import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EfsMoneyCodeFields, emptyMoneyCodeDetails } from "@/components/EfsMoneyCodeFields";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatEfsMoneyCode, getMoneyCodeDetailsError, isDetailedEfsPurpose, type MoneyCodeDetails } from "../../supabase/functions/_shared/efsMoneyCode";

export interface EfsMoneyCodeRecord {
  id: string;
  source: 'efs' | 'cash_advance';
  driver_name: string;
  truck_number: string | null;
  amount: number;
  purpose: string;
  city: string | null;
  state: string | null;
  voided_at: string | null;
  purpose_detail: string | null;
  is_trailer_repair: boolean;
  trailer_number: string | null;
  location_name: string | null;
  location_address: string | null;
  entered_in_stuff: boolean;
  stuff_entered_at: string | null;
  money_code_supported: boolean;
}

export function EfsMoneyCodeDialog({ request, onClose, canEdit, onSaved }: {
  request: EfsMoneyCodeRecord | null;
  onClose: () => void;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [details, setDetails] = useState<MoneyCodeDetails>(emptyMoneyCodeDetails);
  useEffect(() => {
    if (!request) return;
    setDetails({ purposeDetail: request.purpose_detail || (isDetailedEfsPurpose(request.purpose) ? request.purpose : ""),
      isTrailerRepair: request.is_trailer_repair, trailerNumber: request.trailer_number || "",
      locationName: request.location_name || "", locationAddress: request.location_address || [request.city, request.state].filter(Boolean).join(", ") });
  }, [request]);
  const validationError = request ? getMoneyCodeDetailsError(details, request.purpose) : null;
  let preview = "";
  if (request && !validationError) {
    try { preview = formatEfsMoneyCode({ ...details, truckNumber: request.truck_number || "", driverName: request.driver_name,
      amount: request.amount, purpose: request.purpose }); } catch { /* Invalid legacy amount cannot be formatted. */ }
  }
  const editable = canEdit && !!request?.money_code_supported && !request?.voided_at;
  const save = useMutation({
    mutationFn: async () => {
      if (!request || !editable) throw new Error("You do not have permission to edit this request");
      if (validationError) throw new Error(validationError);
      const { error } = await supabase.from(request.source === 'cash_advance' ? 'driver_cash_advances' : 'efs_other_requests')
        .update({ purpose_detail: details.purposeDetail.trim(), is_trailer_repair: details.isTrailerRepair,
          trailer_number: details.isTrailerRepair ? details.trailerNumber.trim() : null,
          location_name: details.locationName.trim() || null, location_address: details.locationAddress.trim() || null })
        .eq("id", request.id).is("voided_at", null).select("id").single();
      if (error) throw error;
    },
    onSuccess: onSaved,
  });
  const copy = async () => {
    if (!preview) return;
    try {
      if (editable) await save.mutateAsync();
      await navigator.clipboard.writeText(preview);
      toast.success("Money code text copied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not copy. You can select the preview and copy it manually.");
    }
  };
  return <Dialog open={!!request} onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>EFS Money Code</DialogTitle>
        <DialogDescription>Complete the details and copy the formatted text.</DialogDescription></DialogHeader>
      {request && <>
        <div className="text-sm"><strong>Unit:</strong> {request.truck_number || "N/A"} · <strong>Driver:</strong> {request.driver_name} · <strong>Amount:</strong> ${request.amount.toFixed(2)}</div>
        <EfsMoneyCodeFields value={details} onChange={setDetails} purpose={request.purpose} idPrefix="money-code" disabled={!editable || save.isPending} />
        {validationError && <p className="text-sm text-muted-foreground">{validationError}</p>}
        {!request.money_code_supported && <p className="text-sm text-muted-foreground">Saving details is pending a database update.</p>}
        <Textarea aria-label="Formatted EFS Money Code" value={preview} readOnly rows={8} className="font-mono text-sm" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Close</Button>
          <Button onClick={() => void copy()} disabled={!preview || save.isPending}>{save.isPending ? "Saving…" : editable ? "Save & copy" : "Copy text"}</Button>
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}
