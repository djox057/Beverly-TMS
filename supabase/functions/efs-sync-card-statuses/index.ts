// Scheduled bulk EFS card-status synchronization (one request per carrier account).
// Not scheduled in production until explicitly approved.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { getCardSummariesV2, type CarrierAccount } from "../_shared/efs/client.ts";
import { normalizeControllableStatus, selectChangedCards } from "../_shared/efs/cardStatus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const dryRun = await req
    .json()
    .then((b) => b?.dryRun === true)
    .catch(() => false);

  const summary: Array<Record<string, unknown>> = [];

  const { data: accounts, error: accountsError } = await admin
    .from("efs_carrier_accounts")
    .select("id, name, credential_secret_name, environment")
    .eq("is_active", true);
  if (accountsError) {
    return new Response(JSON.stringify({ error: accountsError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  for (const account of accounts ?? []) {
    const carrier = account as CarrierAccount;
    const startedAt = new Date().toISOString();
    let runId: string | null = null;

    if (!dryRun) {
      const { data: run } = await admin
        .from("efs_sync_runs")
        .insert({ carrier_account_id: carrier.id, started_at: startedAt, status: "running" })
        .select("id")
        .maybeSingle();
      runId = run?.id ?? null;
    }

    try {
      // One bulk call per carrier — never a getCardv2 loop over the fleet.
      const summaries = await getCardSummariesV2(carrier);

      const { data: cards } = await admin
        .from("efs_cards")
        .select("id, truck_id, card_last_four, raw_status")
        .eq("carrier_account_id", carrier.id);

      const byLastFour = new Map<string, { id: string; truck_id: string; raw_status: string | null }>();
      for (const card of cards ?? []) {
        if (card.card_last_four) byLastFour.set(card.card_last_four, card);
      }

      const incoming: Array<{ truckId: string; cardId: string; rawStatus: string | null }> = [];
      for (const s of summaries) {
        const four = s.cardNumber ? s.cardNumber.replace(/\D/g, "").slice(-4) : null;
        const match = four ? byLastFour.get(four) : undefined;
        if (!match) continue;
        incoming.push({ truckId: match.truck_id, cardId: match.id, rawStatus: s.status });
      }

      const stored: Record<string, string | null> = {};
      for (const card of cards ?? []) stored[card.truck_id] = card.raw_status;

      const changed = selectChangedCards(incoming, stored);
      const syncedAt = new Date().toISOString();

      if (!dryRun) {
        // Only rows whose status actually changed are written.
        for (const row of changed) {
          await admin
            .from("efs_cards")
            .update({
              raw_status: row.rawStatus,
              controllable_status: normalizeControllableStatus(row.rawStatus),
              last_synced_at: syncedAt,
              last_error: null,
            })
            .eq("id", row.cardId);
        }
        // General sync metadata is stored once per carrier, not on every card row.
        if (runId) {
          await admin
            .from("efs_sync_runs")
            .update({
              finished_at: syncedAt,
              status: "success",
              cards_received: summaries.length,
              cards_changed: changed.length,
            })
            .eq("id", runId);
        }
      }

      summary.push({
        carrier: carrier.name,
        cardsReceived: summaries.length,
        matched: incoming.length,
        cardsChanged: changed.length,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown EFS sync error";
      console.error(`EFS sync failed for ${carrier.name}:`, message);
      if (!dryRun && runId) {
        await admin
          .from("efs_sync_runs")
          .update({ finished_at: new Date().toISOString(), status: "error", error_summary: message })
          .eq("id", runId);
      }
      summary.push({ carrier: carrier.name, error: message });
    }
  }

  return new Response(JSON.stringify({ dryRun, carriers: summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
