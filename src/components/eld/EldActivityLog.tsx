import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatInTimeZone } from 'date-fns-tz';
import type { EldActivity, EldWorker } from '@/lib/eld';

const PAGE_SIZE = 50;
export function EldActivityLog({ date, workers }: { date: string; workers: EldWorker[] }) {
  const { user } = useAuthContext();
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ['eld-activity', user?.id, date, page],
    queryFn: async () => {
      const { data, error } = await supabase.from('eld_activity').select('*').eq('work_date', date)
        .order('created_at', { ascending: false }).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      if (error) throw error;
      const rows = data as EldActivity[];
      const actorIds = [...new Set(rows.flatMap(row => [row.actor_id, ...(row.worker_id ? [row.worker_id] : [])]))];
      const names = new Map(workers.map(w => [w.user_id, w.name]));
      if (actorIds.length) {
        const { data: profiles, error: profileError } = await supabase.from('profiles')
          .select('user_id, full_name, email').in('user_id', actorIds);
        if (profileError) throw profileError;
        profiles?.forEach(p => names.set(p.user_id, p.full_name || p.email));
      }
      return { rows: rows.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE, names };
    },
    refetchInterval: 60_000,
  });
  if (query.isPending) return <p className="p-6 text-muted-foreground">Loading activity…</p>;
  if (query.error) return <p role="alert" className="p-6 text-destructive">{query.error.message}</p>;
  return <div className="space-y-3">
    <p className="text-sm text-muted-foreground">Every saved change, assignment and side task completion. Times shown in Chicago time.</p>
    <div className="rounded-md border overflow-x-auto"><Table>
      <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Changed by</TableHead><TableHead>ELD person</TableHead><TableHead>Item</TableHead><TableHead>Changes</TableHead></TableRow></TableHeader>
      <TableBody>{query.data.rows.map(row => <TableRow key={row.id}>
        <TableCell className="whitespace-nowrap">{formatInTimeZone(row.created_at, 'America/Chicago', 'MM/dd HH:mm:ss')}</TableCell>
        <TableCell>{query.data.names.get(row.actor_id) || 'User'}</TableCell>
        <TableCell>{row.worker_id ? query.data.names.get(row.worker_id) || 'Former ELD worker' : 'Unassigned'}</TableCell>
        <TableCell className="min-w-40">{String(row.after_data?.driver_name || row.after_data?.description || row.entity_type)}</TableCell>
        <TableCell className="min-w-64 text-sm">{Object.entries(row.after_data ?? {}).filter(([key]) => !['driver_name', 'description'].includes(key)).map(([key, value]) => {
          const display = (v: unknown) => typeof v === 'boolean' ? v ? 'Checked' : 'Unchecked' : key === 'worker_id' ? v ? query.data.names.get(String(v)) || 'ELD worker' : 'Unassigned' : String(v ?? '');
          return <div key={key}><span className="font-medium">{key === 'comment' ? 'Note' : key.replace(/_/g, ' ')}:</span> {display(row.before_data?.[key])} → {display(value)}</div>;
        })}{row.action === 'created' && 'Side task added'}</TableCell>
      </TableRow>)}{!query.data.rows.length && <TableRow><TableCell colSpan={5} className="text-center h-24 text-muted-foreground">No activity for this date.</TableCell></TableRow>}</TableBody>
    </Table></div>
    <div className="flex justify-end items-center gap-3"><Button variant="outline" disabled={!page} onClick={() => setPage(p => p - 1)}>Previous</Button><span className="text-sm">Page {page + 1}</span><Button variant="outline" disabled={!query.data.hasMore} onClick={() => setPage(p => p + 1)}>Next</Button></div>
  </div>;
}
