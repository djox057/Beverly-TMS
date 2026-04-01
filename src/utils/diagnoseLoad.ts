import { supabase } from "@/integrations/supabase/client";

export async function diagnoseLoadMiles(internalLoadNumber: number | string) {
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
    
    // Update the order with the correct miles
    if (data.success && data.calculatedMiles !== data.currentMiles) {
      const { error: updateError } = await supabase
        .from('orders')
        .update({ loaded_miles: data.calculatedMiles })
        .eq('internal_load_number', String(internalLoadNumber));
      
      if (updateError) {
        console.error('❌ Error updating miles:', updateError);
        throw updateError;
      }
      
      console.log('✅ Updated miles in database');
    }
    
    return data;
  } catch (error) {
    console.error('❌ Failed to diagnose load:', error);
    throw error;
  }
}
