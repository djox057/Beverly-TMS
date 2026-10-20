import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const totals=useMemo(()=>summarizePrebookManagers(rows,managers.data||[]).filter(row=>row.gross>0),[rows,managers.data]);
  return <Card><CardHeader>
    <CardTitle className="text-base">Prebook performance by manager</CardTitle>
    <p className="text-sm text-muted-foreground">Credited to the original booking manager. Canceled loads excluded. RPM uses loaded + DH miles.</p>
  </CardHeader><CardContent>
    {isLoading || managers.isPending ? <p>Loading manager statistics…</p> : managers.error ? <p role="alert">Could not load manager statistics.</p> :
      totals.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {totals.map(row=><Card key={row.id} className="bg-muted/20">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">{row.name}</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><p className="text-sm text-muted-foreground">Gross</p><p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(row.gross)}</p></div>
            <div><p className="text-xs text-muted-foreground">Miles (Loaded + DH)</p><p className="text-lg font-semibold">{row.miles.toLocaleString('en-US',{maximumFractionDigits:2})}</p></div>
            <div><p className="text-xs text-muted-foreground">RPM</p><p className="text-lg font-semibold">{row.rpm==null?'—':formatCurrency(row.rpm)}</p></div>
          </CardContent>
        </Card>)}
      </div> : <p className="text-sm text-muted-foreground">No managers with gross above $0.</p>}
  </CardContent></Card>;
}
