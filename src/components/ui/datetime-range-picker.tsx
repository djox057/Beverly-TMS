import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon, Clock } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateTimeRangePickerProps {
  date?: DateRange;
  onDateChange?: (date: DateRange | undefined) => void;
  startTime?: string;
  endTime?: string;
  onStartTimeChange?: (time: string) => void;
  onEndTimeChange?: (time: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DateTimeRangePicker({
  date,
  onDateChange,
  startTime = "",
  endTime = "",
  onStartTimeChange,
  onEndTimeChange,
  placeholder = "Pick date and time range",
  className,
  disabled = false,
}: DateTimeRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [fromDateInput, setFromDateInput] = React.useState("");
  const [toDateInput, setToDateInput] = React.useState("");

  // Sync input fields with date prop
  React.useEffect(() => {
    if (date?.from && isValid(date.from)) {
      setFromDateInput(format(date.from, "MM/dd/yyyy"));
    } else {
      setFromDateInput("");
    }
    if (date?.to && isValid(date.to)) {
      setToDateInput(format(date.to, "MM/dd/yyyy"));
    } else {
      setToDateInput("");
    }
  }, [date?.from, date?.to]);

  // Parse manually entered date
  const parseManualDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    
    // Try multiple formats
    const formats = ["MM/dd/yyyy", "M/d/yyyy", "MM-dd-yyyy", "M-d-yyyy", "yyyy-MM-dd"];
    for (const fmt of formats) {
      const parsed = parse(dateStr, fmt, new Date());
      if (isValid(parsed)) {
        return parsed;
      }
    }
    return null;
  };

  // Handle manual date input change for "from" date
  const handleFromDateInputChange = (value: string) => {
    setFromDateInput(value);
  };

  // Handle manual date input change for "to" date
  const handleToDateInputChange = (value: string) => {
    setToDateInput(value);
  };

  // Handle blur to parse and update date
  const handleFromDateBlur = () => {
    const parsed = parseManualDate(fromDateInput);
    if (parsed) {
      const newDate: DateRange = {
        from: parsed,
        to: date?.to || parsed,
      };
      onDateChange?.(newDate);
    } else if (!fromDateInput) {
      onDateChange?.(undefined);
    }
  };

  const handleToDateBlur = () => {
    const parsed = parseManualDate(toDateInput);
    if (parsed && date?.from) {
      const newDate: DateRange = {
        from: date.from,
        to: parsed,
      };
      onDateChange?.(newDate);
    }
  };

  // Handle calendar date selection to ensure proper same-day range handling
  const handleDateChange = (newDate: DateRange | undefined) => {
    if (!newDate) {
      onDateChange?.(undefined);
      return;
    }

    // If selecting the same day for both start and end, ensure they are separate Date objects
    if (newDate.from && newDate.to && 
        newDate.from.getTime() === newDate.to.getTime()) {
      // Create separate Date objects for same day selections
      const from = new Date(newDate.from);
      const to = new Date(newDate.to);
      onDateChange?.({ from, to });
    } else if (newDate.from && !newDate.to) {
      // Single date selection - create a same-day range
      const from = new Date(newDate.from);
      const to = new Date(newDate.from);
      onDateChange?.({ from, to });
    } else {
      // Different dates selected
      onDateChange?.(newDate);
    }
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center gap-1">
          <div className="flex-1 flex items-center gap-1">
            <Input
              type="text"
              placeholder="MM/DD/YYYY"
              value={fromDateInput}
              onChange={(e) => handleFromDateInputChange(e.target.value)}
              onBlur={handleFromDateBlur}
              disabled={disabled}
              className="text-sm h-10"
            />
            <span className="text-muted-foreground text-sm">-</span>
            <Input
              type="text"
              placeholder="MM/DD/YYYY"
              value={toDateInput}
              onChange={(e) => handleToDateInputChange(e.target.value)}
              onBlur={handleToDateBlur}
              disabled={disabled}
              className="text-sm h-10"
            />
          </div>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              disabled={disabled}
              className="h-10 w-10 shrink-0"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </div>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="space-y-4 p-4">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={handleDateChange}
              numberOfMonths={2}
              className="pointer-events-auto"
            />
            
            {(date?.from || date?.to) && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" />
                  Time Range
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Start Time</label>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => onStartTimeChange?.(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">End Time</label>
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => onEndTimeChange?.(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
