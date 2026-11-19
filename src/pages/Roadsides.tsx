import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, ExternalLink, Pencil, Plus, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RoadsideEditor } from "@/components/roadsides/RoadsideEditor";
import { columns, displayValue, highlightStyles, roadEditors, webLink, type RoadRecord, type Sheet } from "@/lib/roadsides";

async function loadSheet(sheet: Sheet, signal: AbortSignal) {
  const records: RoadRecord[] = [];
  let cursor: string | undefined;
  // Stable keyset pagination also works after the register exceeds the API row limit.
  for (;;) {
    let query = supabase.from("roadside_records").select("*").eq("sheet", sheet).order("id").limit(500);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query.abortSignal(signal);
    if (error) throw new Error(error.message);
    records.push(...data);
    if (data.length < 500) break;
    cursor = data[data.length - 1].id;
  }
  return records.sort((a, b) => {
    if (a.source_row === null && b.source_row === null) return b.created_at.localeCompare(a.created_at);
    return (a.source_row ?? 0) - (b.source_row ?? 0);
  });
}

function Register({ sheet }: { sheet: Sheet }) {
  const { user, getPrimaryRole } = useAuthContext();
  const role = getPrimaryRole();
  const editable = role && roadEditors.includes(role);
  const query = useQuery({
    queryKey: ["roadsides", sheet, user?.id],
    queryFn: ({ signal }) => loadSheet(sheet, signal),
  });
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [oos, setOos] = useState("");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<RoadRecord | "new" | null>(null);
  const options = useMemo(() => {
    const values = (key: string) => Array.from(new Set((query.data ?? []).map(r => r.fields[key]?.trim()).filter(Boolean))).sort();
    return { companies: values("company"), statuses: values("oos") };
  }, [query.data]);
  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return (query.data ?? []).filter(r => (!company || r.fields.company?.trim() === company)
      && (!oos || r.fields.oos?.trim() === oos)
      && (!term || Object.entries(r.fields).some(([key, value]) => (value + " " + displayValue(key, value)).toLowerCase().includes(term))
        || Object.values(r.notes).some(note => note.toLowerCase().includes(term))));
  }, [query.data, company, oos, search]);
  const size = 50;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * size, (current + 1) * size);
  const schema = columns[sheet];
  const selectClass = "h-10 max-w-full rounded-md border border-input bg-background px-3 text-sm";

  return <Card>
    <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
      <div className="relative min-w-48 flex-1">
        <Search aria-hidden className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input aria-label="Search records" placeholder="Search records…" className="pl-9" value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }} />
      </div>
      <select aria-label="Filter by company" className={selectClass} value={company} onChange={e => { setCompany(e.target.value); setPage(0); }}>
        <option value="">All companies</option>{options.companies.map(v => <option key={v}>{v}</option>)}
      </select>
      <select aria-label="Filter by OOS" className={selectClass} value={oos} onChange={e => { setOos(e.target.value); setPage(0); }}>
        <option value="">All OOS statuses</option>{options.statuses.map(v => <option key={v}>{v}</option>)}
      </select>
      {editable && <Button onClick={() => setEditor("new")}><Plus className="mr-2 h-4 w-4" />{sheet === "ALL" ? "Add inspection" : "Add case"}</Button>}
    </CardHeader>
    <CardContent>
      {query.isError ? <div role="alert" className="space-y-2"><p>Could not load records. {query.error.message}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>Retry</Button></div>
      : query.isPending ? <p role="status" className="py-6 text-muted-foreground">Loading records…</p> : <>
        <div className="max-h-[65vh] overflow-auto rounded-md border">
          <Table className="w-max min-w-full">
            <TableHeader className="sticky top-0 z-10 bg-muted"><TableRow>
              {editable && <TableHead><span className="sr-only">Edit</span></TableHead>}
              {schema.map(col => <TableHead key={col.key} className="h-10 max-w-44 px-3">{col.label}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>{shown.map(row => <TableRow key={row.id} className="border-b">
              {editable && <TableCell className="p-1"><Button size="icon" variant="ghost" aria-label={`Edit ${row.fields.driver || "record"}`} onClick={() => setEditor(row)}>
                <Pencil className="h-4 w-4" /></Button></TableCell>}
              {schema.map(col => {
                const value = displayValue(col.key, row.fields[col.key]);
                const url = webLink(row.links[col.key]);
                return <TableCell key={col.key} className={`max-w-72 whitespace-pre-line break-words px-3 py-2 ${highlightStyles[row.highlights[col.key]] ?? ""}`}>
                  {url ? <a className="text-primary underline" href={url} target="_blank" rel="noopener noreferrer">
                    {value || "Open document"} <ExternalLink className="inline h-3 w-3" /></a> : value || "—"}
                  {row.notes[col.key] && <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Cell note</summary>{row.notes[col.key]}</details>}
                </TableCell>;
              })}
            </TableRow>)}</TableBody>
          </Table>
          {!shown.length && <p className="p-5 text-sm text-muted-foreground">{query.data?.length ? "No matching records." : "No records yet."}</p>}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{filtered.length ? `${current * size + 1}–${current * size + shown.length} of ${filtered.length}` : "0 records"}</span>
          {pages > 1 && <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!current} onClick={() => setPage(current - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>Next</Button>
          </div>}
        </div>
      </>}
    </CardContent>
    {editor && <RoadsideEditor sheet={sheet} record={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} />}
  </Card>;
}

export default function Roadsides() {
  const [params, setParams] = useSearchParams();
  const sheet: Sheet = params.get("tab") === "lawyers" ? "Lawyers" : "ALL";
  return <div className="min-w-0 space-y-6 px-2 py-6">
    <div className="flex items-center gap-3 px-2"><ClipboardCheck className="h-8 w-8 text-primary" />
      <h1 className="text-3xl font-bold text-foreground">Roadsides</h1></div>
    <Tabs value={sheet} onValueChange={v => setParams(v === "Lawyers" ? { tab: "lawyers" } : {})}>
      <TabsList><TabsTrigger value="ALL">ALL</TabsTrigger><TabsTrigger value="Lawyers">Lawyers</TabsTrigger></TabsList>
      <TabsContent value={sheet} key={sheet}><Register sheet={sheet} /></TabsContent>
    </Tabs>
  </div>;
}
