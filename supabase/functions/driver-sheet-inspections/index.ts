import { SignJWT, importPKCS8 } from "npm:jose@5.2.2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SPREADSHEET_ID = "1J7TtJz0HrBoqSI2QuMyAJkR6ltgOA6a8";
const RANGE = "ALL!A1:L5000";

async function getGoogleAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not set");
  const sa = JSON.parse(raw);
  const privateKey = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    iss: sa.client_email,
    scope:
      "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly",
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

// The linked document may be a native Google Sheet or an uploaded .xlsx stored in
// Drive. Try the Sheets API first, then fall back to downloading + parsing the file.
async function readRows(token: string): Promise<string[][]> {
  const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?valueRenderOption=FORMATTED_VALUE`;
  const res = await fetch(sheetsUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) {
    const data = await res.json();
    return (data.values || []) as string[][];
  }
  const sheetsErr = await res.text();
  console.log(`Sheets API read failed [${res.status}], falling back to Drive download: ${sheetsErr}`);

  const driveUrl = `https://www.googleapis.com/drive/v3/files/${SPREADSHEET_ID}?alt=media&supportsAllDrives=true`;
  const fileRes = await fetch(driveUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!fileRes.ok) {
    const body = await fileRes.text();
    throw new Error(`Drive download failed [${fileRes.status}]: ${body}`);
  }
  const buf = new Uint8Array(await fileRes.arrayBuffer());
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const ws = wb.Sheets["ALL"] || wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
}

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
    const values = await readRows(token);
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