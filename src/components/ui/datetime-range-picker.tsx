import * as React from "react";
import { format, startOfYear, addMonths, endOfMonth } from "date-fns";
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
  disableDateValidation?: boolean;
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
  disableDateValidation = false,
}: DateTimeRangePickerProps) {
  // Calculate valid date range: start of current year to end of next month
  const now = new Date();
  const minDate = disableDateValidation ? undefined : startOfYear(now);
  const maxDate = disableDateValidation ? undefined : endOfMonth(addMonths(now, 1));
  
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
              fromDate={minDate}
              toDate={maxDate}
            />
            
            {(date?.from || date?.to) && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" />
                  Time Range
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Start Time (24h)</label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="00:00"
                      value={startTime}
                      onChange={(e) => {
                        let value = e.target.value.replace(/[^0-9:]/g, '');
                        // Auto-add colon after 2 digits
                        if (value.length === 2 && !value.includes(':')) {
                          value = value + ':';
                        }
                        // Limit to 5 chars (HH:MM)
                        if (value.length <= 5) {
                          onStartTimeChange?.(value);
                        }
                      }}
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (!value) return;
                        
                        const match = value.match(/^(\d{1,2}):(\d{2})$/);
                        if (match) {
                          let hours = parseInt(match[1], 10);
                          let minutes = parseInt(match[2], 10);
                          
                          // Validate ranges
                          if (hours > 23) hours = 23;
                          if (minutes > 59) minutes = 59;
                          
                          const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                          onStartTimeChange?.(formatted);
                        } else {
                          // Invalid format, clear it
                          onStartTimeChange?.('');
                        }
                      }}
                      className="text-sm"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">End Time (24h)</label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="00:00"
                      value={endTime}
                      onChange={(e) => {
                        let value = e.target.value.replace(/[^0-9:]/g, '');
                        // Auto-add colon after 2 digits
                        if (value.length === 2 && !value.includes(':')) {
                          value = value + ':';
                        }
                        // Limit to 5 chars (HH:MM)
                        if (value.length <= 5) {
                          onEndTimeChange?.(value);
                        }
                      }}
                      onBlur={(e) => {
                        const value = e.target.value;
                        if (!value) return;
                        
                        const match = value.match(/^(\d{1,2}):(\d{2})$/);
                        if (match) {
                          let hours = parseInt(match[1], 10);
                          let minutes = parseInt(match[2], 10);
                          
                          // Validate ranges
                          if (hours > 23) hours = 23;
                          if (minutes > 59) minutes = 59;
                          
                          const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                          onEndTimeChange?.(formatted);
                        } else {
                          // Invalid format, clear it
                          onEndTimeChange?.('');
                        }
                      }}
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