import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface StatRow {
  canceled: boolean;
  freightAmount: number | null;
  bookedByCompany: string;
  prebook: boolean;
  recovered: boolean;
  covered: boolean;
  completed: boolean;
}
interface Props { rows: StatRow[]; isLoading?: boolean }
const summarize = (rows: StatRow[]) => {
  const covered = rows.filter(row => !row.canceled && (row.prebook ? row.covered || row.completed : row.recovered)).length;
  return { total: rows.length, covered, canceled: rows.filter(row => row.canceled).length, percent: rows.length ? `${(covered / rows.length * 100).toFixed(1)}%` : "—" };
};
export const RecoveryLoadsStats = ({ rows, isLoading }: Props) => {
  if (isLoading) return <Card><CardContent className="py-10 text-center text-muted-foreground">Loading statistics...</CardContent></Card>;
  const recovery = summarize(rows.filter(row => !row.prebook));
  const prebook = summarize(rows.filter(row => row.prebook));
  const metrics = [
    { title: "Total Loads", recovery: recovery.total, prebook: prebook.total, color: "" },
    { title: "Recovered / Covered", recovery: recovery.covered, prebook: prebook.covered, color: "text-primary" },
    { title: "Canceled", recovery: recovery.canceled, prebook: prebook.canceled, color: "text-destructive" },
    { title: "% Recovered / Covered", recovery: recovery.percent, prebook: prebook.percent, color: "text-primary" },
  ];
  const companies = [...new Set(rows.map(row => row.bookedByCompany || "—"))].sort();
  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map(metric => <Card key={metric.title}>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{metric.title}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 divide-x">
          <div className="pr-3"><div className="text-xs text-muted-foreground">Recovery</div><div className={`text-2xl font-semibold ${metric.color}`}>{metric.recovery}</div></div>
          <div className="pl-3"><div className="text-xs text-muted-foreground">Prebook</div><div className={`text-2xl font-semibold ${metric.color}`}>{metric.prebook}</div></div>
        </CardContent>
      </Card>)}
    </div>
    <Card className="overflow-x-auto"><CardHeader><CardTitle className="text-base">Breakdown by Booked By Company</CardTitle></CardHeader><CardContent>
      <Table><TableHeader><TableRow><TableHead rowSpan={2}>Company</TableHead><TableHead colSpan={3}>Recovery</TableHead><TableHead colSpan={3}>Prebook</TableHead></TableRow><TableRow>{["Total", "Recovered", "Canceled", "Total", "Covered", "Canceled"].map((label, index) => <TableHead key={index}>{label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{companies.length ? companies.map(company => {
          const companyRows = rows.filter(row => (row.bookedByCompany || "—") === company);
          const r = summarize(companyRows.filter(row => !row.prebook));
          const p = summarize(companyRows.filter(row => row.prebook));
          return <TableRow key={company}><TableCell>{company}</TableCell><TableCell>{r.total}</TableCell><TableCell>{r.covered}</TableCell><TableCell className="text-destructive">{r.canceled}</TableCell><TableCell>{p.total}</TableCell><TableCell>{p.covered}</TableCell><TableCell className="text-destructive">{p.canceled}</TableCell></TableRow>;
        }) : <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No loads found.</TableCell></TableRow>}</TableBody>
      </Table>
    </CardContent></Card>
  </div>;
};
