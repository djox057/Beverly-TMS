import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";

interface StatRow {
  canceled: boolean;
  freightAmount: number | null;
  bookedByCompany: string;
}

interface Props {
  rows: StatRow[];
  isLoading?: boolean;
}

export const RecoveryLoadsStats = ({ rows, isLoading }: Props) => {
  const stats = useMemo(() => {
    const total = rows.length;
    const canceled = rows.filter((r) => r.canceled);
    const active = rows.filter((r) => !r.canceled);
    const sum = (list: StatRow[]) =>
      list.reduce((acc, r) => acc + (r.freightAmount || 0), 0);

    const byCompany = new Map<string, { total: number; canceled: number }>();
    rows.forEach((r) => {
      const key = r.bookedByCompany || "—";
      const entry = byCompany.get(key) || { total: 0, canceled: 0 };
      entry.total += 1;
      if (r.canceled) entry.canceled += 1;
      byCompany.set(key, entry);
    });

    return {
      total,
      canceledCount: canceled.length,
      activeCount: active.length,
      canceledFreight: sum(canceled),
      activeFreight: sum(active),
      companies: Array.from(byCompany.entries())
        .map(([name, v]) => ({ name, ...v, notCanceled: v.total - v.canceled }))
        .sort((a, b) => b.total - a.total),
    };
  }, [rows]);

  const recoveryPct =
    stats.total > 0 ? `${((stats.activeCount / stats.total) * 100).toFixed(1)}%` : "—";

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Loading statistics...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Recovery Loads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Not Canceled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-primary">{stats.activeCount}</div>
            <div className="text-xs text-muted-foreground">
              {pct(stats.activeCount)} · {formatCurrency(stats.activeFreight)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Canceled</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-destructive">{stats.canceledCount}</div>
            <div className="text-xs text-muted-foreground">
              {pct(stats.canceledCount)} · {formatCurrency(stats.canceledFreight)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Breakdown by Booked By Company</CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[260px]">Company</TableHead>
                <TableHead className="w-[100px]">Total</TableHead>
                <TableHead className="w-[120px]">Not Canceled</TableHead>
                <TableHead className="w-[120px]">Canceled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.companies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No recovery loads found.
                  </TableCell>
                </TableRow>
              ) : (
                stats.companies.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="truncate">{c.name}</TableCell>
                    <TableCell>{c.total}</TableCell>
                    <TableCell>{c.notCanceled}</TableCell>
                    <TableCell className="text-destructive">{c.canceled}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};