import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PickupDeliveryStop {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  puNumber?: string;
  poNumber?: string;
  shipper?: string;
}

interface ExtractedOrderData {
  pickups?: PickupDeliveryStop[];
  deliveries?: PickupDeliveryStop[];
  pickupPuNumber?: string;
  pickupPoNumber?: string;
  pickupShipper?: string;
  deliveryPoNumber?: string;
  deliveryShipper?: string;
  freightAmount?: number;
  mileage?: number;
  commodity?: string;
  weight?: number;
  trailer?: string;
  equipment?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // --- Auth check ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      throw new Error("Gemini API key not configured");
    }

    const formData = await req.formData();
    const pdfFile = formData.get("pdf") as File;

    if (!pdfFile) {
      throw new Error("No PDF file provided");
    }

    if (pdfFile.type !== "application/pdf") {
      throw new Error("File must be a PDF");
    }

    console.log("Processing PDF:", pdfFile.name, "Size:", pdfFile.size);

    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfBuffer = new Uint8Array(arrayBuffer);

    let binaryString = "";
    const chunkSize = 8192;
    for (let i = 0; i < pdfBuffer.length; i += chunkSize) {
      const chunk = pdfBuffer.slice(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64Pdf = btoa(binaryString);

    // Get current date info for smart year inference
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const nextYear = currentYear + 1;

    // Allowed date window: ±15 days from today (Chicago/local server date)
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const minAllowedDate = new Date(todayMidnight.getTime() - 15 * MS_PER_DAY);
    const maxAllowedDate = new Date(todayMidnight.getTime() + 15 * MS_PER_DAY);
    const fmtYmd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const minAllowedStr = fmtYmd(minAllowedDate);
    const maxAllowedStr = fmtYmd(maxAllowedDate);

    const systemPrompt = `Extract shipping/logistics data from this PDF. Use OCR if needed.

## CRITICAL FIELDS TO EXTRACT:

### 1. PICKUP/DELIVERY LOCATIONS:
Identify stops labeled "PU", "Pickup", "Origin" as PICKUPS.
Identify stops labeled "SO", "Stop", "Delivery", "Destination" as DELIVERIES.

For EACH location extract:
- address: Street address only (remove dock/gate instructions)
- city: City name
- state: 2-letter state code
- zip: FULL ZIP code - extract ALL digits (5-digit: "12345" or 9-digit: "123456789"). Do NOT truncate 9-digit zips to 5 digits. If zip appears as "300831531", keep all 9 digits.
- date: Convert to YYYY-MM-DD format (see DATE PARSING RULES below)
- startTime: Format as HH:MM (24-hour)
- endTime: Format as HH:MM (24-hour)
- puNumber: Pickup/appointment number, BOL#, or Bill of Lading number
- poNumber: Purchase order number
- shipper: Company name at this location
- startTime: Format as HH:MM (24-hour)
- endTime: Format as HH:MM (24-hour)
- puNumber: Pickup/appointment number, BOL#, or Bill of Lading number
- poNumber: Purchase order number
- shipper: Company name at this location

### 3. LOAD DETAILS:
- freightAmount: TOTAL payment amount (the GRAND TOTAL the carrier will be paid) - number only.
  CRITICAL: Always use the final "Total Cost" / "Total" / "Grand Total" / "Total Pay" / "Total Amount" row at the BOTTOM of the rate breakdown table, which INCLUDES all accessorials and fees (e.g., GPS Tracking, Fuel Surcharge, Detention, Lumper, Layover, Tolls, etc.).
  Do NOT return only the "Line Haul" / "Net Line Haul" / "Flat Rate" / "Base Rate" subtotal — that excludes accessorials.
  Example: if the table shows "Net Line Haul USD 850.00", "GPS Tracking USD 100.00", "Total Cost USD 950.00", freightAmount MUST be 950, NOT 850.
- mileage: Total miles - number only
- commodity: Description (max 4 words)
- weight: Weight in pounds - number only
- equipment: Equipment type (e.g., "53' Dry Van", "Reefer")

## DATE PARSING RULES (CRITICAL):
US logistics documents use MM/DD/YYYY format (Month/Day/Year). You MUST parse dates correctly:
- "12/10/2025" means December 10, 2025 → output "2025-12-10"
- "01/15/2025" means January 15, 2025 → output "2025-01-15"
- "10/12/2025" means October 12, 2025 → output "2025-10-12"
- The FIRST number is always the MONTH (1-12)
- The SECOND number is always the DAY (1-31)

## YEAR INFERENCE RULES (VERY IMPORTANT):
Today's date is ${currentMonth}/${now.getDate()}/${currentYear}. Current month is ${currentMonth}.

## DATE WINDOW CONSTRAINT (HARD LIMIT):
Pickup and delivery dates MUST fall within ±15 days of today.
Allowed range: ${minAllowedStr} to ${maxAllowedStr} (inclusive).
- When inferring the year for ambiguous dates, choose the year that places the date INSIDE this window.
- If a parsed date would fall OUTSIDE this window, try the adjacent year first. If still outside, OMIT the date field rather than returning an out-of-range value.
- If your US MM/DD interpretation produces a date OUTSIDE the ±15-day window, the document may be in DD/MM format (European broker). Try swapping day and month — if that lands INSIDE the window, use the swapped date.

When the year is missing OR only 2 digits (like "25"):
- If the extracted month is ${currentMonth} or later months of the current year, use ${currentYear}
- If we are in late year (month >= 10) and the extracted month is early (1-3), use ${nextYear}
- For 2-digit years like "25" or "26": if "25" appears in late ${currentYear}, treat dates with early months as ${nextYear}
- Default to ${currentYear} unless the date would be in the past by more than 30 days
- NEVER assume year 2025 when we are in ${currentYear} and the date would make more sense in ${nextYear}

Examples for today (${currentMonth}/${now.getDate()}/${currentYear}):
${currentMonth >= 10 ? `- "01/15/25" or "01/15" in a document → output "${nextYear}-01-15" (January is next year when we're in late ${currentYear})` : `- "01/15/25" → use context, likely ${currentYear} or ${nextYear}`}
- If year shows "2025" but we're in ${currentYear} and date is January, consider if ${nextYear} makes more sense
- Common formats: "12/10/25", "12-10-2025", "Dec 10, 2025", "December 10, 2025", "1/5" (no year)

## ADDRESS CLEANING RULES:
- Remove everything after " - " (dock/gate instructions)
- Remove: "DOCK", "DOOR", "GATE", "USE", "CALL AHEAD"
- Keep: Street number, street name, Suite/Building/Plant identifiers
- Expand abbreviations: N→North, Ave→Avenue, Dr→Drive, Blvd→Boulevard, St→Street

## CRITICAL VALIDATION:
- Every load MUST have at least 1 pickup AND 1 delivery
- Do NOT confuse CARRIER info with pickup/delivery addresses
- Extract ZIP codes carefully - search near city/state
- VERIFY dates make sense: pickup date should be before or same as delivery date

## OUTPUT FORMAT:

For single pickup/delivery:
{
  "pickups": [{
    "address": "string",
    "city": "string",
    "state": "XX",
    "zip": "300831531",
    "date": "2025-12-10",
    "startTime": "HH:MM",
    "endTime": "HH:MM",
    "puNumber": "string",
    "poNumber": "string",
    "shipper": "string"
  }],
  "deliveries": [{
    "address": "string",
    "city": "string",
    "state": "XX",
    "zip": "187072141",
    "date": "2025-12-11",
    "startTime": "HH:MM",
    "endTime": "HH:MM",
    "poNumber": "string",
    "shipper": "string"
  }],
  "freightAmount": 1250.00,
  "mileage": 450,
  "commodity": "string",
  "weight": 42000,
  "equipment": "string"
}

Return ONLY valid JSON. No markdown, no explanations.`;

    let aiData;
    let candidate;
    let modelUsed = "gemini-flash-lite-latest";

    for (let attempt = 1; attempt <= 2; attempt++) {
      const modelEndpoint =
        attempt === 1 ? "gemini-flash-lite-latest:generateContent" : "gemini-flash-latest:generateContent";

      modelUsed = attempt === 1 ? "gemini-flash-lite-latest" : "gemini-flash-latest";
      console.log(`Attempt ${attempt}: Using ${modelUsed}`);

      const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelEndpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": geminiApiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: systemPrompt }, { inline_data: { mime_type: "application/pdf", data: base64Pdf } }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 65536,
          },
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error(`${modelUsed} error:`, aiResponse.status, errorText);

        if (aiResponse.status === 429) {
          throw new Error("Rate limit exceeded. Please try again later.");
        }

        if (attempt === 2) {
          throw new Error(`Failed to analyze PDF: ${aiResponse.status}`);
        }
        continue;
      }

      aiData = await aiResponse.json();

      if (aiData.promptFeedback?.blockReason) {
        throw new Error(`Request blocked: ${aiData.promptFeedback.blockReason}`);
      }

      if (!aiData.candidates || aiData.candidates.length === 0) {
        throw new Error("No response from AI model");
      }

      candidate = aiData.candidates[0];

      if (candidate.finishReason === "MAX_TOKENS" && attempt === 1) {
        console.log("Token limit exceeded, retrying with flash...");
        continue;
      }

      break;
    }

    const extractedContent = candidate.content?.parts?.[0]?.text?.trim();

    if (!extractedContent) {
      throw new Error("No content in AI response");
    }

    console.log("AI response received, parsing JSON...");

    let extractedData: ExtractedOrderData;
    try {
      let cleanContent = extractedContent;

      // Remove markdown code blocks
      if (cleanContent.includes("```json")) {
        const match = cleanContent.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) cleanContent = match[1];
      } else if (cleanContent.includes("```")) {
        const match = cleanContent.match(/```\s*([\s\S]*?)\s*```/);
        if (match) cleanContent = match[1];
      }

      cleanContent = cleanContent.trim();
      cleanContent = cleanContent.replace(/,(\s*[}\]])/g, "$1");

      extractedData = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("JSON parse error, attempting repair...");
      const jsonMatch = extractedContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let repaired = jsonMatch[0].replace(/,(\s*[}\]])/g, "$1");
        extractedData = JSON.parse(repaired);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    // Ensure arrays exist
    if (!extractedData.pickups) extractedData.pickups = [];
    if (!extractedData.deliveries) extractedData.deliveries = [];

    // Fix time ranges: ensure endTime is always after startTime
    // If endTime appears earlier (e.g., 08:00-03:00), convert endTime to PM (e.g., 15:00)
    const fixTimeRange = (stop: PickupDeliveryStop) => {
      if (stop.startTime && stop.endTime) {
        const [startHour, startMin] = stop.startTime.split(':').map(Number);
        const [endHour, endMin] = stop.endTime.split(':').map(Number);
        
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        
        // If end time is earlier than start time and end hour is < 12, add 12 hours (convert to PM)
        if (endMinutes < startMinutes && endHour < 12) {
          const newEndHour = endHour + 12;
          stop.endTime = `${newEndHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
          console.log(`Fixed time range: ${stop.startTime}-${endHour}:${endMin.toString().padStart(2, '0')} → ${stop.startTime}-${stop.endTime}`);
        }
      }
      return stop;
    };

    extractedData.pickups = extractedData.pickups.map(fixTimeRange);
    extractedData.deliveries = extractedData.deliveries.map(fixTimeRange);

    // Enforce ±15 day window on dates. If out of range, try adjacent year; else clear.
    const clampDate = (stop: PickupDeliveryStop) => {
      if (!stop.date) return stop;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stop.date);
      if (!m) return stop;
      const tryDate = (yyyy: number, mm: number, dd: number) => {
        const d = new Date(yyyy, mm - 1, dd);
        if (d >= minAllowedDate && d <= maxAllowedDate) {
          return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        }
        return null;
      };
      const yyyy = Number(m[1]);
      const mm = Number(m[2]);
      const dd = Number(m[3]);
      const yearCandidates = [yyyy, yyyy + 1, yyyy - 1, currentYear, nextYear, currentYear - 1];
      // 1) Try original MM/DD with adjacent years
      for (const y of yearCandidates) {
        const ok = tryDate(y, mm, dd);
        if (ok) {
          if (ok !== stop.date) {
            console.log(`Date ${stop.date} out of ±15d window; adjusted to ${ok}`);
          }
          stop.date = ok;
          return stop;
        }
      }
      // 2) Try swapping day<->month (DD/MM European format) with adjacent years
      if (dd >= 1 && dd <= 12 && mm >= 1 && mm <= 31) {
        for (const y of yearCandidates) {
          const ok = tryDate(y, dd, mm);
          if (ok) {
            console.log(`Date ${stop.date} out of ±15d window; recovered via day/month swap to ${ok}`);
            stop.date = ok;
            return stop;
          }
        }
      }
      console.log(`Date ${stop.date} out of ±15d window and no adjacent year fits; clearing.`);
      stop.date = undefined;
      return stop;
    };
    extractedData.pickups = extractedData.pickups.map(clampDate);
    extractedData.deliveries = extractedData.deliveries.map(clampDate);

    // Validation: at least 1 pickup and 1 delivery
    if (extractedData.pickups.length === 0 || extractedData.deliveries.length === 0) {
      console.warn("Missing pickups or deliveries, attempting auto-correction...");

      const allStops = [
        ...extractedData.pickups.map((s) => ({ ...s, type: "pickup" })),
        ...extractedData.deliveries.map((s) => ({ ...s, type: "delivery" })),
      ].sort((a, b) => {
        const dateA = a.date && a.startTime ? `${a.date}T${a.startTime}` : a.date || "";
        const dateB = b.date && b.startTime ? `${b.date}T${b.startTime}` : b.date || "";
        return dateA.localeCompare(dateB);
      });

      if (allStops.length >= 2) {
        const { type: _, ...firstStop } = allStops[0];
        const remainingStops = allStops.slice(1).map(({ type: _, ...stop }) => stop);
        extractedData.pickups = [firstStop];
        extractedData.deliveries = remainingStops;
      } else if (allStops.length < 2) {
        throw new Error("Document must contain at least 1 pickup and 1 delivery location");
      }
    }

    console.log("Extraction complete:", {
      pickups: extractedData.pickups?.length,
      deliveries: extractedData.deliveries?.length,
      freightAmount: extractedData.freightAmount,
    });

    return new Response(JSON.stringify({ success: true, data: extractedData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Extraction error:", error);
    return new Response(JSON.stringify({ success: false, error: error?.message || "Failed to extract order fields" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
