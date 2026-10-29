import { useEffect, useRef, useState } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  active: boolean;
  today: Date;
  date: Date;
  onSelect: (date: Date) => void;
  onClear: () => void;
}

export function EmptyTrucksFilter({ active, today, date, onSelect, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const cancelTimer = () => clearTimeout(timer.current);
  const schedule = (value: boolean) => {
    cancelTimer();
    timer.current = setTimeout(() => setOpen(value), value ? 250 : 200);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const select = (day: Date) => {
    cancelTimer();
    onSelect(day);
    setOpen(false);
  };
  const label = isSameDay(date, today) ? "Today"
    : isSameDay(date, addDays(today, 1)) ? "Tomorrow" : format(date, "MMM d");

  return (
    <Popover open={open} onOpenChange={(value) => { cancelTimer(); setOpen(value); }}>
      <PopoverTrigger asChild>
        <Button
          variant={active ? "default" : "outline"}
          size="sm"
          onMouseEnter={() => schedule(true)}
          onMouseLeave={() => schedule(false)}
          className="gap-1 text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3 transition-colors duration-150"
        >
          Empty trucks{active && <span className="opacity-80"> · {label}</span>}
          <ChevronDown className={`h-3 w-3 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-3 duration-150 motion-reduce:animate-none"
        onMouseEnter={cancelTimer}
        onMouseLeave={() => schedule(false)}
        onFocusCapture={cancelTimer}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <p className="mb-2 text-sm font-medium">Empty for what day?</p>
        <div className="mb-2 flex gap-2">
          {[today, addDays(today, 1)].map((day, index) => (
            <Button key={index} size="sm"
              variant={active && isSameDay(day, date) ? "default" : "outline"}
              onClick={() => select(day)}>
              {index === 0 ? "Today" : "Tomorrow"}
            </Button>
          ))}
        </div>
        <Calendar mode="single" selected={date} defaultMonth={date}
          onSelect={(day) => { if (day) select(day); }} />
        {active && <Button variant="ghost" size="sm" className="w-full"
          onClick={() => { onClear(); setOpen(false); }}>Clear filter</Button>}
      </PopoverContent>
    </Popover>
  );
}
