import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getChicagoToday } from "@/pages/Reports/helpers";

const OFFICES = ["CACAK", "KRAGUJEVAC", "BG 1st FLOOR", "BG 4th FLOOR"] as const;

type TypeOption = {
  value: string;
  label: string;
  /** true => requires an office; false => global (office stored as null) */
  perOffice: boolean;
};

const TYPES: TypeOption[] = [
  { value: "Empty & Late for delivery", label: "Empty & Late", perOffice: true },
  { value: "Home", label: "Home", perOffice: true },
  { value: "Maintenance", label: "Maintenance", perOffice: false },
  { value: "Afterhours", label: "After Hours", perOffice: false },
  { value: "Recoveries", label: "Recoveries", perOffice: false },
  { value: "New driver", label: "New driver", perOffice: false },
  { value: "Safety", label: "Safety", perOffice: false },
];

const COLORS = [
  { value: "", label: "None", swatch: "bg-transparent border border-border" },
  { value: "orange", label: "Late", swatch: "bg-orange-400" },
  { value: "cyan", label: "No load", swatch: "bg-cyan-400" },
  { value: "yellow", label: "Problem", swatch: "bg-yellow-400" },
  { value: "red", label: "Recovery", swatch: "bg-red-500" },
  { value: "green", label: "Resolved", swatch: "bg-green-500" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTruckNumber?: string;
  defaultDriverName?: string | null;
  defaultDispatcherName?: string | null;
  defaultOffice?: string | null;
}

export function AddDailyReportRowDialog({
  open,
  onOpenChange,
  defaultTruckNumber = "",
  defaultDriverName = null,
  defaultDispatcherName = null,
  defaultOffice = null,
}: Props) {
  const [date, setDate] = useState<Date>(() => getChicagoToday());
  const [type, setType] = useState<string>(TYPES[0].value);
  const [office, setOffice] = useState<string>(
    defaultOffice && (OFFICES as readonly string[]).includes(defaultOffice)
      ? defaultOffice
      : OFFICES[0]
  );
  const [truck, setTruck] = useState(defaultTruckNumber);
  const [note, setNote] = useState("");
  const [color, setColor] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setDate(getChicagoToday());
    setType(TYPES[0].value);
    setOffice(
      defaultOffice && (OFFICES as readonly string[]).includes(defaultOffice)
        ? defaultOffice
        : OFFICES[0]
    );
    setTruck(defaultTruckNumber);
    setNote("");
    setColor("");
  }, [open, defaultTruckNumber, defaultOffice]);

  const currentType = TYPES.find((t) => t.value === type) ?? TYPES[0];

  const submit = async () => {
    if (!truck.trim() && !note.trim()) {
      toast({
        title: "Nothing to save",
        description: "Enter a truck number or a note.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        date: format(date, "yyyy-MM-dd"),
        type,
        office: currentType.perOffice ? office : null,
        truck: truck.trim() || null,
        note: note.trim() || null,
        color: color || null,
        driver_name: defaultDriverName || null,
        dispatcher_name: defaultDispatcherName || null,
      };
      const { error } = await (supabase as any)
        .from("daily_report_entries")
        .insert(payload);
      if (error) {
        toast({
          title: "Failed to save",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Daily report row added" });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Daily Report Row</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(date, "MM/dd/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {currentType.perOffice && (
            <div className="space-y-1.5">
              <Label>Office</Label>
              <Select value={office} onValueChange={setOffice}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OFFICES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Truck #</Label>
            <Input
              value={truck}
              onChange={(e) => setTruck(e.target.value)}
              placeholder="e.g. 1234"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Enter note..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Color tag</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.value || "none"}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded border text-xs transition-colors",
                    color === c.value
                      ? "border-primary bg-accent"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <span className={cn("h-3 w-3 rounded-sm", c.swatch)} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving..." : "Add Row"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}