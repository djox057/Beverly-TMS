import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_API_URL = "https://api.resend.com/emails";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LateNotificationRequest {
  orderId: string;
  stopType: "pickup" | "delivery";
  stopId?: string;
  truckId: string;
  truckNumber: string;
  driverName: string;
  dispatcherEmail: string;
  dispatcherName: string;
  stopAddress: string;
  scheduledTime: string;
  estimatedArrival: string;
  loadNumber: string;
  currentMiles?: number;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: LateNotificationRequest = await req.json();
    
    console.log("📨 Late notification request received:", {
      orderId: requestData.orderId,
      stopType: requestData.stopType,
      truckNumber: requestData.truckNumber,
      driverName: requestData.driverName,
      dispatcherEmail: requestData.dispatcherEmail,
      currentMiles: requestData.currentMiles,
    });

    // Skip notification if truck is less than 10 miles from destination
    if (requestData.currentMiles !== undefined && requestData.currentMiles < 10) {
      console.log(`⏭️ Truck is only ${requestData.currentMiles} miles away, skipping late notification`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "within_10_miles" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // SAFETY NET: Verify order is still valid for notification (not delivered, no POD)
    const { data: orderCheck, error: orderError } = await supabase
      .from("orders")
      .select(`
        id,
        status,
        order_files(file_category)
      `)
      .eq("id", requestData.orderId)
      .maybeSingle();

    if (orderError) {
      console.error("❌ Error checking order:", orderError);
      // Continue anyway - don't block on this check
    }

    if (orderCheck) {
      // Skip if order is already delivered
      if (orderCheck.status === 'delivered') {
        console.log(`⏭️ Order ${requestData.orderId} is already delivered, skipping late notification`);
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "order_already_delivered" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Skip if POD is already uploaded
      const hasPOD = orderCheck.order_files?.some((f: any) => f.file_category === "POD");
      if (hasPOD) {
        console.log(`⏭️ Order ${requestData.orderId} has POD uploaded, skipping late notification`);
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason: "pod_already_uploaded" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Check if notification already sent for this order/stop
    const { data: existingNotification } = await supabase
      .from("late_notifications")
      .select("id")
      .eq("order_id", requestData.orderId)
      .eq("stop_type", requestData.stopType)
      .eq("stop_id", requestData.stopId || null)
      .maybeSingle();

    if (existingNotification) {
      console.log("⏭️ Notification already sent for this stop, skipping");
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "already_notified" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send email via Resend REST API
    const stopTypeLabel = requestData.stopType === "pickup" ? "Pickup" : "Delivery";
    const subject = `🚨 LATE ALERT: Truck ${requestData.truckNumber} - ${requestData.driverName} will be late for ${stopTypeLabel.toLowerCase()}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #f97316; border-bottom: 2px solid #f97316; padding-bottom: 10px;">
          🚨 Late ${stopTypeLabel} Alert
        </h2>
        
        <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0; font-weight: bold;">Load #${requestData.loadNumber}</p>
          <p style="margin: 0; color: #9a3412;">
            Driver ${requestData.driverName} on Truck ${requestData.truckNumber} is projected to be late.
          </p>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; width: 40%;">Driver:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${requestData.driverName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Truck:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${requestData.truckNumber}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${stopTypeLabel} Location:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${requestData.stopAddress}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Scheduled Time:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${requestData.scheduledTime}</td>
          </tr>
          <tr style="background: #fef2f2;">
            <td style="padding: 8px; border-bottom: 1px solid #fecaca; font-weight: bold; color: #b91c1c;">Est. Arrival:</td>
            <td style="padding: 8px; border-bottom: 1px solid #fecaca; color: #b91c1c; font-weight: bold;">${requestData.estimatedArrival}</td>
          </tr>
        </table>
        
        <p style="color: #666; font-size: 12px; margin-top: 24px;">
          This is an automated notification from the dispatch system. Please take appropriate action.
        </p>
      </div>
    `;

    const emailRes = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Dispatch Alerts <jon@bfprime.net>",
        to: [requestData.dispatcherEmail],
        subject: subject,
        html: htmlBody,
      }),
    });

    const emailResponse = await emailRes.json();

    if (!emailRes.ok) {
      console.error("❌ Resend API error:", emailResponse);
      throw new Error(emailResponse.message || "Failed to send email");
    }

    console.log("✅ Email sent successfully:", emailResponse);

    // Record the notification in database
    const { error: insertError } = await supabase
      .from("late_notifications")
      .insert({
        order_id: requestData.orderId,
        stop_type: requestData.stopType,
        stop_id: requestData.stopId || null,
        truck_id: requestData.truckId,
        dispatcher_id: null,
      });

    if (insertError) {
      console.error("⚠️ Failed to record notification:", insertError);
    }

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.id }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("❌ Error in send-late-notification:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
