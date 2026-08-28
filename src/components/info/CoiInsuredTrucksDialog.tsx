import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeVin } from "@/hooks/useCoiInsuredVins";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

type Row = {
  vin: string;
  truckNumber: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
};

export const CoiInsuredTrucksDialog = ({
  companyName,
  open,
  onOpenChange,
}: {
  companyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [{ data: vinRows }, { data: trucks }] = await Promise.all([
        supabase.from("company_coi_vins").select("vin").eq("company_name", companyName),
        supabase.from("trucks").select("truck_number, vin, year, make, model"),
      ]);

      const truckByVin = new Map<string, any>();
      for (const t of trucks || []) {
        const key = normalizeVin((t as any).vin);
        if (key) truckByVin.set(key, t);
      }

      const result: Row[] = (vinRows || [])
        .map((r: any) => {
          const key = normalizeVin(r.vin);
          const t = truckByVin.get(key);
          return {
            vin: key,
            truckNumber: t?.truck_number ?? null,
            year: t?.year != null ? String(t.year) : null,
            make: t?.make ?? null,
            model: t?.model ?? null,
          };
        })
        .sort((a, b) => {
          if (!!a.truckNumber !== !!b.truckNumber) return a.truckNumber ? -1 : 1;
          return (a.truckNumber || a.vin).localeCompare(b.truckNumber || b.vin, undefined, {
            numeric: true,
          });
        });

      if (!cancelled) {
        setRows(result);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, companyName]);

  const matched = rows.filter((r) => r.truckNumber).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Insured trucks — {companyName}</DialogTitle>
          <DialogDescription>
            Based on the VIN numbers found on this company's uploaded COI documents.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No VINs extracted from this company's COI yet.
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <p className="mb-2 text-xs text-muted-foreground">
              {rows.length} VIN{rows.length === 1 ? "" : "s"} on COI · {matched} matched to a truck
            </p>
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Truck #</TableHead>
                  <TableHead className="w-[200px]">VIN</TableHead>
                  <TableHead className="w-[70px]">Year</TableHead>
                  <TableHead>Make / Model</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.vin}>
                    <TableCell className="font-medium">
                      {r.truckNumber || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs break-all">{r.vin}</TableCell>
                    <TableCell>{r.year || "—"}</TableCell>
                    <TableCell className="break-all">
                      {[r.make, r.model].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
