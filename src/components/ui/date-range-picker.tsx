import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  date?: DateRange;
  onDateChange?: (date: DateRange | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DateRangePicker({
  date,
  onDateChange,
  placeholder = "Pick a date range",
  className,
  disabled = false,
}: DateRangePickerProps) {
  // Handle calendar date selection to set same-day range on single click
  const handleDateChange = (newDate: DateRange | undefined) => {
    if (!newDate) {
      onDateChange?.(undefined);
      return;
    }

    // If only 'from' is selected (first click), set 'to' to the same date
    if (newDate.from && !newDate.to) {
      const from = new Date(newDate.from);
      const to = new Date(newDate.from);
      onDateChange?.({ from, to });
    } else {
      // Second click - use the full range
      onDateChange?.(newDate);
    }
  };

  // Display logic: show single date if from === to, otherwise show range
  const isSameDay = date?.from && date?.to && 
    date.from.getFullYear() === date.to.getFullYear() &&
    date.from.getMonth() === date.to.getMonth() &&
    date.from.getDate() === date.to.getDate();

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal",
              !date && "text-muted-foreground",
              disabled && "cursor-not-allowed opacity-50"
            )}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              isSameDay ? (
                format(date.from, "LLL dd, y")
              ) : date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={handleDateChange}
            numberOfMonths={2}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}