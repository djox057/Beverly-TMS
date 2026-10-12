import { readFileSync } from "node:fs";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as rules from "../../supabase/functions/send-pod-message/model";

const orderId = "11111111-1111-1111-1111-111111111111";
const rejectionId = "33333333-3333-3333-3333-333333333333";
const requestId = "22222222-2222-2222-2222-222222222222";
const source = readFileSync("supabase/functions/send-pod-message/index.ts", "utf8").replace(/^import .*\n/gm, "");
const compiled = transpileModule(source, { compilerOptions: { target: ScriptTarget.ES2022, module: ModuleKind.None } }).outputText;
let rows: Record<string, Record<string, unknown>[]>;
let role = "accounting";
let authenticated = true;
let failSave = false;
const sendEmail = vi.fn();
const download = vi.fn();
const tableRead = vi.fn();
function endpoint() {
  let handler!: (req: Request) => Promise<Response>;
  const client = {
    auth: {
      getUser: async () => ({ data: { user: authenticated ? { id: "sender", email: "sender@example.test" } : null }, error: null }),
      admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@verified.test` } }, error: null }) },
    },
    from: (table: string) => {
      tableRead(table);
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      let updatePayload: Record<string, unknown> | null = null;
      const data = () => ({ data: (table === "user_roles" ? [{ user_id: "sender", role }, { user_id: "manager", role: "manager" }] : rows[table] || []).filter(row => filters.every(filter => filter(row))), error: null });
      const query = {
        select: () => query, order: () => query,
        upsert: async (value: Record<string, unknown>) => {
          if (failSave) return { error: new Error("Database unavailable") };
          const reports = rows[table] || (rows[table] = []);
          if (!reports.some(row => row.reporter_id === value.reporter_id && row.order_id === value.order_id && row.request_id === value.request_id)) {
            reports.push({ id: rejectionId, deleted_at: null, deleted_by: null, notification_status: "pending", email_id: null, ...value });
          }
          return { error: null };
        },
        update: (value: Record<string, unknown>) => { updatePayload = value; return query; },
        neq: (column: string, value: unknown) => { filters.push(row => row[column] !== value); return query; },
        is: (column: string, value: unknown) => { filters.push(row => row[column] === value); return query; },
        eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return query; },
        in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return query; },
        maybeSingle: async () => { const matched = data().data; if (updatePayload) matched.forEach(row => Object.assign(row, updatePayload)); return { data: matched[0] || null, error: null }; },
        then: (resolve: (value: ReturnType<typeof data>) => unknown) => {
          if (updatePayload) data().data.forEach(row => Object.assign(row, updatePayload));
          return Promise.resolve(data()).then(resolve);
        },
      };
      return query;
    },
    storage: { from: () => ({ download, createSignedUrls: async (paths: string[]) => ({ data: paths.map(path => ({ signedUrl: `https://storage.test/${path}` })), error: null }) }) },
  };
  const runtime = { env: { get: (key: string) => key }, serve: (value: typeof handler) => { handler = value; } };
  const helpers = ["attachmentFilename", "canSendPodMessage", "MAX_ATTACHMENT_BYTES", "resolveBooker", "resolveManager", "selectPods"] as const;
  new Function("createClient", "encodeBase64", "Deno", "fetch", ...helpers, compiled)(() => client, () => "Ynl0ZXM=", runtime, sendEmail, ...helpers.map(name => rules[name]));
  return handler;
}
const request = (body: Record<string, unknown>, auth = true) => new Request("https://tms.test/functions/v1/send-pod-message", {
  method: "POST", headers: { "Content-Type": "application/json", ...(auth ? { Authorization: "Bearer user-token" } : {}) }, body: JSON.stringify(body),
});
beforeEach(() => {
  authenticated = true; failSave = false; role = "accounting"; tableRead.mockClear(); sendEmail.mockReset(); download.mockReset();
  sendEmail.mockResolvedValue(new Response(JSON.stringify({ id: "email1" }), { status: 200 }));
  download.mockResolvedValue({ data: new Blob(["bytes"]), error: null });
  rows = {
    orders: [{ id: orderId, booked_by: "Jane Booker", internal_load_number: "LOAD-123", load_number: "OTHER-NUMBER", broker_load_number: "BROKER-123", booked_by_company_id: "company1" }],
    profiles: [{ user_id: "sender", full_name: "Reporter Name", office: "Čačak", email: "sender@example.test" }, { user_id: "booker", full_name: "Jane Booker", office: "Čačak", email: "editable@example.test" }, { user_id: "manager", full_name: "Manager", office: "Čačak", email: "editable-manager@example.test" }],
    order_files: ["pod1", "pod2"].map(id => ({ id, order_id: orderId, file_category: "POD", file_name: `${id}.jpg`, file_path: `${orderId}/${id}.jpg`, file_size: 5, content_type: "image/jpeg" })),
  };
});
describe("POD message endpoint boundaries", () => {
  it("rejects absent or invalid authentication before reading load data", async () => {
    expect((await endpoint()(request({ action: "preview", orderId }, false))).status).toBe(401);
    authenticated = false;
    expect((await endpoint()(request({ action: "preview", orderId }))).status).toBe(401);
    expect(tableRead).not.toHaveBeenCalled(); expect(sendEmail).not.toHaveBeenCalled();
  });
  it("rejects unauthorized roles before reading PODs or sending", async () => {
    role = "dispatch";
    expect((await endpoint()(request({ action: "send", orderId, requestId, message: "Review", selectedFileIds: ["pod1"] }))).status).toBe(403);
    expect(tableRead.mock.calls).toEqual([["user_roles"]]); expect(sendEmail).not.toHaveBeenCalled();
  });
  it("prepares signed previews and authoritative recipients without sending an email", async () => {
    const response = await endpoint()(request({ action: "preview", orderId }));
    const body = await response.json();
    expect(body.recipients).toEqual({ to: "booker@verified.test", bookerName: "Jane Booker", replyTo: ["sender@example.test", "manager@verified.test"] });
    expect(body.files).toHaveLength(2); expect(body.files[0].url).toContain(orderId);
    expect(download).not.toHaveBeenCalled(); expect(sendEmail).not.toHaveBeenCalled();
    expect(rows.pod_rejections).toBeUndefined();
  });
  it("sends only the selected POD, ignores forged recipients, and sets Reply-To plus idempotency", async () => {
    const response = await endpoint()(request({ action: "send", orderId, requestId, message: "Check <signature>", selectedFileIds: ["pod2"], to: "attacker@example.test", replyTo: ["attacker@example.test"] }));
    expect(response.status).toBe(200); expect(download.mock.calls).toEqual([[`${orderId}/pod2.jpg`]]);
    const options = sendEmail.mock.calls[0][1]; const payload = JSON.parse(options.body);
    expect(payload.to).toEqual(["booker@verified.test"]); expect(payload.reply_to).toEqual(["sender@example.test", "manager@verified.test"]);
    expect(payload.attachments).toEqual([{ filename: "1-pod2.jpg", content: "Ynl0ZXM=" }]);
    expect(payload.html).toContain("Check &lt;signature&gt;"); expect(options.headers["Idempotency-Key"]).toContain(requestId);
    expect(rows.pod_rejections[0]).toMatchObject({ reporter_id: "sender", reporter_name: "Reporter Name", broker_load_number: "BROKER-123", reason: "Check <signature>", dispatcher_name: "Jane Booker", notification_status: "sent", email_id: "email1" });
    expect((rows.pod_rejections[0].pods as { id: string }[]).map(file => file.id)).toEqual(["pod2"]);
  });
  it("rejects files belonging to another load before download or send", async () => {
    rows.order_files.push({ ...rows.order_files[0], id: "foreign", order_id: "other-load" });
    const response = await endpoint()(request({ action: "send", orderId, requestId, message: "Review", selectedFileIds: ["foreign"] }));
    expect(response.status).toBe(400); expect(download).not.toHaveBeenCalled(); expect(sendEmail).not.toHaveBeenCalled();
  });
  it("checks actual attachment size instead of trusting stored file metadata", async () => {
    download.mockResolvedValue({ data: { size: rules.MAX_ATTACHMENT_BYTES + 1 }, error: null });
    const response = await endpoint()(request({ action: "send", orderId, requestId, message: "Review", selectedFileIds: ["pod1"] }));
    expect(response.status).toBe(400); expect(sendEmail).not.toHaveBeenCalled();
  });
  it("blocks delivery if a selected document disappears or the provider fails", async () => {
    download.mockResolvedValueOnce({ data: null, error: new Error("Not found") });
    expect((await endpoint()(request({ action: "send", orderId, requestId, message: "Review", selectedFileIds: ["pod1"] }))).status).toBe(422);
    expect(sendEmail).not.toHaveBeenCalled();
    sendEmail.mockResolvedValueOnce(new Response(JSON.stringify({ message: "Rate limited" }), { status: 429 }));
    expect((await endpoint()(request({ action: "send", orderId, requestId, message: "Review", selectedFileIds: ["pod1"] }))).status).toBe(502);
  });
  it("preserves the report after email failure and records a successful retry once", async () => {
    sendEmail.mockResolvedValueOnce(new Response(JSON.stringify({ message: "Rate limited" }), { status: 429 }));
    const body = { action: "send", orderId, requestId, message: "Unreadable signature", selectedFileIds: ["pod1"] };
    expect((await endpoint()(request(body))).status).toBe(502);
    expect(rows.pod_rejections).toHaveLength(1); expect(rows.pod_rejections[0].notification_status).toBe("failed");
    expect((await endpoint()(request(body))).status).toBe(200);
    expect(rows.pod_rejections).toHaveLength(1); expect(rows.pod_rejections[0].notification_status).toBe("sent");
    expect(sendEmail.mock.calls[1][1].headers["Idempotency-Key"]).toBe(sendEmail.mock.calls[0][1].headers["Idempotency-Key"]);
    expect((await endpoint()(request(body))).status).toBe(200); expect(sendEmail).toHaveBeenCalledTimes(2);
  });
  it("does not send when rejection history cannot be saved", async () => {
    failSave = true;
    const response = await endpoint()(request({ action: "send", orderId, requestId, message: "Review", selectedFileIds: ["pod1"] }));
    expect(response.status).toBe(503); expect(sendEmail).not.toHaveBeenCalled(); expect(rows.pod_rejections).toBeUndefined();
  });
  it("rejects attempts to reuse a report request ID with a different reason", async () => {
    const body = { action: "send", orderId, requestId, message: "Unreadable signature", selectedFileIds: ["pod1"] };
    expect((await endpoint()(request(body))).status).toBe(200);
    expect((await endpoint()(request({ ...body, message: "Different reason" }))).status).toBe(409);
    expect(rows.pod_rejections[0].reason).toBe(body.message); expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("restricts rejection deletion to the same authorized roles", async () => {
    role = "dispatch";
    expect((await endpoint()(request({ action: "delete-rejection", rejectionId }))).status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("marks a visible report deleted without touching documents or sending email", async () => {
    rows.pod_rejections = [{ id: rejectionId, deleted_at: null, deleted_by: null }];
    expect((await endpoint()(request({ action: "delete-rejection", rejectionId }))).status).toBe(200);
    expect(rows.pod_rejections[0]).toMatchObject({ deleted_by: "sender", deleted_at: expect.any(String) });
    expect(rows.order_files).toHaveLength(2); expect(download).not.toHaveBeenCalled(); expect(sendEmail).not.toHaveBeenCalled();
    expect((await endpoint()(request({ action: "delete-rejection", rejectionId }))).status).toBe(404);
  });
  it("does not delete absent or inaccessible reports", async () => {
    expect((await endpoint()(request({ action: "delete-rejection", rejectionId }))).status).toBe(404);
    expect((await endpoint()(request({ action: "delete-rejection", rejectionId: "invalid" }))).status).toBe(400);
  });
  it("does not recreate a deleted report if its original send request is retried", async () => {
    const body = { action: "send", orderId, requestId, message: "Unreadable signature", selectedFileIds: ["pod1"] };
    expect((await endpoint()(request(body))).status).toBe(200);
    expect((await endpoint()(request({ action: "delete-rejection", rejectionId }))).status).toBe(200);
    expect((await endpoint()(request(body))).status).toBe(409);
    expect(rows.pod_rejections).toHaveLength(1); expect(rows.pod_rejections[0].deleted_by).toBe("sender");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

});
