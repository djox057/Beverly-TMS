import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatStoredEfsMoneyCode } from "@/lib/efsMoneyCodeText";

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

export function EfsMoneyCodeDialog({ request, onClose }: {
  request: EfsMoneyCodeRecord | null;
  onClose: () => void;
}) {
  const text = request ? formatStoredEfsMoneyCode(request) : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Money code text copied");
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  };
  return <Dialog open={!!request} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
      <DialogHeader><DialogTitle>EFS Money Code</DialogTitle></DialogHeader>
      <pre aria-label="Formatted EFS Money Code" className="select-text whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">{text}</pre>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={() => void copy()} disabled={!text}>Copy text</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
