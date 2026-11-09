import { format } from "date-fns";
import { dateFromDay } from "@/lib/turnoverMetrics";

type Props = {
  active?: boolean;
  label?: string | number;
  payload?: { value?: string | number | null }[];
};

export function TurnoverRateTooltip({ active, label, payload }: Props) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  const month = typeof label === "string" && /^\d{4}-\d{2}$/.test(label)
    ? format(dateFromDay(`${label}-01`), "MMMM yyyy")
    : label;

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-xl">
      <p className="mb-1 font-semibold">{month}</p>
      <p className="flex items-center gap-2">
        <span>Turnover rate</span>
        <span className="font-semibold tabular-nums text-blue-700 dark:text-blue-300">
          {value == null ? "—" : `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}%`}
        </span>
      </p>
    </div>
  );
}
