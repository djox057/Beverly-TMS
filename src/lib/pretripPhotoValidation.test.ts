import { File as NodeFile } from "node:buffer";
import { describe, expect, it } from "vitest";
import { imageMimeFromBytes, shouldKeepPhotoResult, validatePhotoFile } from "../../supabase/functions/receive-pretrip-form/photoValidation";

const jpeg = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70]);
const asFile = (bytes: Uint8Array | string, type: string) => new NodeFile([bytes], "photo", { type }) as unknown as File;

describe("pretrip photo validation", () => {
  it.each(["", "application/octet-stream", "application/x-unknown", "image/png"])("accepts original JPEG bytes labeled %s", async (type) => {
    const result = await validatePhotoFile(asFile(jpeg, type));
    expect(result.contentType).toBe("image/jpeg");
    expect(new Uint8Array(result.bytes)).toEqual(jpeg);
  });
  it("accepts PNG, GIF, WebP, TIFF and BMP headers", () => {
    expect(imageMimeFromBytes(new Uint8Array([137,80,78,71,13,10,26,10]))).toBe("image/png");
    expect(imageMimeFromBytes(new TextEncoder().encode("GIF89a"))).toBe("image/gif");
    expect(imageMimeFromBytes(new TextEncoder().encode("RIFF0000WEBP"))).toBe("image/webp");
    expect(imageMimeFromBytes(new Uint8Array([73,73,42,0]))).toBe("image/tiff");
    expect(imageMimeFromBytes(new TextEncoder().encode("BM000000000000"))).toBe("image/bmp");
  });
  it("distinguishes HEIC/AVIF photo brands from MP4 videos", () => {
    const box = (brand: string) => new Uint8Array([0,0,0,20,...new TextEncoder().encode(`ftyp${brand}0000${brand}`)]);
    expect(imageMimeFromBytes(box("heic"))).toBe("image/heic");
    expect(imageMimeFromBytes(box("avif"))).toBe("image/avif");
    expect(imageMimeFromBytes(box("mp42"))).toBeNull();
  });
  it("rejects non-images without treating filenames as evidence", async () => {
    await expect(validatePhotoFile(asFile("%PDF-1.7", "application/pdf"))).rejects.toThrow("Unsupported file type: application/pdf");
    await expect(validatePhotoFile(asFile("random bytes", "application/octet-stream"))).rejects.toThrow("Unsupported file type");
  });
  it("reports empty and oversized files precisely", async () => {
    await expect(validatePhotoFile(asFile("", "image/jpeg"))).rejects.toThrow("empty");
    await expect(validatePhotoFile(asFile(new Uint8Array(10 * 1024 * 1024 + 1), "image/jpeg"))).rejects.toThrow("limit is 10 MB");
  });
  it("keeps precise TMS errors and imported photos when a generic error arrives", () => {
    expect(shouldKeepPhotoResult({ category: "Front", drive_id: "id", status: "error", error: "Unsupported photo type", error_source: "tms" })).toBe(true);
    expect(shouldKeepPhotoResult({ category: "Front", drive_id: "id", status: "imported" })).toBe(true);
    expect(shouldKeepPhotoResult({ category: "Front", drive_id: "id", status: "error", error: "Drive unavailable" })).toBe(false);
    expect(shouldKeepPhotoResult({ category: "Front", drive_id: "id", status: "pending" })).toBe(false);
  });
});

it("imports MOV and MP4 clips using their original bytes",async()=>{
 for(const [brand,declared,expected] of [["qt  ","video/quicktime","video/quicktime"],["mp42","application/octet-stream","video/mp4"]]){
  const bytes=new Uint8Array([0,0,0,20,...new TextEncoder().encode(`ftyp${brand}0000${brand}`)]);
  const result=await validatePhotoFile(asFile(bytes,declared));
  expect(result.contentType).toBe(expected);expect(new Uint8Array(result.bytes)).toEqual(bytes);
 }
});
