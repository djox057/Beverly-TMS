import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TRUCK_SOURCES, normalizeTruckSource } from "@/lib/truckSources";

export function TruckSourceSelect({ value, onChange, id, ariaLabel, className, disabled }: {
  value: string | null;
  onChange: (value: string | null) => void;
  id?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  return <Select value={value || "unset"} onValueChange={value => onChange(normalizeTruckSource(value === "unset" ? null : value))} disabled={disabled}>
    <SelectTrigger id={id} aria-label={ariaLabel} className={className}><SelectValue placeholder="Select source" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="unset">Not set</SelectItem>
      {TRUCK_SOURCES.map(source => <SelectItem key={source} value={source}>{source}</SelectItem>)}
    </SelectContent>
  </Select>;
}
