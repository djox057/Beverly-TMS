import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { requiresEfsLocation, type MoneyCodeDetails } from "../../supabase/functions/_shared/efsMoneyCode";

export const emptyMoneyCodeDetails = (): MoneyCodeDetails => ({ purposeDetail: "", isTrailerRepair: false, trailerNumber: "", locationName: "", locationAddress: "" });

export function EfsMoneyCodeFields({ value, onChange, purpose, idPrefix, disabled = false }: {
  value: MoneyCodeDetails;
  onChange: (value: MoneyCodeDetails) => void;
  purpose: string;
  idPrefix: string;
  disabled?: boolean;
}) {
  const update = (patch: Partial<MoneyCodeDetails>) => onChange({ ...value, ...patch });
  const repair = /repair|alignment/i.test(purpose) || /\btrailer\b/i.test(value.purposeDetail) || value.isTrailerRepair;
  const locationRequired = requiresEfsLocation(`${purpose} ${value.purposeDetail}`, value.isTrailerRepair);
  return <div className="space-y-3">
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-description`}>Detailed purpose in English (required)</Label>
      <Textarea id={`${idPrefix}-description`} value={value.purposeDetail} disabled={disabled} maxLength={1000} rows={2}
        placeholder={/cash/i.test(purpose) ? "e.g., Cash advance for meals and personal expenses" : "e.g., Trailer alignment or replacement of the truck's front tire"}
        onChange={event => update({ purposeDetail: event.target.value })} />
      <p className="text-xs text-muted-foreground">Describe what the code pays for. “Repair”, “Fuel”, or “Cash advance” alone is not enough.</p>
    </div>
    {repair && <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Checkbox id={`${idPrefix}-trailer-repair`} checked={value.isTrailerRepair} disabled={disabled}
          onCheckedChange={checked => update({ isTrailerRepair: checked === true })} />
        <Label htmlFor={`${idPrefix}-trailer-repair`}>This is a trailer repair</Label>
      </div>
      {value.isTrailerRepair && <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-trailer`}>Trailer number (required)</Label>
        <Input id={`${idPrefix}-trailer`} value={value.trailerNumber} disabled={disabled} maxLength={50}
          onChange={event => update({ trailerNumber: event.target.value })} placeholder="e.g., 407613" />
      </div>}
    </div>}
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-business`}>Business name{locationRequired ? " (required)" : " (optional)"}</Label>
      <Input id={`${idPrefix}-business`} value={value.locationName} disabled={disabled} maxLength={200}
        placeholder="e.g., All American Truck & Trailer" onChange={event => update({ locationName: event.target.value })} />
    </div>
    <div className="space-y-2">
      <Label htmlFor={`${idPrefix}-address`}>Full address{locationRequired ? " (required)" : " (optional)"}</Label>
      <Input id={`${idPrefix}-address`} value={value.locationAddress} disabled={disabled} maxLength={500}
        placeholder="4425 Stickney Ave, Toledo, OH 43612" onChange={event => update({ locationAddress: event.target.value })} />
    </div>
  </div>;
}
