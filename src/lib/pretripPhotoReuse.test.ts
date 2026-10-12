import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { photoReuseMessage, pretripPhotoHash } from "./pretripPhotoReuse";

afterEach(() => vi.unstubAllGlobals());

it("matches identical original bytes even when the filename and Google ID change", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const original = new Uint8Array([255, 216, 255, 0, 1, 2]).buffer;
  const reupload = original.slice(0);
  const differentPhoto = new Uint8Array([255, 216, 255, 0, 1, 3]).buffer;
  const hash = await pretripPhotoHash(original);
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(await pretripPhotoHash(reupload)).toBe(hash);
  expect(await pretripPhotoHash(differentPhoto)).not.toBe(hash);
});

it("shows the earlier inspection date and original driver without shifting timezones", () => {
  expect(photoReuseMessage({ photo_id: "new", previous_photo_id: "old", previous_inspection_date: "2026-10-04",
    previous_truck_number: "0042", previous_driver_name: "Alex Driver" }))
    .toBe("Same photo submitted on 10/04/2026 · Unit 0042 · Alex Driver");
});
