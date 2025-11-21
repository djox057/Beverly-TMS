import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useDriverEmailLog = () => {
  return useQuery({
    queryKey: ['driver-email-log'],
    queryFn: async () => {
      console.log('📧 Fetching driver email log...');
      const { data, error } = await supabase
        .from('driver_email_log')
        .select('order_id, sent_at')
        .order('sent_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching email log:', error);
        throw error;
      }

      console.log('✅ Email log data:', data);

      // Create a Map for quick lookups by order_id
      const emailMap = new Map<string, Date>();
      data?.forEach(log => {
        if (!emailMap.has(log.order_id)) {
          emailMap.set(log.order_id, new Date(log.sent_at));
        }
      });

      console.log('📬 Email map created with', emailMap.size, 'entries');

      return emailMap;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
