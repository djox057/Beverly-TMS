/** Hash the original file bytes; filenames, dates and Google IDs are irrelevant. */
export async function pretripPhotoHash(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
