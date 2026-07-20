import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Bracket table: [minMiles, maxMiles, minRpm, maxRpm]
const BRACKETS: Array<[number, number, number, number]> = [
  [1500, 1599, 3.50, 3.60],
  [1600, 1699, 3.40, 3.49],
  [1700, 1799, 3.30, 3.39],
  [1800, 1899, 3.20, 3.29],
  [1900, 1999, 3.10, 3.19],
  [2000, 2099, 3.00, 3.09],
  [2100, 2199, 2.95, 2.99],
  [2200, 2299, 2.90, 2.94],
  [2300, 2399, 2.85, 2.89],
  [2400, 2499, 2.80, 2.84],
  [2500, 2599, 2.75, 2.79],
  [2600, 2699, 2.70, 2.74],
  [2700, 2799, 2.65, 2.69],
  [2800, 2899, 2.60, 2.64],
  [2900, 2999, 2.55, 2.59],
  [3000, 3099, 2.50, 2.54],
  [3100, 3199, 2.45, 2.49],
  [3200, 3299, 2.40, 2.44],
  [3300, 3399, 2.35, 2.39],
  [3400, 3499, 2.30, 2.34],
  [3500, 3600, 2.25, 2.29],
];

function bracketFor(miles: number) {
  const clamped = Math.max(1500, Math.min(3600, miles));
  for (const [lo, hi, minR, maxR] of BRACKETS) {
    if (clamped >= lo && clamped <= hi) {
      return { minMiles: lo, maxMiles: hi, minRpm: minR, maxRpm: maxR, midpoint: (minR + maxR) / 2 };
    }
  }
  const [lo, hi, minR, maxR] = BRACKETS[BRACKETS.length - 1];
  return { minMiles: lo, maxMiles: hi, minRpm: minR, maxRpm: maxR, midpoint: (minR + maxR) / 2 };
}

const roundTo50 = (n: number) => Math.round(n / 50) * 50;

export interface RateCalculatorTruckOption {
  truckId: string;
  truckNumber: string;
  driverId: string | null;
  driverName: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trucks?: RateCalculatorTruckOption[];
}

export const RateCalculatorDialog: React.FC<Props> = ({ open, onOpenChange, trucks = [] }) => {
  const [loadedMiles, setLoadedMiles] = useState("");
  const [dhMiles, setDhMiles] = useState("");
  const [selectedTruckId, setSelectedTruckId] = useState<string>("");
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");

  // Reset selections when the dialog is reopened.
  useEffect(() => {
    if (open) {
      setSelectedTruckId("");
      setSelectedDriverId("");
      setLoadedMiles("");
      setDhMiles("");
    }
  }, [open]);

  // Deduplicate trucks by truckId; keep only those with a truck number.
  const truckOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: RateCalculatorTruckOption[] = [];
    for (const t of trucks) {
      if (!t.truckId || seen.has(t.truckId)) continue;
      seen.add(t.truckId);
      list.push(t);
    }
    return list.sort((a, b) => (a.truckNumber || "").localeCompare(b.truckNumber || ""));
  }, [trucks]);

  // Unique drivers derived from the truck list.
  const driverOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: { driverId: string; driverName: string; truckId: string }[] = [];
    for (const t of truckOptions) {
      if (!t.driverId || !t.driverName) continue;
      if (seen.has(t.driverId)) continue;
      seen.add(t.driverId);
      list.push({ driverId: t.driverId, driverName: t.driverName, truckId: t.truckId });
    }
    return list.sort((a, b) => a.driverName.localeCompare(b.driverName));
  }, [truckOptions]);

  const handleTruckChange = (truckId: string) => {
    setSelectedTruckId(truckId);
    const match = truckOptions.find((t) => t.truckId === truckId);
    setSelectedDriverId(match?.driverId ?? "");
  };

  const handleDriverChange = (driverId: string) => {
    setSelectedDriverId(driverId);
    const match = truckOptions.find((t) => t.driverId === driverId);
    if (match) setSelectedTruckId(match.truckId);
  };

  const result = useMemo(() => {
    const loaded = parseFloat(loadedMiles) || 0;
    const dh = parseFloat(dhMiles) || 0;
    const total = loaded + dh;
    if (total <= 0) return null;
    const bracket = bracketFor(total);
    const rate = roundTo50(total * bracket.midpoint);
    const rateMin = roundTo50(total * bracket.minRpm);
    const rateMax = roundTo50(total * bracket.maxRpm);
    let warning: string | undefined;
    if (total < 1500) warning = "Total miles below 1,500 — under promo minimum.";
    else if (total > 3600) warning = "Total miles above 3,600 — top bracket in use.";
    return { total, bracket, rate, rateMin, rateMax, warning };
  }, [loadedMiles, dhMiles]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Rate calculator</DialogTitle>
          <DialogDescription>
            Pick a truck or driver, then enter loaded and deadhead miles to see the suggested rate and promo bracket.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rc-truck">Truck</Label>
              <Select value={selectedTruckId} onValueChange={handleTruckChange}>
                <SelectTrigger id="rc-truck">
                  <SelectValue placeholder="Select truck" />
                </SelectTrigger>
                <SelectContent>
                  {truckOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No trucks available
                    </div>
                  ) : (
                    truckOptions.map((t) => (
                      <SelectItem key={t.truckId} value={t.truckId}>
                        {t.truckNumber}
                        {t.driverName ? ` · ${t.driverName}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-driver">Driver</Label>
              <Select value={selectedDriverId} onValueChange={handleDriverChange}>
                <SelectTrigger id="rc-driver">
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  {driverOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No drivers available
                    </div>
                  ) : (
                    driverOptions.map((d) => (
                      <SelectItem key={d.driverId} value={d.driverId}>
                        {d.driverName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rc-loaded">Loaded miles</Label>
              <Input
                id="rc-loaded"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={loadedMiles}
                onChange={(e) => setLoadedMiles(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rc-dh">DH miles</Label>
              <Input
                id="rc-dh"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                value={dhMiles}
                onChange={(e) => setDhMiles(e.target.value)}
              />
            </div>
          </div>

          {result ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total miles</span>
                <span className="font-medium">{result.total.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Bracket</span>
                <span className="font-medium">
                  {result.bracket.minMiles}–{result.bracket.maxMiles} mi · RPM{" "}
                  {result.bracket.minRpm.toFixed(2)}–{result.bracket.maxRpm.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Target RPM (mid)</span>
                <span className="font-medium">${result.bracket.midpoint.toFixed(2)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t">
                <span className="text-muted-foreground">Suggested rate</span>
                <span className="font-semibold text-foreground">
                  ${result.rate.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Range</span>
                <span className="text-muted-foreground">
                  ${result.rateMin.toLocaleString()} – ${result.rateMax.toLocaleString()}
                </span>
              </div>
              {result.warning && (
                <p className="text-xs text-amber-500 pt-1">{result.warning}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Enter miles above to see the suggested rate.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RateCalculatorDialog;