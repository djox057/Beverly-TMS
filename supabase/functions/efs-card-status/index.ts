// EFS fuel-card status: on-demand read for one truck, and Active/Hold changes.
// Logical equivalent of:
//   GET  /api/efs/trucks/{truckId}/card-status   -> { action: "get",  truckId }
//   POST /api/efs/trucks/{truckId}/card-status   -> { action: "set",  truckId, status, requestId }
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  canControl,
  isValidRequestedStatus,
  lastFour,
  maskCardNumber,
  normalizeControllableStatus,
  resolveTruckCard,
  buildSetCardPayload,
  UNCONTROLLABLE_MESSAGE,
} from "../_shared/efs/cardStatus.ts";
import { getCardV2, setCardV2, withCardLock, type CarrierAccount } from "../_shared/efs/client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VIEW_ROLES = ["admin", "manager", "supervisor", "accounting", "safety", "dispatch"];
const CHANGE_ROLES = ["admin", "manager", "accounting"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const authed = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await authed.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => VIEW_ROLES.includes(r))) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action === "set" ? "set" : "get";
    const truckId = typeof body?.truckId === "string" ? body.truckId : null;
    if (!truckId) return json({ error: "truckId is required" }, 400);

    // Resolve exactly one mapped card for this truck.
    const { data: cardRows, error: cardError } = await admin
      .from("efs_cards")
      .select("id, carrier_account_id, card_last_four, raw_status, last_checked_at, last_synced_at")
      .eq("truck_id", truckId);
    if (cardError) throw cardError;

    const resolution = resolveTruckCard((cardRows ?? []).map((c) => ({ id: c.id, cardLastFour: c.card_last_four })));
    if (!resolution.ok) {
      return json({ truckId, configured: false, reason: resolution.reason, message: resolution.message }, 200);
    }
    const cardRow = (cardRows ?? []).find((c) => c.id === resolution.card.id)!;

    const [{ data: secret }, { data: account }] = await Promise.all([
      admin.from("efs_card_secrets").select("card_number").eq("card_id", cardRow.id).maybeSingle(),
      admin
        .from("efs_carrier_accounts")
        .select("id, name, credential_secret_name, environment, is_active")
        .eq("id", cardRow.carrier_account_id)
        .maybeSingle(),
    ]);

    if (!secret?.card_number || !account) {
      return json(
        {
          truckId,
          configured: false,
          reason: "missing",
          message: "This truck's EFS card is not fully configured on the server.",
        },
        200,
      );
    }
    if (account.is_active === false) {
      return json(
        { truckId, configured: false, reason: "missing", message: `Carrier account ${account.name} is disabled.` },
        200,
      );
    }

    const carrier: CarrierAccount = {
      id: account.id,
      name: account.name,
      credential_secret_name: account.credential_secret_name,
      environment: account.environment,
    };
    const cardNumber = secret.card_number as string;
    const masked = maskCardNumber(cardNumber);

    // ---------- read ----------
    if (action === "get") {
      try {
        const card = await getCardV2(carrier, cardNumber);
        const rawStatus = typeof card.status === "string" ? card.status : null;
        const controllable = normalizeControllableStatus(rawStatus);
        const checkedAt = new Date().toISOString();

        await admin
          .from("efs_cards")
          .update({
            raw_status: rawStatus,
            controllable_status: controllable,
            card_last_four: lastFour(cardNumber),
            last_checked_at: checkedAt,
            last_error: null,
          })
          .eq("id", cardRow.id);

        return json({
          truckId,
          configured: true,
          maskedCardNumber: masked,
          rawStatus,
          controllableStatus: controllable,
          canControl: canControl(rawStatus),
          uncontrollableMessage: canControl(rawStatus) ? null : UNCONTROLLABLE_MESSAGE,
          checkedAt,
          source: "EFS",
          canChange: roles.some((r) => CHANGE_ROLES.includes(r)),
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "EFS request failed";
        await admin.from("efs_cards").update({ last_error: message }).eq("id", cardRow.id);
        return json(
          {
            truckId,
            configured: true,
            maskedCardNumber: masked,
            rawStatus: cardRow.raw_status ?? null,
            controllableStatus: normalizeControllableStatus(cardRow.raw_status),
            canControl: false,
            error: message,
            checkedAt: cardRow.last_checked_at ?? cardRow.last_synced_at ?? null,
            source: "cache",
            canChange: false,
          },
          502,
        );
      }
    }

    // ---------- change ----------
    if (!roles.some((r) => CHANGE_ROLES.includes(r))) return json({ error: "Forbidden" }, 403);

    const requestedStatus = body?.status;
    const requestId = typeof body?.requestId === "string" ? body.requestId : null;
    if (!isValidRequestedStatus(requestedStatus)) {
      return json({ error: "status must be exactly \"Active\" or \"Hold\"" }, 400);
    }
    if (!requestId) return json({ error: "requestId is required" }, 400);

    const { data: existingAudit } = await admin
      .from("efs_card_status_audit")
      .select("id, requested_status, confirmed_status, result, failure_reason")
      .eq("request_id", requestId)
      .maybeSingle();
    if (existingAudit) {
      return json({
        truckId,
        duplicate: true,
        maskedCardNumber: masked,
        rawStatus: existingAudit.confirmed_status,
        controllableStatus: normalizeControllableStatus(existingAudit.confirmed_status),
        result: existingAudit.result,
        failureReason: existingAudit.failure_reason,
      });
    }

    const outcome = await withCardLock(`${carrier.id}:${cardNumber}`, async () => {
      // 1. latest configuration
      const current = await getCardV2(carrier, cardNumber);
      const previousRaw = typeof current.status === "string" ? current.status : null;

      if (!canControl(previousRaw)) {
        return {
          ok: false as const,
          previousRaw,
          confirmed: previousRaw,
          reason: `${UNCONTROLLABLE_MESSAGE} (status: ${previousRaw ?? "unknown"})`,
        };
      }

      // 2. complete read-modify-write, only `status` differs
      const payload = buildSetCardPayload(current, requestedStatus);
      await setCardV2(carrier, payload);

      // 3. verify
      const verified = await getCardV2(carrier, cardNumber);
      const confirmed = typeof verified.status === "string" ? verified.status : null;
      if (normalizeControllableStatus(confirmed) !== requestedStatus) {
        return {
          ok: false as const,
          previousRaw,
          confirmed,
          reason: `EFS did not confirm the change (status is now ${confirmed ?? "unknown"})`,
        };
      }
      return { ok: true as const, previousRaw, confirmed, reason: null };
    });

    const now = new Date().toISOString();

    await admin.from("efs_card_status_audit").insert({
      truck_id: truckId,
      carrier_account_id: carrier.id,
      card_last_four: lastFour(cardNumber),
      previous_raw_status: outcome.previousRaw,
      requested_status: requestedStatus,
      confirmed_status: outcome.confirmed,
      user_id: userId,
      request_id: requestId,
      result: outcome.ok ? "success" : "failure",
      failure_reason: outcome.reason,
    });

    if (outcome.ok) {
      // Local cache updated only after EFS confirmed.
      await admin
        .from("efs_cards")
        .update({
          raw_status: outcome.confirmed,
          controllable_status: normalizeControllableStatus(outcome.confirmed),
          last_checked_at: now,
          last_status_change_at: now,
          last_error: null,
        })
        .eq("id", cardRow.id);

      return json({
        truckId,
        maskedCardNumber: masked,
        rawStatus: outcome.confirmed,
        controllableStatus: normalizeControllableStatus(outcome.confirmed),
        canControl: true,
        checkedAt: now,
        source: "EFS",
      });
    }

    return json(
      {
        truckId,
        maskedCardNumber: masked,
        rawStatus: outcome.confirmed,
        controllableStatus: normalizeControllableStatus(outcome.confirmed),
        canControl: canControl(outcome.confirmed),
        error: outcome.reason,
        checkedAt: now,
        source: "EFS",
      },
      409,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    console.error("efs-card-status error:", message);
    return json({ error: message }, 500);
  }
});
