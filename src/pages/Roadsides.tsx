import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Plus, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { useLawyerRegister } from "@/hooks/useLawyerRegister";
import { RoadsideGrid } from "@/components/roadsides/RoadsideGrid";
import "./TruckServiceLog.css";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RoadsideEditor } from "@/components/roadsides/RoadsideEditor";
import { displayValue, roadEditors, type RoadRecord, type Sheet } from "@/lib/roadsides";

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
  const editable = !!role && roadEditors.includes(role);
  const cache = useQueryClient();
  const queryKey = ["roadsides", sheet, user?.id];
  const query = useQuery({
    queryKey,
    enabled: sheet === "ALL",
    queryFn: ({ signal }) => loadSheet(sheet, signal),
  });
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [oos, setOos] = useState("");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<RoadRecord | "new" | null>(null);
  const continuous = sheet === "Lawyers";
  const lawyers = useLawyerRegister(continuous, user?.id, search, company, oos);
  const inspectionOptions = useMemo(() => {
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
  const options = continuous ? lawyers.options : inspectionOptions;
  const error = continuous ? lawyers.error : query.error;
  const shown = continuous ? lawyers.rows : filtered.slice(current * size, (current + 1) * size);
  async function saveCell(row: RoadRecord, key: string, value: string) {
    const fields = { ...row.fields, [key]: value };
    if (!value) delete fields[key];
    if (!Object.values(fields).some(text => text.trim())) throw new Error("Keep at least one value in this row.");
    const { data, error } = await supabase.from("roadside_records").update({ fields })
      .eq("id", row.id).eq("updated_at", row.updated_at).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      await cache.invalidateQueries({ queryKey });
      throw new Error("Row changed. Press Escape to review the latest value.");
    }
    if (continuous) {
      await cache.invalidateQueries({ queryKey });
      return;
    }
    await cache.cancelQueries({ queryKey });
    cache.setQueryData<RoadRecord[]>(queryKey, rows => rows?.map(item => item.id === data.id ? data : item));
  }

  const filterClass = "w-[180px] max-w-full data-[state=open]:bg-accent data-[state=open]:text-accent-foreground";

  return <div className="min-w-0 space-y-3">
    <div className="service-log-toolbar flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search aria-hidden className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input aria-label="Search records" placeholder="Search records…" className="pl-9" value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }} />
      </div>
      <Combobox ariaLabel="Filter by company" value={company} className={filterClass}
        searchPlaceholder="Search company..."
        options={[{ value: "", label: "All companies" }, ...options.companies.map(value => ({ value, label: value }))]}
        onValueChange={value => { setCompany(value); setPage(0); }} />
      <Combobox ariaLabel="Filter by OOS" value={oos} className={filterClass}
        searchPlaceholder="Search OOS..."
        options={[{ value: "", label: "All OOS statuses" }, ...options.statuses.map(value => ({ value, label: value }))]}
        onValueChange={value => { setOos(value); setPage(0); }} />
      {editable && <Button onClick={() => setEditor("new")}><Plus className="mr-2 h-4 w-4" />{sheet === "ALL" ? "Add inspection" : "Add case"}</Button>}
    </div>
      {error ? <div role="alert" className="space-y-2"><p>Could not load records. {error.message}</p>
        <Button variant="outline" onClick={() => void (continuous ? lawyers.retry() : query.refetch())}>Retry</Button></div>
      : (continuous ? lawyers.loading : query.isPending) ? <p role="status" className="py-6 text-muted-foreground">Loading records…</p> : <>
        <RoadsideGrid key={continuous ? JSON.stringify([search, company, oos]) : sheet} sheet={sheet} rows={shown} editable={editable} editRow={setEditor} saveCell={saveCell}
          onNearEnd={continuous && !lawyers.nextError ? lawyers.loadMore : undefined}
          emptyMessage={(continuous ? search || company || oos : query.data?.length) ? "No matching records." : "No records yet."} />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{continuous ? `${shown.length} of ${lawyers.total} cases` : filtered.length ? `${current * size + 1}–${current * size + shown.length} of ${filtered.length}` : "0 records"}</span>
          {continuous && lawyers.loadingMore && <span role="status">Loading more cases…</span>}
          {continuous && lawyers.nextError && <div role="alert">Could not load more cases. <Button size="sm" variant="outline" onClick={lawyers.loadMore}>Retry</Button></div>}
          {!continuous && pages > 1 && <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!current} onClick={() => setPage(current - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>Next</Button>
          </div>}
        </div>
      </>}

    {editor && <RoadsideEditor sheet={sheet} record={editor === "new" ? undefined : editor} onClose={() => setEditor(null)} />}
  </div>;
}

export default function Roadsides() {
  const [params, setParams] = useSearchParams();
  const sheet: Sheet = params.get("tab") === "lawyers" ? "Lawyers" : "ALL";
  return <div className="truck-service-log min-w-0 space-y-4 px-2 py-6">
    <div className="flex items-center gap-3 px-2"><ClipboardCheck className="h-8 w-8 text-primary" />
      <h1 className="text-3xl font-bold text-foreground">Roadsides</h1></div>
    <Tabs value={sheet} onValueChange={v => setParams(v === "Lawyers" ? { tab: "lawyers" } : {})}>
      <TabsList><TabsTrigger value="ALL">ALL</TabsTrigger><TabsTrigger value="Lawyers">Lawyers</TabsTrigger></TabsList>
      <TabsContent value={sheet} key={sheet}><Register sheet={sheet} /></TabsContent>
    </Tabs>
  </div>;
}
