import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { pretripPhotoHash } from "../_shared/pretripPhotoHash.ts";

// Internal repair/backfill only. CRON_SECRET is checked before privileged access.
Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("Authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const started = Date.now();
  const { data: photos, error } = await db.from("pretrip_photos")
    .select("id,file_path").is("content_sha256", null)
    .order("hash_last_attempt_at", { nullsFirst: true }).order("id").limit(40);
  if (error) return Response.json({ error: "Could not load photos" }, { status: 500 });
  let processed = 0, failed = 0;
  for (let offset = 0; offset < (photos ?? []).length && Date.now() - started < 55000; offset += 4) {
    await Promise.all(photos!.slice(offset, offset + 4).map(async (photo) => {
      try {
        const attempt = await db.from("pretrip_photos").update({ hash_last_attempt_at: new Date().toISOString() })
          .eq("id", photo.id).is("content_sha256", null);
        if (attempt.error) throw attempt.error;
        // Fetch only a server-generated URL for a recorded private Storage path.
        const signed = await db.storage.from("pretrip-photos").createSignedUrl(photo.file_path, 60);
        if (signed.error || !signed.data?.signedUrl) throw new Error("Photo unavailable");
        const response = await fetch(signed.data.signedUrl, { signal: AbortSignal.timeout(15000) });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw new Error("Photo unavailable");
        if (Number(response.headers.get("content-length")) > 20 * 1024 * 1024) throw new Error("Photo too large");
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("Photo too large");
        const saved = await db.from("pretrip_photos").update({ content_sha256: await pretripPhotoHash(bytes) })
          .eq("id", photo.id).is("content_sha256", null);
        if (saved.error) throw saved.error;
        processed++;
      } catch {
        // Rotate failed files to the end, preserving photos and retrying next run.
        failed++;
      }
    }));
  }
  return Response.json({ processed, failed });
});
