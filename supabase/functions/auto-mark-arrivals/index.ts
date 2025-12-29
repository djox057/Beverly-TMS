import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RADIUS_MILES = 5;
const WAIT_MINUTES = 20;

// Haversine formula to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("🚛 Starting auto-mark arrivals check...");

    // Get all active trucks with their current locations
    const { data: trucks, error: trucksError } = await supabase
      .from("trucks")
      .select(`
        id,
        truck_number,
        latitude,
        longitude,
        last_location_update,
        driver1_id,
        driver2_id
      `)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .not("driver1_id", "is", null);

    if (trucksError) {
      console.error("Error fetching trucks:", trucksError);
      throw trucksError;
    }

    console.log(`📍 Found ${trucks?.length || 0} trucks with locations`);

    const now = new Date();
    const autoMarkedArrivals: string[] = [];

    for (const truck of trucks || []) {
      // Get active orders for this truck (not canceled, not delivered)
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select(`
          id,
          truck_id,
          canceled,
          pickup_drops (
            id,
            type,
            latitude,
            longitude,
            arrived_at,
            order_id
          ),
          order_files (
            id,
            file_category
          )
        `)
        .eq("truck_id", truck.id)
        .eq("canceled", false);

      if (ordersError) {
        console.error(`Error fetching orders for truck ${truck.truck_number}:`, ordersError);
        continue;
      }

      for (const order of orders || []) {
        // Skip if order has POD (fully delivered)
        const hasPOD = order.order_files?.some((f: any) => f.file_category === "POD");
        if (hasPOD) continue;

        const hasBOL = order.order_files?.some((f: any) => f.file_category === "BOL");

        // Get relevant stops based on order status
        const stops = order.pickup_drops || [];
        
        for (const stop of stops) {
          // Skip if already arrived
          if (stop.arrived_at) continue;
          
          // Skip if stop doesn't have location
          if (!stop.latitude || !stop.longitude) continue;

          // Skip pickup stops if BOL is already uploaded (we're past pickup)
          if (stop.type === "pickup" && hasBOL) continue;

          // Skip delivery stops if BOL is NOT uploaded (we're not there yet)
          if (stop.type === "delivery" && !hasBOL) continue;

          // Calculate distance from truck to stop
          const distance = calculateDistance(
            truck.latitude,
            truck.longitude,
            stop.latitude,
            stop.longitude
          );

          console.log(`🔍 Truck ${truck.truck_number} is ${distance.toFixed(2)} miles from ${stop.type} (order ${order.id})`);

          if (distance <= RADIUS_MILES) {
            // Truck is within radius - check if we have a tracking record
            const { data: existingTracking, error: trackingError } = await supabase
              .from("proximity_tracking")
              .select("*")
              .eq("truck_id", truck.id)
              .eq("stop_id", stop.id)
              .single();

            if (trackingError && trackingError.code !== "PGRST116") {
              console.error("Error checking proximity tracking:", trackingError);
              continue;
            }

            if (!existingTracking) {
              // First time in radius - create tracking record
              const { error: insertError } = await supabase
                .from("proximity_tracking")
                .insert({
                  truck_id: truck.id,
                  stop_id: stop.id,
                  order_id: order.id,
                  entered_radius_at: now.toISOString(),
                });

              if (insertError) {
                console.error("Error inserting proximity tracking:", insertError);
              } else {
                console.log(`⏱️ Started tracking truck ${truck.truck_number} at ${stop.type} for order ${order.id}`);
              }
            } else {
              // Already tracking - check if 20 minutes have passed
              const enteredAt = new Date(existingTracking.entered_radius_at);
              const minutesInRadius = (now.getTime() - enteredAt.getTime()) / (1000 * 60);

              console.log(`⏱️ Truck ${truck.truck_number} has been near ${stop.type} for ${minutesInRadius.toFixed(1)} minutes`);

              if (minutesInRadius >= WAIT_MINUTES) {
                // Mark as arrived!
                const { error: updateError } = await supabase
                  .from("pickup_drops")
                  .update({ arrived_at: now.toISOString() })
                  .eq("id", stop.id);

                if (updateError) {
                  console.error("Error marking arrival:", updateError);
                } else {
                  console.log(`✅ Auto-marked truck ${truck.truck_number} as arrived at ${stop.type} for order ${order.id}`);
                  autoMarkedArrivals.push(`${truck.truck_number} at ${stop.type}`);

                  // Delete tracking record
                  await supabase
                    .from("proximity_tracking")
                    .delete()
                    .eq("id", existingTracking.id);
                }
              }
            }
          } else {
            // Truck is outside radius - remove tracking if exists
            const { error: deleteError } = await supabase
              .from("proximity_tracking")
              .delete()
              .eq("truck_id", truck.id)
              .eq("stop_id", stop.id);

            if (!deleteError) {
              // Only log if something was actually deleted
              console.log(`🚫 Truck ${truck.truck_number} left radius, resetting timer for ${stop.type}`);
            }
          }
        }
      }
    }

    // Clean up stale tracking records (older than 24 hours)
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await supabase
      .from("proximity_tracking")
      .delete()
      .lt("entered_radius_at", yesterday.toISOString());

    console.log(`🏁 Auto-mark arrivals complete. Marked ${autoMarkedArrivals.length} arrivals.`);

    return new Response(
      JSON.stringify({
        success: true,
        autoMarkedArrivals,
        trucksChecked: trucks?.length || 0,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in auto-mark-arrivals:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
