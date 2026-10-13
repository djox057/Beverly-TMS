// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compareVehicleDocument } from "../../supabase/functions/_shared/vehiclePlateCheck";

// Run the deployed handler with isolated auth, database and provider transports.
// Deno's npm: import is supplied here because Node cannot resolve that import scheme.
const source = readFileSync(new URL("../../supabase/functions/check-vehicle-document/index.ts", import.meta.url), "utf8").replace(/^import .*;\n/gm, "");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
let handler: (req: Request) => Promise<Response>;
const getUser = vi.fn();
const rpc = vi.fn();
const single = vi.fn();
const provider = vi.fn();
const database = { select: () => database, eq: () => database, single };
const createClient = () => ({ auth: { getUser }, rpc, from: () => database });
new Function("Deno", "createClient", "compareVehicleDocument", "fetch", compiled)(
  { env: { get: () => "fixture-only" }, serve: (callback: typeof handler) => { handler = callback; } },
  createClient, compareVehicleDocument, provider,
);
const vin = "1FUJGLDR0CLBT1234";
const response = (vehicles: unknown[]) => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ vehicles }) }] } }] });
const request = (options: { authorized?: boolean; type?: string; mime?: string; id?: string; bytes?: number } = {}) => {
  const body = new FormData();
  body.set("vehicleType", options.type || "truck");
  body.set("vehicleId", options.id || "12345678-1234-1234-1234-123456789abc");
  body.set("file", new File([new Uint8Array(options.bytes || 4)], "fixture.pdf", { type: options.mime || "application/pdf" }));
  return new Request("https://fixture.invalid/check-vehicle-document", { method: "POST", body,
    headers: options.authorized === false ? {} : { Authorization: "Bearer fixture-only" } });
};

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "uploader" } }, error: null });
  rpc.mockResolvedValue({ data: true, error: null });
  single.mockResolvedValue({ data: { id: "vehicle", plate: "AB0012", vin }, error: null });
  provider.mockResolvedValue(response([{ plate: "AB 0012", vin, confidence: 0.99 }]));
});

describe("vehicle document endpoint", () => {
  it("requires real user authentication and upload permission before OCR", async () => {
    expect((await handler(request({ authorized: false }))).status).toBe(401);
    getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error("Expired session") });
    expect((await handler(request())).status).toBe(401);
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await handler(request())).status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });
  it("does not process inaccessible vehicles or invalid vehicle types", async () => {
    single.mockResolvedValueOnce({ data: null, error: new Error("RLS denied") });
    expect((await handler(request())).status).toBe(404);
    expect((await handler(request({ type: "driver" }))).status).toBe(400);
    expect((await handler(request({ id: "not-a-uuid" }))).status).toBe(400);
    expect(provider).not.toHaveBeenCalled();
  });
  it("reads stored identifiers and matches an OCR plate", async () => {
    const result = await (await handler(request())).json();
    expect(result.data.status).toBe("match");
    expect(result.data.currentPlate).toBe("AB0012");
    expect(result.data.vinMatches).toBe(true);
    expect(result.data.canUpdatePlate).toBe(true);
    const payload = JSON.parse(provider.mock.calls[0][1].body);
    expect(payload.contents[0].parts[1].inlineData.mimeType).toBe("application/pdf");
  });
  it("reports a plate mismatch and a wrong VIN independently", async () => {
    provider.mockResolvedValueOnce(response([{ plate: "ZZ987", vin, confidence: 0.99 }]));
    expect((await (await handler(request({ type: "trailer" }))).json()).data.status).toBe("mismatch");
    provider.mockResolvedValueOnce(response([{ plate: "AB0012", vin: "1FUJGLDR0CLBT5432", confidence: 0.99 }]));
    expect((await (await handler(request())).json()).data.status).toBe("wrong_vehicle");
  });
  it("returns a manual-review result for unsupported files without calling the provider", async () => {
    expect((await (await handler(request({ mime: "application/zip" }))).json()).data.status).toBe("unsupported");
    expect(provider).not.toHaveBeenCalled();
  });
  it("bounds file sizes", async () => {
    expect((await handler(request({ bytes: 12 * 1024 * 1024 + 1 }))).status).toBe(413);
    expect(provider).not.toHaveBeenCalled();
  });
  it("does not claim a match after provider failures or malformed JSON", async () => {
    provider.mockResolvedValueOnce(new Response("Rate limit", { status: 429 }));
    expect((await handler(request())).status).toBe(502);
    provider.mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ text: "invalid JSON" }] } }] }));
    expect((await handler(request())).status).toBe(502);
    provider.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    expect((await handler(request())).status).toBe(502);
  });
});
