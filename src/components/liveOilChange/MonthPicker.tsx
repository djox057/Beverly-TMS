import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const months = Array.from({ length: 12 }, (_, index) => format(new Date(2026, index, 1), "MMMM"));

export function MonthPicker({ id, value, onChange }: { id: string; value: string; onChange: (month: string) => void }) {
  const selectedYear = Number(value.slice(0, 4));
  const selectedMonth = Number(value.slice(5, 7));
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(selectedYear);
  return <Popover open={open} onOpenChange={shown => { if (shown) setYear(selectedYear); setOpen(shown); }}>
    <PopoverTrigger asChild>
      <Button id={id} type="button" variant="outline" className="w-48 justify-between font-normal">
        {format(new Date(selectedYear, selectedMonth - 1, 1), "MMMM yyyy")}<CalendarDays className="ml-2 h-4 w-4 text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-72 p-3" align="start" aria-label="Choose month">
      <div className="mb-3 flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Previous year" disabled={year <= 1} onClick={() => setYear(year - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="font-semibold" aria-live="polite">{year}</span>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Next year" disabled={year >= 9999} onClick={() => setYear(year + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {months.map((month, index) => <Button key={month} type="button" size="sm" className="px-1 text-xs" variant={year === selectedYear && index + 1 === selectedMonth ? "default" : "ghost"} aria-pressed={year === selectedYear && index + 1 === selectedMonth}
          onClick={() => { onChange(`${String(year).padStart(4, "0")}-${String(index + 1).padStart(2, "0")}`); setOpen(false); }}>{month}</Button>)}
      </div>
    </PopoverContent>
  </Popover>;
}
