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
    if (body?.action === "delete-rejection") {
      if (!uuid.test(body.rejectionId || "")) return json({ error: "Invalid rejection report" }, 400);
      const { data: report, error: readError } = await client.from("pod_rejections").select("id")
        .eq("id", body.rejectionId).is("deleted_at", null).maybeSingle();
      if (readError) throw readError;
      if (!report) return json({ error: "Rejection report not found or access denied." }, 404);
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { global: { fetch: timedFetch }, auth: { persistSession: false, autoRefreshToken: false } });
      const { data: deleted, error: deleteError } = await admin.from("pod_rejections")
        .update({ deleted_at: new Date().toISOString(), deleted_by: auth.user.id })
        .eq("id", report.id).is("deleted_at", null).select("id").maybeSingle();
      if (deleteError) throw deleteError;
      if (!deleted) return json({ error: "The rejection report was already deleted." }, 404);
      return json({ success: true });
    }
    if (!body || !uuid.test(body.orderId || "") || !["preview", "send"].includes(body.action)) return json({ error: "Invalid request" }, 400);
    if (body.action === "send" && (typeof body.message !== "string" || !body.message.trim() || body.message.length > 5000 || !uuid.test(body.requestId || ""))) {
      return json({ error: "Enter a message of up to 5,000 characters." }, 400);
    }
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { global: { fetch: timedFetch }, auth: { persistSession: false, autoRefreshToken: false } });
    // User-scoped queries preserve order and document RLS even for privileged callers.
    const { data: order, error: orderError } = await client.from("orders")
      .select("id, booked_by, load_number, internal_load_number, broker_load_number, booked_by_company_id").eq("id", body.orderId).maybeSingle();
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
    // Save the rejection before attempting email; retries reuse this immutable report.
    const { data: reporter, error: reporterError } = await client.from("profiles").select("full_name").eq("user_id", auth.user.id).maybeSingle();
    if (reporterError) throw reporterError;
    const reportKey = { reporter_id: auth.user.id, order_id: order.id, request_id: body.requestId };
    const { error: saveError } = await admin.from("pod_rejections").upsert({
      ...reportKey, broker_load_number: order.broker_load_number, booked_by_company_id: order.booked_by_company_id,
      reporter_name: reporter?.full_name || auth.user.email!, reporter_email: auth.user.email!, reason: message,
      dispatcher_name: recipients.bookerName,
      pods: selected.map(file => ({ id: file.id, file_name: file.file_name, file_path: file.file_path, content_type: file.content_type })),
    }, { onConflict: "reporter_id,order_id,request_id", ignoreDuplicates: true });
    if (saveError) return json({ error: "The rejection could not be saved. No email was sent." }, 503);
    const { data: report, error: reportError } = await admin.from("pod_rejections").select("id,reason,pods,notification_status,email_id,deleted_at")
      .eq("reporter_id", auth.user.id).eq("order_id", order.id).eq("request_id", body.requestId).maybeSingle();
    if (reportError || !report) return json({ error: "The rejection could not be confirmed. No email was sent." }, 503);
    if (report.deleted_at) return json({ error: "This rejection report was deleted. Reopen the popup to create a new report." }, 409);
    const storedIds = (report.pods as { id: string }[]).map(file => file.id).sort();
    if (report.reason !== message || JSON.stringify(storedIds) !== JSON.stringify(selected.map(file => file.id).sort())) {
      return json({ error: "This request was already used for a different rejection. Reopen the popup and try again." }, 409);
    }
    if (report.notification_status === "sent" && report.email_id) return json({ success: true, emailId: report.email_id, rejectionId: report.id });
    const markFailed = async () => {
      await admin.from("pod_rejections").update({ notification_status: "failed" }).eq("id", report.id).neq("notification_status", "sent");
    };
    let response: Response;
    try { response = await timedFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `pod-${auth.user.id}-${order.id}-${body.requestId}` },
      body: JSON.stringify({ from: "Beverly TMS <jon@bfprime.net>", to: [recipients.to], reply_to: recipients.replyTo,
        subject: `Rejected POD — Load ${loadNumber}`, text: `Load ${loadNumber}\n\n${message}\n\nSent by ${auth.user.email}`,
        html: `<h2>Rejected POD — Load ${escapeHtml(loadNumber)}</h2><div style="white-space:pre-wrap">${escapeHtml(message)}</div><p>Sent by ${escapeHtml(auth.user.email!)}</p>`, attachments }),
    }); } catch {
      await markFailed();
      return json({ error: "PODs were rejected, but email delivery was not confirmed. Retry to notify the booking user." }, 502);
    }
    let result;
    try { result = await response.json(); } catch { result = null; }
    if (!response.ok || !result?.id) {
      await markFailed();
      return json({ error: "PODs were rejected, but email delivery was not confirmed. Retry to notify the booking user." }, 502);
    }
    const { error: confirmError } = await admin.from("pod_rejections").update({ notification_status: "sent", email_id: result.id, notified_at: new Date().toISOString() }).eq("id", report.id);
    if (confirmError) return json({ error: "PODs were rejected and the email was accepted, but its status could not be saved. Retry to confirm without sending a duplicate." }, 503);
    return json({ success: true, emailId: result.id, rejectionId: report.id });
  } catch {
    // Do not log message bodies, POD documents, tokens, or recipient details.
    return json({ error: "Unable to process the POD message. Please retry." }, 500);
  }
});
