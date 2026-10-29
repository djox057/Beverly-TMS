import { useEffect, useId, useRef, useState } from "react";
import { addDays, isSameDay } from "date-fns";
import { Anchor as PopoverAnchor } from "@radix-ui/react-popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent } from "@/components/ui/popover";

interface Props {
  active: boolean;
  today: Date;
  date: Date;
  onSelect: (date: Date) => void;
  onClear: () => void;
}

export function EmptyTrucksFilter({ active, today, date, onSelect, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const suppressClick = useRef(false);
  const cancelHold = () => {
    clearTimeout(timer.current);
    setWaiting(false);
  };
  const hold = (pressed: boolean) => {
    cancelHold();
    if (open) return;
    setWaiting(true);
    timer.current = setTimeout(() => {
      suppressClick.current = pressed;
      setWaiting(false);
      setOpen(true);
    }, 500);
  };
  useEffect(() => () => {
    clearTimeout(timer.current);
  }, []);
  const select = (day: Date) => {
    cancelHold();
    onSelect(day);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Button
          variant={active ? "default" : "outline"}
          size="sm"
          aria-pressed={active}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onPointerEnter={(event) => { if (event.pointerType === "mouse") hold(false); }}
          onPointerLeave={cancelHold}
          onPointerDown={() => { suppressClick.current = false; hold(true); }}
          onPointerUp={cancelHold}
          onPointerCancel={() => { cancelHold(); suppressClick.current = false; }}
          onContextMenu={(event) => { if (suppressClick.current) event.preventDefault(); }}
          onClick={() => {
            cancelHold();
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            setOpen(false);
            if (active) onClear();
            else onSelect(today);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              cancelHold();
              setOpen(true);
            }
          }}
          className="relative overflow-hidden text-xs sm:text-sm h-7 sm:h-9 px-2 sm:px-3"
        >
          Empty trucks
          <span aria-hidden="true"
            className={`pointer-events-none absolute bottom-0 left-0 h-0.5 w-full origin-left bg-current opacity-40 motion-reduce:transition-none ${waiting ? "transition-transform duration-500 ease-linear" : ""}`}
            style={{ transform: waiting ? "scaleX(1)" : "scaleX(0)" }} />
        </Button>
      </PopoverAnchor>
      <PopoverContent
        id={id}
        aria-label="Empty for what day?"
        align="start"
        className="w-auto p-3 duration-150 motion-reduce:animate-none"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
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

