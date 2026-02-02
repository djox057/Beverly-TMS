import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { dryRun = true } = await req.json().catch(() => ({ dryRun: true }));

    console.log(`Running cleanup with dryRun=${dryRun}`);

    // First, find all matching orders
    const { data: matchingOrders, error: selectError } = await supabase
      .from('orders')
      .select('id, load_number, internal_load_number, status, freight_amount, driver_price, dh_miles, loaded_miles, created_at')
      .eq('status', 'canceled')
      .eq('freight_amount', 0)
      .eq('driver_price', 0)
      .eq('dh_miles', 0)
      .eq('loaded_miles', 0)
      .lte('created_at', '2026-01-30T23:59:59Z');

    if (selectError) {
      console.error('Error finding orders:', selectError);
      throw selectError;
    }

    console.log(`Found ${matchingOrders?.length || 0} orders matching criteria`);

    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          count: matchingOrders?.length || 0,
          orders: matchingOrders || [],
          message: `Found ${matchingOrders?.length || 0} orders that would be deleted. Set dryRun=false to delete.`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Actually delete the orders
    if (matchingOrders && matchingOrders.length > 0) {
      const orderIds = matchingOrders.map(o => o.id);
      
      // Delete related records first (order_files, order_transfers, etc.)
      console.log('Deleting related order_files...');
      await supabase.from('order_files').delete().in('order_id', orderIds);
      
      console.log('Deleting related order_transfers...');
      await supabase.from('order_transfers').delete().in('order_id', orderIds);
      
      console.log('Deleting related canceled_orders_backup...');
      await supabase.from('canceled_orders_backup').delete().in('order_id', orderIds);
      
      console.log('Deleting related late_notifications...');
      await supabase.from('late_notifications').delete().in('order_id', orderIds);

      // Now delete the orders
      console.log('Deleting orders...');
      const { error: deleteError } = await supabase
        .from('orders')
        .delete()
        .in('id', orderIds);

      if (deleteError) {
        console.error('Error deleting orders:', deleteError);
        throw deleteError;
      }

      console.log(`Successfully deleted ${orderIds.length} orders`);

      return new Response(
        JSON.stringify({
          success: true,
          dryRun: false,
          deletedCount: orderIds.length,
          deletedIds: orderIds,
          message: `Successfully deleted ${orderIds.length} canceled orders with zero values.`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        dryRun: false,
        deletedCount: 0,
        message: 'No orders found matching the criteria.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in cleanup-zero-canceled-orders:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});