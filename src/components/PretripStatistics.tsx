import { applyHistoricalExpectedCounts } from "@/lib/pretripExpectedCounts";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fetchPretripDispatcherHistory, fetchPretripHistoricalTruckCounts, fetchPretripStatisticsEvidence } from "@/lib/pretripStatisticsQuery";
import { buildPretripStatistics, PRETRIP_STATISTICS_START, statisticsWeeks, type StatisticsTruck, type StatisticsRow } from "@/lib/pretripStatistics";
import { pretripDueDate, pretripWeekEnd, stepPretripDate } from "@/lib/pretripDates";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SearchableSelect } from "./SearchableSelect";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const countLabel = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const weekLabel = (week: string) => `${format(parseISO(week), "MMM d")} – ${format(parseISO(pretripWeekEnd(week)), "MMM d, yyyy")}`;

export function PretripStatistics({ trucks, rosterLoading, rosterError, scope }: { trucks: StatisticsTruck[]; rosterLoading: boolean; rosterError: boolean; scope: string }) {
  const currentWeek = pretripDueDate();
  const [from, setFrom] = useState(PRETRIP_STATISTICS_START);
  const [through, setThrough] = useState(() => stepPretripDate(currentWeek, -1));
  const [view, setView] = useState<"drivers" | "dispatchers" | "weekly">("drivers");
  const [search, setSearch] = useState("");
  const weeks = useMemo(() => statisticsWeeks(from, through), [from, through]);
  const options = statisticsWeeks(PRETRIP_STATISTICS_START, currentWeek).map(week => ({ value: week, label: weekLabel(week) }));
  const driverIds = useMemo(() => [...new Set(trucks.flatMap(truck => [truck.driver1_id, truck.driver2_id]).filter(Boolean))].sort() as string[], [trucks]);
  const historyQuery = useQuery({
    queryKey: ["pretrip-dispatcher-history", scope, from, driverIds],
    queryFn: () => fetchPretripDispatcherHistory(from, driverIds),
    enabled: !rosterLoading && !rosterError,
    staleTime: 30_000, refetchInterval: 60_000,
  });
  const countsQuery = useQuery({
    queryKey: ["pretrip-historical-truck-counts", scope, from, through],
    queryFn: () => fetchPretripHistoricalTruckCounts(from, through, scope),
    staleTime: 60_000,
  });
  const query = useQuery({
    queryKey: ["pretrip-statistics", scope, from, through],
    queryFn: () => fetchPretripStatisticsEvidence(from, through),
    staleTime: 30_000, refetchInterval: 60_000,
  });
  const stats = useMemo(() => applyHistoricalExpectedCounts(
    buildPretripStatistics(trucks, weeks, query.data ?? [], historyQuery.data),
    weeks, countsQuery.data ?? { counts: [], names: {} },
  ), [trucks, weeks, query.data, historyQuery.data, countsQuery.data]);
  const rows = stats[view].filter(row => `${row.name} ${row.units.join(" ")}`.toLowerCase().includes(search.toLowerCase()));
  const expected = stats.weekly.reduce((sum, row) => sum + row.expected, 0);
  const expectedAvailable = stats.weekly.every(row => row.expectedAvailable !== false);
  const missing = stats.weekly.reduce((sum, row) => sum + row.missing, 0);
  const completed = stats.weekly.reduce((sum, row) => sum + row.completed, 0);
  const error = rosterError || query.isError || historyQuery.isError || countsQuery.isError;
  const loading = !error && (rosterLoading || query.isPending || historyQuery.isPending || countsQuery.isPending);
  return <Card>
    <CardHeader><CardTitle>Pre-trip statistics</CardTitle>
      <p className="text-sm text-muted-foreground">From September 28, 2026 (week two). One inspection per truck per Chicago calendar week.</p>
      <p className="text-sm text-muted-foreground">Dispatcher and weekly expected totals use the same weekly average of saved daily truck counts as Analytics, using recorded days only. Weekly averages are summed for the selected range.</p>
      <p className="text-sm text-muted-foreground">Completions and driver statistics cover currently active trucks with assigned drivers. Dispatcher attribution uses the primary driver’s assignment at the end of each Chicago week (secondary driver when no primary is assigned). Current week is excluded by default. Historical averages and transfers can produce completion above 100%; missing never falls below zero.</p>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="mb-1 block text-sm">From week</label><SearchableSelect value={from} onValueChange={value => { setFrom(value); if (value > through) setThrough(value); }} options={options} placeholder="From week" searchPlaceholder="Find week..." /></div>
        <div><label className="mb-1 block text-sm">Through week</label><SearchableSelect value={through} onValueChange={setThrough} options={options.filter(o => o.value >= from)} placeholder="Through week" searchPlaceholder="Find week..." /></div>
        <Button variant="outline" onClick={() => { query.refetch(); historyQuery.refetch(); countsQuery.refetch(); }}>Refresh</Button>
      </div>
      {through === currentWeek && <p className="text-sm text-amber-600">Current week is in progress. Missing inspections are still due this week.</p>}
      {!loading && !error && !expectedAvailable && <p className="text-sm text-muted-foreground">Historical truck counts are unavailable for one or more selected weeks. Expected totals and rates are shown as —.</p>}
      {loading ? <p role="status">Loading statistics…</p> : error ? <p role="alert" className="text-destructive">Could not load complete statistics. Refresh to try again.</p> : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[["Expected truck-weeks", expectedAvailable ? countLabel(expected) : "—"], ["Completed", completed], ["Missing", expectedAvailable ? countLabel(missing) : "—"], ["Completion rate", expectedAvailable && expected > 0 ? `${(completed / expected * 100).toFixed(1)}%` : "—"]].map(([label, value]) => <div key={label} className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div>)}
        </div>
        <div className="flex flex-wrap gap-2">
          {(["drivers", "dispatchers", "weekly"] as const).map(tab => <Button key={tab} variant={view === tab ? "default" : "outline"} onClick={() => setView(tab)}>{tab === "weekly" ? "By week" : tab === "drivers" ? "Drivers" : "Dispatchers"}</Button>)}
          <Input aria-label="Search statistics" placeholder="Search name or truck..." className="sm:ml-auto sm:max-w-64" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Table><TableHeader><TableRow><TableHead>{view === "weekly" ? "Week (Chicago)" : view === "drivers" ? "Driver" : "Dispatcher"}</TableHead>{view === "drivers" && <TableHead>Trucks</TableHead>}<TableHead>Expected</TableHead><TableHead>Completed</TableHead><TableHead>Missing</TableHead><TableHead>Completion</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((row: StatisticsRow) => <TableRow key={row.id}><TableCell>{view === "weekly" ? weekLabel(row.id) : row.name}</TableCell>{view === "drivers" && <TableCell>{row.units.join(", ")}</TableCell>}<TableCell>{row.expectedAvailable === false ? "—" : countLabel(row.expected)}</TableCell><TableCell>{row.completed}</TableCell><TableCell>{row.expectedAvailable === false ? "—" : countLabel(row.missing)}</TableCell><TableCell>{row.expectedAvailable !== false && row.expected > 0 ? `${row.rate.toFixed(1)}%` : "—"}</TableCell></TableRow>)}{!rows.length && <TableRow><TableCell colSpan={view === "drivers" ? 6 : 5} className="text-center text-muted-foreground">No matching statistics.</TableCell></TableRow>}</TableBody>
        </Table>
      </>}
    </CardContent>
  </Card>;
}
