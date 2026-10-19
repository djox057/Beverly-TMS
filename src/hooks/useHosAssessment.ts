import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { HosAssessment } from '../../supabase/functions/_shared/hos-planner';

export interface HosDraft {
  driverId?: string | null; teamDriverId?: string | null; truckId?: string | null; orderId?: string | null;
  dhMiles: number | null; loadedMiles: number | null;
  stops: { type: 'pickup' | 'delivery'; datetime: string | null; end_datetime?: string | null; latitude?: number | null; longitude?: number | null }[];
}
export function useHosAssessment(draft: HosDraft | null, enabled = true) {
  const signature = JSON.stringify(draft);
  const [settled, setSettled] = useState(signature);
  useEffect(() => { const timer = setTimeout(() => setSettled(signature), 700); return () => clearTimeout(timer); }, [signature]);
  const query = useQuery({
    queryKey: ['hos-assessment', settled],
    enabled: enabled && !!draft && settled === signature,
    queryFn: async (): Promise<HosAssessment> => {
      const { data, error } = await supabase.functions.invoke('hos-load-check', { body: {mode:'preview', draft:JSON.parse(settled)} });
      if (error) throw error;
      return data;
    },
    retry: false, staleTime: 30000, gcTime: 60000, refetchInterval: 60000, refetchOnWindowFocus: true,
  });
  return { assessment: query.data, loading: enabled && !!draft && (signature !== settled || query.isFetching), error: query.error };
}
export async function checkCreatedOrderHos(orderId: string) {
  // The database queue is durable; this call only speeds up its processing.
  try { await supabase.functions.invoke('hos-load-check', { body: { mode:'created', orderId } }); }
  catch { /* Existing HOS sync retries the queued check. */ }
}
