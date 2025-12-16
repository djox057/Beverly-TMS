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
  requesterName?: string;
}

// Extract last word from name (e.g., "David Mijailovic-Dom" -> "Dom")
function getLastNamePart(fullName: string | undefined): string {
  if (!fullName) return "App";
  // Split by space first, then by hyphen to get the very last part
  const parts = fullName.trim().split(/[\s-]+/);
  return parts[parts.length - 1] || "App";
}

// Get Chicago timezone offset in milliseconds
function getChicagoOffset(date: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');
  
  const chicagoDate = new Date(Date.UTC(
    getPart('year'), getPart('month') - 1, getPart('day'),
    getPart('hour'), getPart('minute'), getPart('second')
  ));
  
  return chicagoDate.getTime() - date.getTime();
}

// Get start of today in Chicago time as UTC ISO string
function getChicagoTodayStartUTC(): string {
  const now = new Date();
  const chicagoOffset = getChicagoOffset(now);
  const chicagoNow = new Date(now.getTime() + chicagoOffset);
  chicagoNow.setUTCHours(0, 0, 0, 0);
  const utcMidnight = new Date(chicagoNow.getTime() - chicagoOffset);
  return utcMidnight.toISOString();
}

// Get start of current week (Monday) in Chicago time as UTC ISO string
function getChicagoWeekStartUTC(): string {
  const now = new Date();
  const chicagoOffset = getChicagoOffset(now);
  const chicagoNow = new Date(now.getTime() + chicagoOffset);
  const dayOfWeek = chicagoNow.getUTCDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  chicagoNow.setUTCDate(chicagoNow.getUTCDate() - diff);
  chicagoNow.setUTCHours(0, 0, 0, 0);
  const utcMonday = new Date(chicagoNow.getTime() - chicagoOffset);
  return utcMonday.toISOString();
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: CashAdvanceRequest = await req.json();
    const { driverId, driverName, truckNumber, companyName, amount } = body;

    // Prefer resolving requester identity from the JWT (more reliable than client-provided fields)
    let requesterEmail = body.requesterEmail;
    let requesterName = body.requesterName;

    // Validate amount
    if (amount < 0 || amount > 150) {
      return new Response(
        JSON.stringify({ success: false, error: "Amount must be between $0 and $150" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    console.log("Cash advance request received:", {
      driverId,
      driverName,
      truckNumber,
      companyName,
      amount,
      requesterEmail,
      requesterName,
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create Supabase admin client (service role)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve requester from JWT (role-independent)
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      });

      const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
      if (userError) {
        console.warn("Could not resolve requester from JWT:", userError);
      } else if (userData?.user) {
        requesterEmail = userData.user.email ?? requesterEmail;
        requesterName = (userData.user.user_metadata as any)?.full_name ?? requesterName;

        const { data: requesterProfile, error: requesterProfileError } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (requesterProfileError) {
          console.warn("Failed to fetch requester profile:", requesterProfileError);
        } else {
          requesterName = requesterProfile?.full_name || requesterName;
        }
      }
    }

    console.log("Requester resolved:", { requesterEmail, requesterName });


    // Get Chicago time boundaries as UTC ISO strings
    const todayStart = getChicagoTodayStartUTC();
    const weekStart = getChicagoWeekStartUTC();

    console.log("Time boundaries (UTC):", { todayStart, weekStart });

    // Check today's cash advances
    const { data: todayAdvances, error: todayError } = await supabase
      .from("driver_cash_advances")
      .select("id")
      .eq("driver_id", driverId)
      .gte("requested_at", todayStart);

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
      .gte("requested_at", weekStart);

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
    const { data: insertedAdvance, error: insertError } = await supabase
      .from("driver_cash_advances")
      .insert({
        driver_id: driverId,
        amount,
        truck_number: truckNumber,
      })
      .select("id")
      .single();

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

    // Send email using Resend REST API with BCC to requester and Reply-To for both dispatcher and company EFS
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("Missing RESEND_API_KEY");

      // Rollback record so user can retry (do not count failed sends toward limits)
      if (insertedAdvance?.id) {
        await supabase.from("driver_cash_advances").delete().eq("id", insertedAdvance.id);
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: "Email service is not configured (missing RESEND_API_KEY).",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const lastNamePart = getLastNamePart(requesterName);
    const emailPayload = {
      from: `EFS Request <${fromEmail}>`,
      to: ["efsrequest@gmail.com"],
      ...(requesterEmail ? { bcc: [requesterEmail] } : {}),
      reply_to: requesterEmail ? [requesterEmail, fromEmail] : [fromEmail],
      subject: `EFS request by ${lastNamePart}`,
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

    const emailResultText = await emailResponse.text();
    let emailResult: any = null;
    try {
      emailResult = emailResultText ? JSON.parse(emailResultText) : null;
    } catch {
      emailResult = { raw: emailResultText };
    }

    console.log("Resend response:", { ok: emailResponse.ok, status: emailResponse.status, result: emailResult });

    if (!emailResponse.ok) {
      console.error("Resend API error:", { status: emailResponse.status, result: emailResult });

      // Rollback record so user can retry (do not count failed sends toward limits)
      if (insertedAdvance?.id) {
        await supabase.from("driver_cash_advances").delete().eq("id", insertedAdvance.id);
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: `Email failed to send (Resend ${emailResponse.status}).`,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

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
