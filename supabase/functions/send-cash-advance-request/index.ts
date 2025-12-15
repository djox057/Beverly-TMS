import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CashAdvanceRequest {
  driverId: string;
  driverName: string;
  truckNumber: string;
  companyName: string;
  amount: number;
  requesterEmail?: string;
}

// Get Chicago time
function getChicagoTime(): Date {
  const now = new Date();
  const chicagoTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  return chicagoTime;
}

// Get start of today in Chicago time
function getChicagoTodayStart(): Date {
  const chicago = getChicagoTime();
  chicago.setHours(0, 0, 0, 0);
  return chicago;
}

// Get start of current week (Monday) in Chicago time
function getChicagoWeekStart(): Date {
  const chicago = getChicagoTime();
  const dayOfWeek = chicago.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Days since Monday
  chicago.setDate(chicago.getDate() - diff);
  chicago.setHours(0, 0, 0, 0);
  return chicago;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { driverId, driverName, truckNumber, companyName, amount, requesterEmail }: CashAdvanceRequest = await req.json();

    // Validate amount
    if (amount < 0 || amount > 150) {
      return new Response(
        JSON.stringify({ success: false, error: "Amount must be between $0 and $150" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Cash advance request received:", { driverId, driverName, truckNumber, companyName, amount });

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Chicago time boundaries
    const todayStart = getChicagoTodayStart();
    const weekStart = getChicagoWeekStart();

    console.log("Time boundaries:", { todayStart: todayStart.toISOString(), weekStart: weekStart.toISOString() });

    // Check today's cash advances
    const { data: todayAdvances, error: todayError } = await supabase
      .from("driver_cash_advances")
      .select("id")
      .eq("driver_id", driverId)
      .gte("requested_at", todayStart.toISOString());

    if (todayError) {
      console.error("Error checking today's advances:", todayError);
      throw new Error("Failed to check daily limit");
    }

    const todayCount = todayAdvances?.length || 0;
    console.log("Today's advances count:", todayCount);

    if (todayCount >= 1) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Daily limit reached. You can only request 1 cash advance per day.",
          todayCount,
          weekCount: null, // Will be fetched client-side
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Check this week's cash advances with amounts
    const { data: weekAdvances, error: weekError } = await supabase
      .from("driver_cash_advances")
      .select("id, amount")
      .eq("driver_id", driverId)
      .gte("requested_at", weekStart.toISOString());

    if (weekError) {
      console.error("Error checking week's advances:", weekError);
      throw new Error("Failed to check weekly limit");
    }

    const weekCount = weekAdvances?.length || 0;
    const weeklyAmount = weekAdvances?.reduce((sum: number, adv: { amount: number }) => sum + (adv.amount || 0), 0) || 0;
    const remainingAmount = 150 - weeklyAmount;
    console.log("Week's advances:", { weekCount, weeklyAmount, remainingAmount });

    if (weekCount >= 3) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Weekly limit reached. You can only request 3 cash advances per week (resets Monday).",
          todayCount,
          weekCount,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    if (amount > remainingAmount) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Amount exceeds remaining weekly limit. You can request up to $${remainingAmount}.`,
          todayCount,
          weekCount,
          weeklyAmount,
          remainingAmount,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Insert cash advance record
    const { error: insertError } = await supabase
      .from("driver_cash_advances")
      .insert({
        driver_id: driverId,
        amount: amount,
        truck_number: truckNumber,
      });

    if (insertError) {
      console.error("Error inserting cash advance:", insertError);
      throw new Error("Failed to record cash advance");
    }

    // Determine sender email based on company
    let fromEmail = "efs@bfprime.net"; // Default
    if (companyName?.toLowerCase().includes("beverly")) {
      fromEmail = "efs@beverlyfreight.net";
    } else if (companyName?.toLowerCase().includes("united")) {
      fromEmail = "efs@bfprimeunited.net";
    } else if (companyName?.toLowerCase().includes("bg prime")) {
      fromEmail = "efs@bgprime.net";
    }

    // Send email
    const emailBody = `Unit: ${truckNumber || "N/A"}
Driver: ${driverName}
Amount: $${amount}
Purpose: Cash advance`;

    console.log("Sending email from:", fromEmail);
    console.log("Email body:", emailBody);

    // Send email using Resend REST API with BCC to requester
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const emailPayload = {
      from: `EFS Request <${fromEmail}>`,
      to: ["efsrequest@gmail.com"],
      ...(requesterEmail ? { bcc: [requesterEmail] } : {}),
      subject: "EFS request by App",
      text: emailBody,
    };

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const emailResult = await emailResponse.json();
    console.log("Email sent successfully:", emailResult);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Cash advance request sent successfully",
        todayCount: todayCount + 1,
        weekCount: weekCount + 1,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-cash-advance-request:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
