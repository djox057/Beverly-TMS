import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const chunk = 50;

// The index supplies workbook order, total and filter choices without downloading case details.
async function loadIndex(signal: AbortSignal) {
  type IndexRow = { id: string; company: string; oos: string; created_at: string; source_row: number | null };
  const rows: IndexRow[] = [];
  const projection = "id,created_at,source_row,company:fields->>company,oos:fields->>oos";
  let cursor: string | undefined;
  for (;;) {
    let q = supabase.from("roadside_records").select<typeof projection, IndexRow>(projection)
      .eq("sheet", "Lawyers").order("id").limit(500);
    if (cursor) q = q.gt("id", cursor);
    const { data, error } = await q.abortSignal(signal);
    if (error) throw new Error(error.message);
    rows.push(...data.map(row => ({ ...row, company: row.company?.trim() ?? "", oos: row.oos?.trim() ?? "" })));
    if (data.length < 500) break;
    cursor = data[data.length - 1].id;
  }
  return rows.sort((a, b) => (a.source_row ?? 0) - (b.source_row ?? 0)
    || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
}

async function loadSearchText(signal: AbortSignal) {
  const text: Record<string, string[]> = {};
  let cursor: string | undefined;
  for (;;) {
    let q = supabase.from("roadside_records").select("id,fields,notes").eq("sheet", "Lawyers").order("id").limit(500);
    if (cursor) q = q.gt("id", cursor);
    const { data, error } = await q.abortSignal(signal);
    if (error) throw new Error(error.message);
    for (const row of data) text[row.id] = [...Object.values(row.fields), ...Object.values(row.notes)].map(s => s.toLowerCase());
    if (data.length < 500) return text;
    cursor = data[data.length - 1].id;
  }
}

export function useLawyerRegister(enabled: boolean, userId: string | undefined, search: string, company: string, oos: string) {
  const key = ["roadsides", "Lawyers", userId];
  const term = search.toLowerCase().trim();
  const index = useQuery({ queryKey: [...key, "index"], enabled, queryFn: ({ signal }) => loadIndex(signal) });
  const searchText = useQuery({ queryKey: [...key, "search"], enabled: enabled && !!term, queryFn: ({ signal }) => loadSearchText(signal) });
  const ids = useMemo(() => (index.data ?? []).filter(row =>
    (!company || row.company === company) && (!oos || row.oos === oos)
    && (!term || searchText.data?.[row.id]?.some(value => value.includes(term)))).map(row => row.id),
    [index.data, company, oos, term, searchText.data]);
  const options = useMemo(() => {
    const distinct = (key: "company" | "oos") => [...new Set((index.data ?? []).map(row => row[key]).filter(Boolean))].sort();
    return { companies: distinct("company"), statuses: distinct("oos") };
  }, [index.data]);
  const pages = useInfiniteQuery({
    queryKey: [...key, "rows", ids],
    enabled: enabled && index.isSuccess && (!term || searchText.isSuccess),
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const batch = ids.slice(pageParam, pageParam + chunk);
      if (!batch.length) return [];
      const { data, error } = await supabase.from("roadside_records").select("*").eq("sheet", "Lawyers").in("id", batch).abortSignal(signal);
      if (error) throw new Error(error.message);
      const positions = new Map(batch.map((id, i) => [id, i]));
      return data.sort((a, b) => positions.get(a.id)! - positions.get(b.id)!);
    },
    getNextPageParam: (_last, _all, offset) => offset + chunk < ids.length ? offset + chunk : undefined,
  });
  return {
    options, total: ids.length, rows: pages.data?.pages.flat() ?? [],
    loading: index.isPending || (!!term && searchText.isPending) || pages.isPending,
    error: index.error || (term ? searchText.error : null) || (!pages.data ? pages.error : null),
    retry: () => index.isError ? index.refetch() : term && searchText.isError ? searchText.refetch() : pages.refetch(),
    loadingMore: pages.isFetchingNextPage, nextError: pages.isFetchNextPageError,
    loadMore: pages.hasNextPage && !pages.isFetching ? () => { void pages.fetchNextPage({ cancelRefetch: false }); } : undefined,
  };
}
