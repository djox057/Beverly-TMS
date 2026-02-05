import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  brokerLoadNumber?: string;
  brokerName?: string;
  brokerAddress?: string;
  matchedBrokerId?: string;
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

    const systemPrompt = `Extract shipping/logistics data from this PDF. Use OCR if needed.

## CRITICAL FIELDS TO EXTRACT:

### 1. BROKER INFO (TOP PRIORITY - check document header/letterhead):
- brokerName: Company issuing the rate confirmation (NOT shipper/receiver)
- brokerAddress: Broker's office address
- DO NOT extract brokerLoadNumber - skip this field entirely

### 2. PICKUP/DELIVERY LOCATIONS:
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
- freightAmount: TOTAL payment amount (not line items) - number only
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
  "brokerName": "string",
  "brokerAddress": "string",
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
    let modelUsed = "gemini-2.5-flash-lite";

    for (let attempt = 1; attempt <= 2; attempt++) {
      const modelEndpoint =
        attempt === 1 ? "gemini-2.5-flash-lite:generateContent" : "gemini-2.5-flash:generateContent";

      modelUsed = attempt === 1 ? "gemini-2.5-flash-lite" : "gemini-2.5-flash";
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

    // Try to match broker from database
    if (extractedData.brokerName) {
      try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        const { createClient } = await import("npm:@supabase/supabase-js@2.49.1");
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const normalizeText = (text: string): string => {
          return text
            .toUpperCase()
            .replace(/[.,;:!?'"()\[\]{}]/g, " ")
            .replace(/\b(INC|LLC|LTD|CO|COMPANY|CORP|CORPORATION|DBA|THE)\b/g, "")
            .replace(/\s+/g, " ")
            .trim();
        };

        const levenshtein = (a: string, b: string): number => {
          if (a.length === 0) return b.length;
          if (b.length === 0) return a.length;
          const matrix = Array(b.length + 1)
            .fill(null)
            .map(() => Array(a.length + 1).fill(null));
          for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
          for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
          for (let j = 1; j <= b.length; j++) {
            for (let i = 1; i <= a.length; i++) {
              const cost = a[i - 1] === b[j - 1] ? 0 : 1;
              matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + cost);
            }
          }
          return matrix[b.length][a.length];
        };

        const extractMC = (text: string): string | null => {
          const match = text.match(/\bMC[#:\s-]*(\d+)/i);
          return match ? match[1] : null;
        };

        // Fetch brokers
        let allBrokers: any[] = [];
        let page = 0;
        const pageSize = 1000;

        while (true) {
          const { data, error } = await supabaseAdmin
            .from("brokers")
            .select("id, name, address, mc_number")
            .order("name")
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (error || !data || data.length === 0) break;
          allBrokers = [...allBrokers, ...data];
          if (data.length < pageSize) break;
          page++;
        }

        if (allBrokers.length > 0) {
          const extractedMC = extractMC(extractedData.brokerName + " " + (extractedData.brokerAddress || ""));
          const normalizedExtracted = normalizeText(extractedData.brokerName);

          let bestMatch: any = null;
          let bestScore = 0;

          for (const broker of allBrokers) {
            let score = 0;
            const brokerMC = broker.mc_number || extractMC(broker.name + " " + (broker.address || ""));
            const normalizedBroker = normalizeText(broker.name);

            // MC number exact match = auto-match
            if (extractedMC && brokerMC && extractedMC === brokerMC) {
              score += 1000;
            }

            // Exact name match
            if (normalizedExtracted === normalizedBroker) {
              score += 60;
            } else {
              // Fuzzy match
              const distance = levenshtein(normalizedExtracted, normalizedBroker);
              const maxLen = Math.max(normalizedExtracted.length, normalizedBroker.length);
              const similarity = maxLen > 0 ? ((maxLen - distance) / maxLen) * 100 : 0;
              score += Math.round((similarity / 100) * 40);
            }

            if (score > bestScore) {
              bestScore = score;
              bestMatch = broker;
            }
          }

          if (bestMatch && bestScore >= 70) {
            extractedData.matchedBrokerId = bestMatch.id;
            console.log(`Matched broker: ${bestMatch.name} (score: ${bestScore})`);
          }
        }
      } catch (brokerError) {
        console.error("Broker matching error:", brokerError);
      }
    }

    console.log("Extraction complete:", {
      brokerName: extractedData.brokerName,
      brokerLoadNumber: extractedData.brokerLoadNumber,
      matchedBrokerId: extractedData.matchedBrokerId,
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
