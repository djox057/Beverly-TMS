import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DriverStats {
  date: string;
  driver_id: string;
  dispatcher_id: string;
  office: string;
  has_lost_day: boolean;
  has_home_time: boolean;
  has_reschedule: boolean;
  lost_day_note: string | null;
  reschedule_order_id: string | null;
}

interface Driver {
  id: string;
  name: string;
  dispatcher_id: string;
  is_active: boolean;
}

interface Profile {
  user_id: string;
  office: string;
}

interface LostDayNote {
  driver_id: string;
  note_type: string | null;
  note: string | null;
}

interface Order {
  id: string;
  driver1_id: string | null;
  driver2_id: string | null;
  pickup_datetime: string | null;
  delivery_datetime: string | null;
  original_delivery_datetime: string | null;
  date_change_notes: string | null;
  canceled: boolean;
}

function getChicagoDate(): string {
  const chicago = new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [month, day, year] = chicago.split("/");
  return `${year}-${month}-${day}`;
}

function subtractDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + "T12:00:00Z");
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

function parseRescheduledOriginalDate(notes: string): string | null {
  // LEGACY FALLBACK: Parse "Supposed to deliver on MM/DD/YYYY" from date_change_notes
  const regex = /Supposed to deliver on (\d{2})\/(\d{2})\/(\d{4})/;
  const match = notes.match(regex);
  if (match) {
    const [_, month, day, year] = match;
    return `${year}-${month}-${day}`;
  }
  return null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Auth check: CRON_SECRET or admin/manager JWT ---
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const cronSecret = Deno.env.get('CRON_SECRET');
    let authorized = false;
    if (cronSecret && token === cronSecret) {
      authorized = true;
    } else if (authHeader.startsWith('Bearer ')) {
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData } = await authClient.auth.getUser();
      if (userData?.user) {
        const adminClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        const { data: roles } = await adminClient
          .from('user_roles').select('role').eq('user_id', userData.user.id);
        if (roles?.some((r: any) => ['admin','manager'].includes(r.role))) {
          authorized = true;
        }
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Support both GET query params and POST body
    const url = new URL(req.url);
    let targetDate = url.searchParams.get("date");
    let backfill = url.searchParams.get("backfill") === "true";
    let fromDate = url.searchParams.get("from");
    let toDate = url.searchParams.get("to");

    // If POST, also check body
    if (req.method === "POST") {
      try {
        const body = await req.json();
        targetDate = body.date || targetDate;
        backfill = body.backfill || backfill;
        fromDate = body.from || fromDate;
        toDate = body.to || toDate;
      } catch {
        // Ignore JSON parse errors, use query params
      }
    }

    targetDate = targetDate || getChicagoDate();

    console.log(`Recording stats for date: ${targetDate}, backfill: ${backfill}`);

    // If backfill mode with date range
    if (backfill && fromDate && toDate) {
      const results = [];
      const start = new Date(fromDate);
      const end = new Date(toDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        const result = await recordStatsForDate(supabase, dateStr);
        results.push(result);
      }

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single date recording
    const result = await recordStatsForDate(supabase, targetDate);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error recording daily driver stats:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// deno-lint-ignore no-explicit-any
async function recordStatsForDate(supabase: any, targetDate: string) {
  console.log(`Processing date: ${targetDate}`);

  // Step 1: Get all active drivers with their dispatcher/office info
  const { data: driversData, error: driversError } = await supabase
    .from("drivers")
    .select(`id, name, dispatcher_id, is_active`)
    .eq("is_active", true)
    .not("dispatcher_id", "is", null);

  if (driversError) {
    console.error("Error fetching drivers:", driversError);
    throw driversError;
  }

  const drivers = driversData as Driver[];

  // Get dispatcher profiles for office info
  const dispatcherIds = [...new Set(drivers?.map((d) => d.dispatcher_id) || [])];
  
  const { data: profilesData, error: profilesError } = await supabase
    .from("profiles")
    .select("user_id, office")
    .in("user_id", dispatcherIds);

  if (profilesError) {
    console.error("Error fetching profiles:", profilesError);
    throw profilesError;
  }

  const profiles = profilesData as Profile[];
  const profileMap = new Map(profiles?.map((p) => [p.user_id, p.office]) || []);

  // Step 2: Get all lost_day_notes for the target date (for home_time detection)
  const { data: lostDayNotesData, error: notesError } = await supabase
    .from("lost_day_notes")
    .select("driver_id, note_type, note")
    .eq("date", targetDate);

  if (notesError) {
    console.error("Error fetching lost day notes:", notesError);
    throw notesError;
  }

  const lostDayNotes = lostDayNotesData as LostDayNote[];
  const homeTimeDrivers = new Set<string>();
  const lostDayNoteMap = new Map<string, string | null>();
  
  lostDayNotes?.forEach((note) => {
    if (note.note_type === "home_time") {
      homeTimeDrivers.add(note.driver_id);
    }
    lostDayNoteMap.set(note.driver_id, note.note);
  });

  // Step 3: Fetch ALL non-canceled orders with pickup within last 30 days + future
  // Include BOTH driver1_id and driver2_id for team driver support
  const lookbackDate = subtractDays(targetDate, 30);
  
  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select("id, driver1_id, driver2_id, pickup_datetime, delivery_datetime, original_delivery_datetime, date_change_notes, canceled")
    .eq("canceled", false)
    .gte("pickup_datetime", lookbackDate + "T00:00:00")
    .order("pickup_datetime", { ascending: false });

  if (ordersError) {
    console.error("Error fetching orders:", ordersError);
    throw ordersError;
  }

  const orders = (ordersData || []) as Order[];
  
  // Group orders by driver (BOTH driver1 and driver2)
  const ordersByDriver = new Map<string, Order[]>();
  for (const order of orders) {
    // Add to driver1's list
    if (order.driver1_id) {
      if (!ordersByDriver.has(order.driver1_id)) {
        ordersByDriver.set(order.driver1_id, []);
      }
      ordersByDriver.get(order.driver1_id)!.push(order);
    }
    // Also add to driver2's list (team driver)
    if (order.driver2_id) {
      if (!ordersByDriver.has(order.driver2_id)) {
        ordersByDriver.set(order.driver2_id, []);
      }
      ordersByDriver.get(order.driver2_id)!.push(order);
    }
  }

  // Step 4: Build stats records for each driver
  const statsToInsert: DriverStats[] = [];

  for (const driver of drivers || []) {
    const office = profileMap.get(driver.dispatcher_id) || "Unknown";
    const driverOrders = ordersByDriver.get(driver.id) || [];

    // PRIORITY 1: Check for home time - if set, NOT a lost day
    const hasHomeTime = homeTimeDrivers.has(driver.id);
    
    // WALKBACK ALGORITHM: Determine if this is a lost day (only if NOT home time)
    const isLostDay = hasHomeTime ? false : isLostDayWalkback(driverOrders, targetDate);
    
    // RESCHEDULE DETECTION: Check if targetDate falls in any reschedule range
    // This is separate tracking for reschedule-specific lost days
    const hasReschedule = hasHomeTime ? false : isRescheduleLostDay(driverOrders, targetDate, driver.id);

    statsToInsert.push({
      date: targetDate,
      driver_id: driver.id,
      dispatcher_id: driver.dispatcher_id,
      office: office,
      // Combined logic: lost day = walkback lost OR reschedule lost, but NOT if home time
      has_lost_day: isLostDay || hasReschedule,
      has_home_time: hasHomeTime,
      has_reschedule: hasReschedule,
      lost_day_note: lostDayNoteMap.get(driver.id) || null,
      reschedule_order_id: null,
    });
  }

  console.log(`Upserting ${statsToInsert.length} records for ${targetDate}`);

  // Step 5: Upsert all records
  const { error: insertError } = await supabase
    .from("daily_driver_stats")
    .upsert(statsToInsert, { 
      onConflict: "date,driver_id",
      ignoreDuplicates: false 
    });

  if (insertError) {
    console.error("Error upserting stats:", insertError);
    throw insertError;
  }

  // Return summary
  const summary = {
    date: targetDate,
    total_drivers: statsToInsert.length,
    lost_days: statsToInsert.filter((s) => s.has_lost_day).length,
    home_time: statsToInsert.filter((s) => s.has_home_time).length,
    reschedules: statsToInsert.filter((s) => s.has_reschedule).length,
  };

  console.log(`Summary for ${targetDate}:`, summary);

  return summary;
}

/**
 * WALKBACK ALGORITHM: Determines if a date is a lost day for a driver
 * 
 * 1. Check if driver has a pickup on targetDate → NOT a lost day
 * 2. Walk backwards day-by-day up to 30 days to find most recent pickup
 * 3. When found, check if delivery_datetime > targetDate → NOT a lost day (in transit)
 * 4. If delivery_datetime <= targetDate → IS a lost day (load complete)
 * 5. If no pickup found in 30 days → IS a lost day (idle)
 */
function isLostDayWalkback(orders: Order[], targetDate: string): boolean {
  // Step 1: Check if driver has a pickup on targetDate
  const hasPickupToday = orders.some(order => {
    if (!order.pickup_datetime) return false;
    const pickupDate = order.pickup_datetime.split("T")[0];
    return pickupDate === targetDate;
  });

  if (hasPickupToday) {
    return false; // Has pickup today → NOT a lost day
  }

  // Step 2: Walk backwards to find most recent pickup before targetDate
  for (let daysBack = 1; daysBack <= 30; daysBack++) {
    const checkDate = subtractDays(targetDate, daysBack);
    
    // Find order with pickup on this checkDate
    const orderOnDate = orders.find(order => {
      if (!order.pickup_datetime) return false;
      const pickupDate = order.pickup_datetime.split("T")[0];
      return pickupDate === checkDate;
    });

    if (orderOnDate) {
      // Found a load with pickup on checkDate
      if (!orderOnDate.delivery_datetime) {
        // No delivery date → treat as lost day (shouldn't happen but handle it)
        return true;
      }

      const deliveryDate = orderOnDate.delivery_datetime.split("T")[0];
      
      // If delivery date > targetDate → driver is still in transit → NOT a lost day
      // If delivery date <= targetDate → load is complete → IS a lost day
      if (deliveryDate > targetDate) {
        return false; // Still in transit
      } else {
        return true; // Load complete, is a lost day
      }
    }
  }

  // No pickup found in 30 days → driver is idle → IS a lost day
  return true;
}

/**
 * RESCHEDULE DETECTION: Check if targetDate falls in a reschedule lost day range
 * 
 * Uses original_delivery_datetime (structured) with fallback to regex parsing.
 * 
 * For rescheduled orders:
 * - Range: original_delivery_date to actual_delivery_date (BOTH INCLUSIVE)
 * - Each date in range counts as reschedule lost day UNLESS driver has pickup that day
 * 
 * This function returns true ONCE per (driver_id, date) - no double counting.
 */
function isRescheduleLostDay(orders: Order[], targetDate: string, driverId: string): boolean {
  // Check if driver has ANY pickup on targetDate - if so, not a reschedule lost day
  const hasPickupToday = orders.some(order => {
    if (!order.pickup_datetime) return false;
    const pickupDate = order.pickup_datetime.split("T")[0];
    return pickupDate === targetDate;
  });

  if (hasPickupToday) {
    return false; // Driver has a pickup, not a lost day due to reschedule
  }

  // Check each order for reschedule window
  for (const order of orders) {
    // Get original delivery date:
    // 1. Prefer structured column (original_delivery_datetime)
    // 2. Fallback to regex parsing for legacy records
    let originalDate: string | null = null;
    
    if (order.original_delivery_datetime) {
      originalDate = order.original_delivery_datetime.split("T")[0];
    } else if (order.date_change_notes) {
      originalDate = parseRescheduledOriginalDate(order.date_change_notes);
    }
    
    if (!originalDate) continue;
    
    if (!order.delivery_datetime) continue;
    const actualDate = order.delivery_datetime.split("T")[0];
    
    // Check if actualDate > originalDate (was actually rescheduled later)
    if (actualDate <= originalDate) continue;
    
    // Check if targetDate falls within the reschedule range [originalDate, actualDate] inclusive
    if (targetDate >= originalDate && targetDate <= actualDate) {
      return true; // This date is in the reschedule window
    }
  }
  
  return false;
}
