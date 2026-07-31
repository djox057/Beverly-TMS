import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface SheetInspection {
  company: string;
  truck_number: string;
  driver_name: string;
  trailer_number: string;
  inspection_date: string;
  oos: string;
  violation_reason: string;
  report_sent: string;
  signed_by_mechanic: string;
  repair_receipt: string;
  logs_sent: string;
  comment: string;
}

interface DriverInspectionsTabProps {
  driverName: string;
}

const DriverInspectionsTab = ({ driverName }: DriverInspectionsTabProps) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["driver-sheet-inspections", driverName],
    enabled: !!driverName,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("driver-sheet-inspections", {
        body: { driverName },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.details || data.error));
      return (data?.inspections || []) as SheetInspection[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading inspections…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-medium">Could not load the inspections spreadsheet.</p>
          <p className="text-xs opacity-80">{(error as Error).message}</p>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No inspections found for {driverName} in the roadside inspections spreadsheet.
      </div>
    );
  }

  const isClean = (row: SheetInspection) =>
    (row.oos || "").trim().toUpperCase() === "CLEAN INSPECTION";
  const isOos = (row: SheetInspection) => (row.oos || "").trim().toUpperCase() === "YES";

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {data.length} inspection{data.length === 1 ? "" : "s"} found for {driverName}
      </p>
      <div className="overflow-x-auto rounded-md border">
        <Table className="table-fixed text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Company</TableHead>
              <TableHead className="w-[70px]">Truck</TableHead>
              <TableHead className="w-[80px]">Trailer</TableHead>
              <TableHead className="w-[90px]">Date</TableHead>
              <TableHead className="w-[110px]">OOS</TableHead>
              <TableHead className="w-[160px]">Violation</TableHead>
              <TableHead className="w-[80px]">Report sent</TableHead>
              <TableHead className="w-[90px]">Mechanic signed</TableHead>
              <TableHead className="w-[90px]">Repair receipt</TableHead>
              <TableHead className="w-[70px]">Logs sent</TableHead>
              <TableHead className="w-[200px]">Comment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="truncate">{row.company}</TableCell>
                <TableCell>{row.truck_number}</TableCell>
                <TableCell className="truncate">{row.trailer_number}</TableCell>
                <TableCell>{row.inspection_date}</TableCell>
                <TableCell
                  className={
                    isOos(row)
                      ? "font-medium text-destructive"
                      : isClean(row)
                        ? "font-medium text-primary"
                        : ""
                  }
                >
                  {row.oos}
                </TableCell>
                <TableCell className="whitespace-normal break-words">{row.violation_reason}</TableCell>
                <TableCell>{row.report_sent}</TableCell>
                <TableCell>{row.signed_by_mechanic}</TableCell>
                <TableCell>{row.repair_receipt}</TableCell>
                <TableCell>{row.logs_sent}</TableCell>
                <TableCell className="whitespace-normal break-words">{row.comment}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default DriverInspectionsTab;