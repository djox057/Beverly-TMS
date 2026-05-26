import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * Numeric day-of-month input that emits a full YYYY-MM-DD string for the
 * provided `month` ("YYYY-MM"). Used in payroll popovers so admins only
 * type a day, scoped to the selected month.
 */
export function DayInput({
  month,
  onPick,
  placeholder = "Day",
  className = "h-7 text-xs",
}: {
  month: string; // "YYYY-MM"
  onPick: (dateIso: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const maxDay = y && m ? new Date(y, m, 0).getDate() : 31;

  return (
    <Input
      type="number"
      inputMode="numeric"
      min={1}
      max={maxDay}
      step={1}
      placeholder={placeholder}
      className={className}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      onBlur={(e) => {
        const raw = e.target.value.trim();
        if (!raw) return;
        const day = Math.floor(Number(raw));
        if (!day || day < 1 || day > maxDay) {
          toast.error(`Day must be 1–${maxDay}`);
          e.target.value = "";
          return;
        }
        const iso = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        onPick(iso);
        e.target.value = "";
      }}
    />
  );
}