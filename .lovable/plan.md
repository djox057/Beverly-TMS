

## Fix: Convert Large PNGs to JPEG Before PDF Embedding

### Problem

`pdf-lib`'s `embedPng()` decompresses PNG files into raw RGBA pixel data in memory. A 2MB PNG at 3000x4000 pixels becomes ~48MB of raw pixels. Three such images (as in load 11118-UE) consume ~144MB, exceeding the Deno edge function's ~150MB memory limit. In contrast, `embedJpg()` passes JPEG bytes through directly without decompression — minimal memory overhead.

### Solution

Before embedding any PNG, decode it and re-encode as JPEG at reasonable quality (80%). Then use `embedJpg()` instead of `embedPng()`. This converts the memory-heavy PNG embedding into a lightweight JPEG pass-through.

Additionally, **downscale** images that exceed the target page resolution. A letter-size page at 150 DPI is only 1275x1650 pixels — there's no benefit to embedding a 4000-pixel-wide image. Downscaling before JPEG encoding further reduces peak memory.

Also fix the non-functional `AbortController` timeout (the signal is never passed to the download call) and increase the timeout to 30s.

### Implementation

**File: `supabase/functions/merge-pdfs/index.ts`**

1. **Add dependencies** — import `pngs` (WASM PNG decoder for Deno) and `jpeg-js` (pure-JS JPEG encoder):
   ```typescript
   import { decode as decodePng } from "https://deno.land/x/pngs@0.1.1/mod.ts";
   import JPEG from "https://deno.land/x/jpeg@v1.0.1/mod.ts";
   ```

2. **Add a PNG-to-JPEG conversion helper** that also downscales:
   ```typescript
   const MAX_DIMENSION = 1650; // ~150 DPI on letter page

   const convertPngToJpeg = (pngBytes: Uint8Array): Uint8Array => {
     const decoded = decodePng(pngBytes); // { width, height, image (RGBA) }
     let { width, height, image: pixels } = decoded;

     // Downscale if larger than needed
     if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
       // Simple nearest-neighbor downscale
       const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
       const newW = Math.floor(width * scale);
       const newH = Math.floor(height * scale);
       const resized = new Uint8Array(newW * newH * 4);
       for (let y = 0; y < newH; y++) {
         for (let x = 0; x < newW; x++) {
           const srcX = Math.floor(x / scale);
           const srcY = Math.floor(y / scale);
           const srcIdx = (srcY * width + srcX) * 4;
           const dstIdx = (y * newW + x) * 4;
           resized[dstIdx] = pixels[srcIdx];
           resized[dstIdx+1] = pixels[srcIdx+1];
           resized[dstIdx+2] = pixels[srcIdx+2];
           resized[dstIdx+3] = pixels[srcIdx+3];
         }
       }
       pixels = resized;
       width = newW;
       height = newH;
     }

     const jpegData = JPEG.encode({ data: pixels, width, height }, 80);
     return new Uint8Array(jpegData.data);
   };
   ```

3. **Replace the image embedding block** (lines 162-184) — convert PNGs to JPEG before embedding:
   ```typescript
   if (isImageFile(file.file_name, file.content_type)) {
     let image;
     const isPng = file.file_name.toLowerCase().includes('.png')
       || file.content_type?.includes('png');

     if (isPng) {
       console.log(`Converting PNG to JPEG for embedding: ${file.file_name}`);
       const jpegBytes = convertPngToJpeg(fileBytesU8);
       image = await mainPdf.embedJpg(jpegBytes);
     } else {
       image = await mainPdf.embedJpg(fileBytes);
     }
     // ... rest of page sizing/drawing stays the same
   }
   ```

4. **Fix the non-functional timeout** in `downloadWithTimeout` — pass `signal` option (note: Supabase storage JS client doesn't support AbortSignal directly, so wrap with `Promise.race` instead):
   ```typescript
   const downloadWithTimeout = async (supabase, filePath, timeoutMs = 30000) => {
     const timeoutPromise = new Promise((_, reject) =>
       setTimeout(() => reject(new Error('Download timeout')), timeoutMs)
     );
     try {
       const result = await Promise.race([
         supabase.storage.from('order-files').download(filePath),
         timeoutPromise,
       ]);
       return result;
     } catch (e) {
       return { data: null, error: e };
     }
   };
   ```

### Why This Works

- `embedPng()` holds ~48MB per image in memory; `embedJpg()` holds only the compressed JPEG bytes (~200KB)
- Downscaling to 1650px max dimension before encoding means the intermediate pixel buffer is ~10MB instead of ~48MB
- Processing one image at a time allows GC between files
- JPEG quality 80% is visually indistinguishable for document scans (BOL/POD photos)

### Files Changed
- `supabase/functions/merge-pdfs/index.ts` — add PNG-to-JPEG conversion, downscaling, timeout fix

