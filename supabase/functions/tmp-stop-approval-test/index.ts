import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

serve(async () => {
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-stop-amount-approval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      managerUserId: "2204ae28-6d74-4d9e-b557-af269fd63e4f",
      testTo: "jon@bfprime.net",
      loadNumber: "6275932",
      brokerName: "TEST BROKER",
      truckNumber: null,
      driverId: "b0df170b-5958-4699-8e1a-671e8d23d827",
      orderId: "ff13d070-0a25-4c5f-8c84-46a08a84bfea",
      pickupDate: "2026-08-24T17:00:00+00:00",
      freightAmount: 3100,
      stopAmount: 3000,
      pickup: "Florence, KY",
      delivery: "Gladstone, VA",
      serviceTest: true,
    }),
  });
  return new Response(await res.text(), { status: 200 });
});
