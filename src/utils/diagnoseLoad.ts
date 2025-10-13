import { supabase } from "@/integrations/supabase/client";

export async function diagnoseLoadMiles(internalLoadNumber: number) {
  try {
    console.log('🔍 Diagnosing load miles for internal load:', internalLoadNumber);
    
    const { data, error } = await supabase.functions.invoke('recalculate-load-miles', {
      body: { internalLoadNumber }
    });
    
    if (error) {
      console.error('❌ Error diagnosing load:', error);
      throw error;
    }
    
    console.log('📊 Diagnosis results:', data);
    return data;
  } catch (error) {
    console.error('❌ Failed to diagnose load:', error);
    throw error;
  }
}
