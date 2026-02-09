import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, DollarSign } from "lucide-react";
import { useDriverWeeklySalaries } from "@/hooks/useDriverWeeklySalaries";
import { toast } from "sonner";

interface DriverSalariesSectionProps {
  driverId: string;
}

// Get all Thursdays in a given year
function getThursdaysInYear(year: number): Date[] {
  const thursdays: Date[] = [];
  const date = new Date(year, 0, 1);
  // Find first Thursday
  while (date.getDay() !== 4) {
    date.setDate(date.getDate() + 1);
  }
  while (date.getFullYear() === year) {
    thursdays.push(new Date(date));
    date.setDate(date.getDate() + 7);
  }
  return thursdays;
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDisplay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DriverSalariesSection({ driverId }: DriverSalariesSectionProps) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const { salaries, isLoading, upsertSalary } = useDriverWeeklySalaries(driverId);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const thursdays = useMemo(() => getThursdaysInYear(year), [year]);

  // Build a map of week_date -> amount
  const salaryMap = useMemo(() => {
    const map = new Map<string, number>();
    salaries.forEach((s) => map.set(s.week_date, s.amount));
    return map;
  }, [salaries]);

  const totalForYear = useMemo(() => {
    let total = 0;
    thursdays.forEach((t) => {
      total += salaryMap.get(formatDate(t)) || 0;
    });
    return total;
  }, [thursdays, salaryMap]);

  const handleSave = (weekDate: string) => {
    const amount = parseFloat(editValue);
    if (isNaN(amount) || amount < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    upsertSalary.mutate(
      { week_date: weekDate, amount },
      {
        onSuccess: () => {
          setEditingDate(null);
          setEditValue("");
        },
        onError: () => toast.error("Failed to save salary"),
      }
    );
  };

  const handleStartEdit = (weekDate: string) => {
    setEditingDate(weekDate);
    setEditValue(String(salaryMap.get(weekDate) || ""));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Salaries
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setYear((y) => Math.max(2026, y - 1))}
              disabled={year <= 2026}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold w-12 text-center">{year}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setYear((y) => y + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Total: <span className="font-semibold">${totalForYear.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm py-4">Loading...</p>
        ) : (
          <div className="rounded-lg border max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Thursday</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {thursdays.map((thursday, idx) => {
                  const weekDate = formatDate(thursday);
                  const amount = salaryMap.get(weekDate);
                  const isEditing = editingDate === weekDate;

                  return (
                    <TableRow key={weekDate}>
                      <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                      <TableCell className="text-sm">{formatDisplay(thursday)}</TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              className="w-28 h-8 text-right text-sm"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSave(weekDate);
                                if (e.key === "Escape") setEditingDate(null);
                              }}
                              autoFocus
                            />
                            <Button size="sm" className="h-8 px-2 text-xs" onClick={() => handleSave(weekDate)} disabled={upsertSalary.isPending}>
                              Save
                            </Button>
                          </div>
                        ) : (
                          <span
                            className="cursor-pointer hover:text-primary transition-colors px-2 py-1 rounded hover:bg-muted"
                            onClick={() => handleStartEdit(weekDate)}
                          >
                            {amount != null ? `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
