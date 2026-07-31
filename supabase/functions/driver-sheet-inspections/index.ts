import { SignJWT, importPKCS8 } from "npm:jose@5.2.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SPREADSHEET_ID = "1J7TtJz0HrBoqSI2QuMyAJkR6ltgOA6a8";
const RANGE = "ALL!A1:L2000";

async function getGoogleAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not set");
  const sa = JSON.parse(raw);
  const privateKey = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .sign(privateKey);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`Google token error: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const normalize = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { driverName } = await req.json().catch(() => ({ driverName: "" }));
    if (!driverName || typeof driverName !== "string") {
      return new Response(JSON.stringify({ error: "driverName is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getGoogleAccessToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?valueRenderOption=FORMATTED_VALUE`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Sheets read failed [${res.status}]: ${body}`);
      return new Response(
        JSON.stringify({ error: "Google Sheets request failed", status: res.status, details: body }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await res.json();
    const values: string[][] = data.values || [];
    const [header, ...rows] = values;
    const target = normalize(driverName);

    const matches = rows
      .filter((r) => normalize(r?.[2] || "") === target)
      .map((r) => ({
        company: r[0] ?? "",
        truck_number: r[1] ?? "",
        driver_name: r[2] ?? "",
        trailer_number: r[3] ?? "",
        inspection_date: r[4] ?? "",
        oos: r[5] ?? "",
        violation_reason: r[6] ?? "",
        report_sent: r[7] ?? "",
        signed_by_mechanic: r[8] ?? "",
        repair_receipt: r[9] ?? "",
        logs_sent: r[10] ?? "",
        comment: r[11] ?? "",
      }));

    return new Response(
      JSON.stringify({ inspections: matches, totalRows: rows.length, header: header || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[driver-sheet-inspections]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});