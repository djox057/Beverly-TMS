import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { attachmentFilename, canSendPodMessage, MAX_ATTACHMENT_BYTES, resolveBooker, resolveManager, selectPods } from "./model.ts";
import type { PodFile, RecipientProfile } from "./model.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const timedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30000) });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.match(/^Bearer\s+\S+$/i)) return json({ error: "Unauthorized" }, 401);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization }, fetch: timedFetch },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user) return json({ error: "Unauthorized" }, 401);
    const { data: roles, error: rolesError } = await client.from("user_roles").select("role").eq("user_id", auth.user.id);
    if (rolesError) throw rolesError;
    if (!canSendPodMessage((roles || []).map(r => r.role))) return json({ error: "Only accounting, manager, and admin can use the POD popup." }, 403);
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
    if (!body || !uuid.test(body.orderId || "") || !["preview", "send"].includes(body.action)) return json({ error: "Invalid request" }, 400);
    if (body.action === "send" && (typeof body.message !== "string" || !body.message.trim() || body.message.length > 5000 || !uuid.test(body.requestId || ""))) {
      return json({ error: "Enter a message of up to 5,000 characters." }, 400);
    }
    // User-scoped queries preserve order and document RLS even for privileged callers.
    const { data: order, error: orderError } = await client.from("orders")
      .select("id, booked_by, load_number, internal_load_number").eq("id", body.orderId).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return json({ error: "Load not found or access denied." }, 404);
    const { data: files, error: filesError } = await client.from("order_files")
      .select("id,file_name,file_path,content_type,file_size").eq("order_id", order.id).eq("file_category", "POD").order("created_at").order("id");
    if (filesError) throw filesError;
    const pods = (files || []) as PodFile[];
    let recipients: { to: string; bookerName: string; replyTo: string[] } | null = null;
    let recipientError: string | null = null;
    try {
      if (!order.booked_by) throw new Error("This load has no booking user.");
      const bookerQuery = client.from("profiles").select("user_id,full_name,email,office");
      const { data: bookerProfiles, error: bookerError } = uuid.test(order.booked_by)
        ? await bookerQuery.eq("user_id", order.booked_by)
        : await bookerQuery.eq("full_name", order.booked_by);
      if (bookerError) throw bookerError;
      const booker = resolveBooker(order.booked_by, (bookerProfiles || []) as RecipientProfile[]);
      const { data: managerRoles, error: managerRolesError } = await client.from("user_roles").select("user_id").eq("role", "manager");
      if (managerRolesError) throw managerRolesError;
      const { data: managers, error: managersError } = await client.from("profiles").select("user_id,full_name,email,office")
        .in("user_id", (managerRoles || []).map(r => r.user_id));
      if (managersError) throw managersError;
      const manager = resolveManager(booker, (managers || []) as RecipientProfile[]);
      // Use Auth's verified identity addresses rather than editable profile email fields.
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { global: { fetch: timedFetch }, auth: { persistSession: false, autoRefreshToken: false } });
      const [bookerAuth, managerAuth] = await Promise.all([admin.auth.admin.getUserById(booker.user_id), admin.auth.admin.getUserById(manager.user_id)]);
      if (bookerAuth.error || managerAuth.error || !bookerAuth.data.user?.email || !managerAuth.data.user?.email || !auth.user.email) {
        throw new Error("A booking user, sender, or manager email address is missing.");
      }
      recipients = { to: bookerAuth.data.user.email, bookerName: booker.full_name || bookerAuth.data.user.email,
        replyTo: [...new Set([auth.user.email, managerAuth.data.user.email])] };
    } catch (error) {
      recipientError = error instanceof Error ? error.message : "Unable to resolve the booking user and manager.";
    }
    if (body.action === "preview") {
      const { data: urls, error: urlsError } = pods.length
        ? await client.storage.from("order-files").createSignedUrls(pods.map(file => file.file_path), 3600)
        : { data: [], error: null };
      if (urlsError) throw urlsError;
      return json({ loadNumber: String(order.internal_load_number || order.load_number || order.id), recipients, recipientError,
        files: pods.map((file, index) => ({ id: file.id, file_name: file.file_name, content_type: file.content_type, url: urls?.[index]?.signedUrl || null })) });
    }
    if (!recipients) return json({ error: recipientError }, 422);
    let selected;
    try { selected = selectPods(pods, body.selectedFileIds); } catch (error) { return json({ error: (error as Error).message }, 400); }
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "Email service is unavailable." }, 503);
    const attachments: { filename: string; content: string }[] = [];
    let totalBytes = 0;
    for (const [index, file] of selected.entries()) {
      const { data: blob, error: downloadError } = await client.storage.from("order-files").download(file.file_path);
      if (downloadError || !blob) return json({ error: "A selected POD could not be loaded. No email was sent." }, 422);
      totalBytes += blob.size;
      if (totalBytes > MAX_ATTACHMENT_BYTES) return json({ error: "Selected PODs exceed the 25 MB email attachment limit." }, 400);
      attachments.push({ filename: attachmentFilename(file.file_name, index), content: encodeBase64(await blob.arrayBuffer()) });
    }
    const loadNumber = String(order.internal_load_number || order.load_number || order.id).replace(/[\r\n]/g, " ").slice(0, 120);
    const message = body.message.trim();
    const response = await timedFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `pod-${auth.user.id}-${order.id}-${body.requestId}` },
      body: JSON.stringify({ from: "Beverly TMS <jon@bfprime.net>", to: [recipients.to], reply_to: recipients.replyTo,
        subject: `POD message — Load ${loadNumber}`, text: `Load ${loadNumber}\n\n${message}\n\nSent by ${auth.user.email}`,
        html: `<h2>POD message — Load ${escapeHtml(loadNumber)}</h2><div style="white-space:pre-wrap">${escapeHtml(message)}</div><p>Sent by ${escapeHtml(auth.user.email!)}</p>`, attachments }),
    });
    const result = await response.json();
    if (!response.ok || !result.id) return json({ error: "Email delivery was not confirmed. Please retry." }, 502);
    return json({ success: true, emailId: result.id });
  } catch {
    // Do not log message bodies, POD documents, tokens, or recipient details.
    return json({ error: "Unable to process the POD message. Please retry." }, 500);
  }
});
