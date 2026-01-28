import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  date_change_notes: string | null;
  delivery_datetime: string | null;
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

function parseRescheduledDates(notes: string): string[] {
  const regex = /Supposed to deliver on (\d{2})\/(\d{2})\/(\d{4})/g;
  const dates: string[] = [];
  let match;
  while ((match = regex.exec(notes)) !== null) {
    const [_, month, day, year] = match;
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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
    .select(`
      id,
      name,
      dispatcher_id,
      is_active
    `)
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

  // Step 2: Get all lost_day_notes for the target date
  const { data: lostDayNotesData, error: notesError } = await supabase
    .from("lost_day_notes")
    .select("driver_id, note_type, note")
    .eq("date", targetDate);

  if (notesError) {
    console.error("Error fetching lost day notes:", notesError);
    throw notesError;
  }

  const lostDayNotes = lostDayNotesData as LostDayNote[];
  const lostDayMap = new Map<string, { type: string | null; note: string | null }>();
  lostDayNotes?.forEach((note) => {
    lostDayMap.set(note.driver_id, { type: note.note_type, note: note.note });
  });

  // Step 3: Get orders with date_change_notes (reschedules)
  // Query driver1 only (as per requirement)
  const { data: ordersData, error: ordersError } = await supabase
    .from("orders")
    .select("id, driver1_id, date_change_notes, delivery_datetime")
    .not("date_change_notes", "is", null)
    .eq("canceled", false);

  if (ordersError) {
    console.error("Error fetching orders:", ordersError);
    throw ordersError;
  }

  const orders = ordersData as Order[];

  // Build reschedule map: driver_id -> { hasReschedule, orderId }
  const rescheduleMap = new Map<string, { hasReschedule: boolean; orderId: string | null }>();

  for (const order of orders || []) {
    if (!order.date_change_notes || !order.driver1_id || !order.delivery_datetime) continue;

    const originalDates = parseRescheduledDates(order.date_change_notes);
    const actualDateStr = order.delivery_datetime.split("T")[0];

    for (const origDate of originalDates) {
      // A reschedule is counted for each day between original and actual (exclusive of actual)
      const origDateObj = new Date(origDate);
      const actualDateObj = new Date(actualDateStr);
      const targetDateObj = new Date(targetDate);

      // If targetDate falls between original and actual delivery (inclusive of original, exclusive of actual)
      if (targetDateObj >= origDateObj && targetDateObj < actualDateObj) {
        rescheduleMap.set(order.driver1_id, {
          hasReschedule: true,
          orderId: order.id,
        });
        break; // One reschedule per driver per day is enough
      }
    }
  }

  // Step 4: Build stats records for each driver
  const statsToInsert: DriverStats[] = [];

  for (const driver of drivers || []) {
    const office = profileMap.get(driver.dispatcher_id) || "Unknown";
    const lostDayInfo = lostDayMap.get(driver.id);
    const rescheduleInfo = rescheduleMap.get(driver.id);

    // Determine flags
    const hasHomeTime = lostDayInfo?.type === "home_time";
    const hasLostDay = lostDayInfo && !hasHomeTime; // Any note that's not home_time
    const hasReschedule = rescheduleInfo?.hasReschedule || false;

    statsToInsert.push({
      date: targetDate,
      driver_id: driver.id,
      dispatcher_id: driver.dispatcher_id,
      office: office,
      has_lost_day: !!hasLostDay,
      has_home_time: hasHomeTime,
      has_reschedule: hasReschedule,
      lost_day_note: lostDayInfo?.note || null,
      reschedule_order_id: rescheduleInfo?.orderId || null,
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
