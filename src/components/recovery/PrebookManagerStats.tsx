import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { summarizePrebookManagers, type PrebookStatsLoad } from '@/lib/prebookManagerStats';

/** Mounted only for admins by RecoveryLoads. */
export function PrebookManagerStats({rows,isLoading}:{rows:PrebookStatsLoad[];isLoading:boolean}) {
  const managers = useQuery({
    queryKey:['prebook-statistics-managers'],
    queryFn:async()=>{
      const roles=await supabase.from('user_roles').select('user_id').eq('role','manager');
      if(roles.error) throw roles.error;
      const ids=[...new Set((roles.data||[]).map(role=>role.user_id))];
      if(!ids.length) return [];
      const profiles=await supabase.from('profiles').select('user_id,full_name').in('user_id',ids);
      if(profiles.error) throw profiles.error;
      return profiles.data||[];
    },
    staleTime:60000,
  });
  const totals=useMemo(()=>summarizePrebookManagers(rows,managers.data||[]),[rows,managers.data]);
  return <Card><CardHeader>
    <CardTitle className="text-base">Prebook performance by manager</CardTitle>
    <p className="text-sm text-muted-foreground">Credited to the original booking manager. Canceled loads excluded. RPM uses loaded + DH miles.</p>
  </CardHeader><CardContent className="overflow-x-auto">
    {isLoading || managers.isPending ? <p>Loading manager statistics…</p> : managers.error ? <p role="alert">Could not load manager statistics.</p> :
      <Table><TableHeader><TableRow><TableHead>Manager</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Miles (Loaded + DH)</TableHead><TableHead className="text-right">RPM</TableHead></TableRow></TableHeader>
        <TableBody>{totals.map(row=><TableRow key={row.id}><TableCell>{row.name}</TableCell><TableCell className="text-right">{formatCurrency(row.gross)}</TableCell><TableCell className="text-right">{row.miles.toLocaleString('en-US',{maximumFractionDigits:2})}</TableCell><TableCell className="text-right">{row.rpm==null?'—':formatCurrency(row.rpm)}</TableCell></TableRow>)}</TableBody>
      </Table>}
  </CardContent></Card>;
}
