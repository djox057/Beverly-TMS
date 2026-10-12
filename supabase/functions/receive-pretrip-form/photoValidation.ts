import type { FormFile } from "./mapping.ts";

const MB = 1024 * 1024;

/** Recognize image bytes when Google forwards an empty/generic MIME label. */
export function imageMimeFromBytes(bytes: Uint8Array): string | null {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) return "image/png";
  if (["GIF87a", "GIF89a"].includes(text(0, 6))) return "image/gif";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  if (text(0, 2) === "BM" && bytes.length >= 14) return "image/bmp";
  if (bytes.length >= 4 && ((text(0, 2) === "II" && bytes[2] === 42 && bytes[3] === 0)
    || (text(0, 2) === "MM" && bytes[2] === 0 && bytes[3] === 42))) return "image/tiff";
  // Only inspect the ISO BMFF file-type box; videos also use ftyp.
  if (bytes.length >= 16 && text(4, 8) === "ftyp") {
    const boxLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    const brands = [text(8, 12)];
    for (let offset = 16; offset + 4 <= Math.min(boxLength, bytes.length, 256); offset += 4) brands.push(text(offset, offset + 4));
    if (brands.some((brand) => ["avif", "avis"].includes(brand))) return "image/avif";
    if (brands.some((brand) => ["heic", "heix", "hevc", "hevx"].includes(brand))) return "image/heic";
  }
  return null;
}

export async function validatePhotoFile(file: File): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  if (file.size === 0) throw new Error("The photo file is empty. Upload the original image again");
  if (file.size > 10 * MB) throw new Error(`Photo is ${(file.size / MB).toFixed(1)} MB; the limit is 10 MB`);
  const bytes = await file.arrayBuffer();
  const detected = imageMimeFromBytes(new Uint8Array(bytes));
  const declared = file.type.toLowerCase().split(";")[0].trim();
  // Preserve support for image formats already accepted by the integration.
  const contentType = detected ?? (declared.startsWith("image/") ? declared : null);
  if (!contentType) throw new Error(`Unsupported photo type: ${declared || "not provided"}. Upload a JPG, PNG or another image file`);
  return { bytes, contentType };
}

/** Ignore generic bridge errors after a precise rejection or a completed import. */
export function shouldKeepPhotoResult(file: FormFile): boolean {
  return file.status === "imported" || (file.status === "error" && file.error_source === "tms");
}
