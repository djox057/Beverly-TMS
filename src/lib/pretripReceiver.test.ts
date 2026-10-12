// @vitest-environment node
import { webcrypto, createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { receivePretripForm } from "../../supabase/functions/receive-pretrip-form/receiver";

const token = "a".repeat(64);
const tokenHash = createHash("sha256").update(token).digest("hex");
const jpeg = new Uint8Array([255,216,255,224,0,16,74,70,73,70]);

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

function database(initial: Record<string, unknown> = {}, storageError: unknown = null) {
  const file: Record<string, any> = { category: "Truck front headlights and turn signals", drive_id: "drive-one", status: "pending", ...initial };
  const submission = { id: "submission", truck_id: "unit", inspection_date: "2026-10-12", status: "pending", files: [file] };
  const patches: Record<string, unknown>[] = [], photos: Record<string, unknown>[] = [], uploads: Blob[] = [];
  const db = {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
        maybeSingle: async () => ({ data: table === "pretrip_form_connection" ? (filters.token_hash === tokenHash ? { id: true } : null)
          : table === "pretrip_form_submissions" && filters.id === "submission" ? submission
          : table === "pretrip_photos" ? photos.find((row) => Object.entries(filters).every(([key, value]) => row[key] === value)) ?? null : null, error: null }),
        single: async () => ({ data: { enabled: true }, error: null }),
        insert: async (row: Record<string, unknown>) => { photos.push(row); return { error: null }; },
        update: () => ({ eq: async () => ({ error: null }) }),
      };
      return chain;
    },
    storage: { from: () => ({ upload: async (_path: string, blob: Blob) => { uploads.push(blob); return { error: storageError }; } }) },
    rpc: async (_name: string, args: { _patch: Record<string, unknown> }) => {
      patches.push(args._patch); Object.assign(file, args._patch); return { error: null };
    },
  };
  return { db, file, patches, photos, uploads };
}

function photoRequest(bytes: Uint8Array, type: string) {
  const form = new FormData();
  form.set("submission_id", "submission"); form.set("drive_id", "drive-one");
  form.set("category", "Truck front headlights and turn signals");
  form.set("file", new Blob([new Uint8Array(bytes)], { type }), "front.jpg");
  return new Request("https://example.test", { method: "POST", headers: { "x-pretrip-token": token }, body: form });
}

function bridgeErrorRequest() {
  return new Request("https://example.test", { method: "POST", headers: { "x-pretrip-token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "photo_error", submission_id: "submission", drive_id: "drive-one", category: "Truck front headlights and turn signals", error: "Google photo could not be forwarded" }) });
}

it("imports a mislabeled JPEG, stores the correct MIME type and fingerprints original bytes", async () => {
  const fixture = database();
  const result = await receivePretripForm(photoRequest(jpeg, "application/octet-stream"), () => fixture.db);
  expect(result.status).toBe(200);
  expect(fixture.uploads[0].type).toBe("image/jpeg");
  expect(new Uint8Array(await fixture.uploads[0].arrayBuffer())).toEqual(jpeg);
  expect(fixture.photos[0]).toMatchObject({ content_sha256: createHash("sha256").update(jpeg).digest("hex"), file_name: "front.jpg" });
  expect(fixture.file.status).toBe("imported");
});

it("imports the MOV and MP4 files that previously failed image-only validation",async()=>{
 for(const [brand,type] of [["qt  ","video/quicktime"],["mp42","video/mp4"]]){
  const bytes=new Uint8Array([0,0,0,20,...new TextEncoder().encode(`ftyp${brand}0000${brand}`)]);
  const fixture=database();
  expect((await receivePretripForm(photoRequest(bytes,type),()=>fixture.db)).status).toBe(200);
  expect(fixture.uploads[0].type).toBe(type);
  expect(fixture.photos[0]).toMatchObject({content_type:type,content_sha256:createHash("sha256").update(bytes).digest("hex")});
  expect(fixture.file).toMatchObject({status:"imported",content_type:type,error:null});
 }
});

it("replays an imported photo without another storage upload or database record", async () => {
  const fixture = database();
  for (let attempt = 0; attempt < 2; attempt++) {
    expect((await receivePretripForm(photoRequest(jpeg, "application/octet-stream"), () => fixture.db)).status).toBe(200);
  }
  expect(fixture.uploads).toHaveLength(1);
  expect(fixture.photos).toHaveLength(1);
  expect(fixture.file.status).toBe("imported");
});

it("retains the real rejection after the old bridge reports a generic error", async () => {
  const fixture = database();
  const result = await receivePretripForm(photoRequest(new TextEncoder().encode("%PDF-1.7"), "application/pdf"), () => fixture.db);
  expect(result.status).toBe(400);
  expect(fixture.uploads).toHaveLength(0);
  expect(fixture.file).toMatchObject({ status: "error", error_source: "tms" });
  expect(fixture.file.error).toContain("application/pdf");
  const exact = fixture.file.error;
  expect((await receivePretripForm(bridgeErrorRequest(), () => fixture.db)).status).toBe(200);
  expect(fixture.file.error).toBe(exact);
  expect(fixture.patches).toHaveLength(1);
});

it("does not turn a completed photo into a failure after a lost response", async () => {
  const fixture = database({ status: "imported", file_path: "stored.jpg" });
  expect((await receivePretripForm(bridgeErrorRequest(), () => fixture.db)).status).toBe(200);
  expect(fixture.file.status).toBe("imported");
  expect(fixture.patches).toHaveLength(0);
});

it("records a storage failure and recovers on the next successful attempt", async () => {
  const failed = database({}, { statusCode: "503" });
  expect((await receivePretripForm(photoRequest(jpeg, "image/jpeg"), () => failed.db)).status).toBe(400);
  expect(failed.file).toMatchObject({ status: "error", error_source: "tms", error: "TMS photo upload failed" });
  const retry = database(failed.file);
  expect((await receivePretripForm(photoRequest(jpeg, "image/jpeg"), () => retry.db)).status).toBe(200);
  expect(retry.file).toMatchObject({ status: "imported", error: null, error_source: null });
});

it("rejects missing or invalid bridge credentials before any photo writes", async () => {
  const fixture = database();
  expect((await receivePretripForm(new Request("https://example.test", { method: "POST" }), () => fixture.db)).status).toBe(401);
  const request = photoRequest(jpeg, "image/jpeg"); request.headers.set("x-pretrip-token", "b".repeat(64));
  expect((await receivePretripForm(request, () => fixture.db)).status).toBe(401);
  expect(fixture.uploads).toHaveLength(0); expect(fixture.photos).toHaveLength(0);
});
