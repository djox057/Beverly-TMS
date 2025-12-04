import * as React from "react";
import { format } from "date-fns";
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
      console.log('DateTimeRangePicker: Same day selection, created separate objects:', { 
        from, 
        to, 
        areSameReference: from === to, 
        areSameTime: from.getTime() === to.getTime() 
      });
      onDateChange?.({ from, to });
    } else if (newDate.from && !newDate.to) {
      // Single date selection - create a same-day range
      const from = new Date(newDate.from);
      const to = new Date(newDate.from);
      console.log('DateTimeRangePicker: Single date selection, created range:', { 
        from, 
        to, 
        areSameReference: from === to, 
        areSameTime: from.getTime() === to.getTime() 
      });
      onDateChange?.({ from, to });
    } else {
      // Different dates selected
      console.log('DateTimeRangePicker: Different dates selected:', newDate);
      onDateChange?.(newDate);
    }
  };

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
              date.to ? (
                <>
                  {isNaN(date.from.getTime()) ? "" : format(date.from, "LLL dd, y")} {startTime && `at ${startTime}`} -{" "}
                  {isNaN(date.to.getTime()) ? "" : format(date.to, "LLL dd, y")} {endTime && `at ${endTime}`}
                </>
              ) : (
                <>
                  {isNaN(date.from.getTime()) ? "" : format(date.from, "LLL dd, y")} {startTime && `at ${startTime}`}
                </>
              )
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
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