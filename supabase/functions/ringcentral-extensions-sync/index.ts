// Refreshes the RingCentral extension roster and maps each extension to a
// Beverly user: E.164 phone number first, extension number as fallback.
// Read-only against RingCentral.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { getAccessToken, missingScopes, readConfig, RingCentralAuthError, RingCentralConfigError } from "../_shared/ringcentral/auth.ts";
import { RingCentralApiError, RingCentralClient } from "../_shared/ringcentral/client.ts";
import { toE164 } from "../_shared/ringcentral/normalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface RcExtension {
  id: number | string;
  extensionNumber?: string;
  name?: string;
  type?: string;
  status?: string;
  regionalSettings?: { timezone?: { name?: string } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const config = readConfig();
    const token = await getAccessToken(config);
    // The roster read only needs ReadAccounts. Missing ReadCallLog/ReadMessages
    // blocks the activity sync, not the roster, so report it without aborting.
    const missing = missingScopes(token);

    const client = new RingCentralClient(config);

    // 1. Extensions
    const extensions: RcExtension[] = [];
    for (let page = 1; page <= 20; page++) {
      const res = await client.request<{ records: RcExtension[]; paging?: { totalPages?: number } }>(
        `/restapi/v1.0/account/~/extension?perPage=1000&page=${page}`,
      );
      extensions.push(...(res.records ?? []));
      if (!res.paging?.totalPages || page >= res.paging.totalPages) break;
    }

    // 2. Company phone numbers -> extension
    const numbersByExtension = new Map<string, string[]>();
    for (let page = 1; page <= 20; page++) {
      const res = await client.request<{
        records: Array<{ phoneNumber?: string; extension?: { id?: number | string } }>;
        paging?: { totalPages?: number };
      }>(`/restapi/v1.0/account/~/phone-number?perPage=1000&page=${page}`);
      for (const rec of res.records ?? []) {
        const extId = rec.extension?.id != null ? String(rec.extension.id) : null;
        const e164 = toE164(rec.phoneNumber);
        if (!extId || !e164) continue;
        const list = numbersByExtension.get(extId) ?? [];
        if (!list.includes(e164)) list.push(e164);
        numbersByExtension.set(extId, list);
      }
      if (!res.paging?.totalPages || page >= res.paging.totalPages) break;
    }

    // 3. Beverly users for matching
    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("user_id, phone_number, ext");
    if (profilesError) throw profilesError;

    const byPhone = new Map<string, string>();
    const byExt = new Map<string, string>();
    for (const p of profiles ?? []) {
      const e164 = toE164(p.phone_number);
      if (e164 && !byPhone.has(e164)) byPhone.set(e164, p.user_id);
      const ext = (p.ext ?? "").toString().trim();
      if (ext && !byExt.has(ext)) byExt.set(ext, p.user_id);
    }

    // 4. Upsert roster
    const rows = extensions.map((ext) => {
      const rcExtensionId = String(ext.id);
      const phoneNumbers = numbersByExtension.get(rcExtensionId) ?? [];
      let userId: string | null = null;
      let matchMethod = "unmatched";

      for (const num of phoneNumbers) {
        const match = byPhone.get(num);
        if (match) {
          userId = match;
          matchMethod = "phone";
          break;
        }
      }
      if (!userId && ext.extensionNumber) {
        const match = byExt.get(String(ext.extensionNumber).trim());
        if (match) {
          userId = match;
          matchMethod = "ext";
        }
      }

      return {
        rc_extension_id: rcExtensionId,
        extension_number: ext.extensionNumber ?? null,
        rc_name: ext.name ?? null,
        rc_type: ext.type ?? null,
        phone_numbers: phoneNumbers,
        primary_phone_number: phoneNumbers[0] ?? null,
        user_id: userId,
        match_method: matchMethod,
        timezone: ext.regionalSettings?.timezone?.name || "America/Chicago",
        is_active: ext.status !== "Disabled",
        last_synced_at: new Date().toISOString(),
      };
    });

    if (rows.length) {
      const { error: upsertError } = await admin
        .from("ringcentral_extensions")
        .upsert(rows, { onConflict: "rc_extension_id" });
      if (upsertError) throw upsertError;
    }

    await admin.from("ringcentral_sync_state").upsert({
      scope: "extensions",
      status: "healthy",
      last_successful_sync_at: new Date().toISOString(),
      last_attempted_sync_at: new Date().toISOString(),
      error_category: null,
      error_message: null,
      error_count: 0,
    }, { onConflict: "scope" });

    const matched = rows.filter((r) => r.user_id).length;
    console.log(`[rc-extensions] synced ${rows.length} extensions, ${matched} matched to users`);

    return json({
      extensions: rows.length,
      matched,
      unmatched: rows.length - matched,
      byPhone: rows.filter((r) => r.match_method === "phone").length,
      byExt: rows.filter((r) => r.match_method === "ext").length,
      grantedPermissions: token.scopes,
      missingActivityPermissions: missing,
    });
  } catch (err) {
    return await handleError(admin, err);
  }
});

async function recordFailure(admin: any, category: string, message: string) {
  await admin.from("ringcentral_sync_state").upsert({
    scope: "extensions",
    status: "error",
    last_attempted_sync_at: new Date().toISOString(),
    error_category: category,
    error_message: message.slice(0, 500),
  }, { onConflict: "scope" });
}

async function handleError(admin: any, err: unknown) {
  if (err instanceof RingCentralConfigError) {
    await recordFailure(admin, "auth", err.message);
    return json({ error: "missing_credentials", missing: err.missing }, 500);
  }
  if (err instanceof RingCentralAuthError) {
    await recordFailure(admin, "auth", err.message);
    return json({ error: "auth_failed", detail: err.message }, 502);
  }
  if (err instanceof RingCentralApiError) {
    await recordFailure(admin, err.category, err.message);
    return json({
      error: err.category,
      detail: err.message,
      missingPermission: err.missingPermission,
    }, err.category === "permission" ? 424 : 502);
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error("[rc-extensions] failed:", message);
  await recordFailure(admin, "unknown", message);
  return json({ error: "sync_failed", detail: message }, 500);
}