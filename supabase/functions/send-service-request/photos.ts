/** Keep browser uploads within an email-sized payload and accept photos only. */
export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_PHOTO_BYTES = 12 * 1024 * 1024;

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

interface SubmittedPhoto {
  name: string;
  type: string;
  content: string;
}

export function validateServiceRequestPhotos(value: unknown): { filename: string; content: string }[] | null {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > MAX_PHOTOS) return null;
  let totalBytes = 0;
  const attachments: { filename: string; content: string }[] = [];
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== 'object') return null;
    const photo = raw as SubmittedPhoto;
    const extension = extensions[photo.type];
    if (!extension || typeof photo.name !== 'string' || photo.name.length > 120 ||
        typeof photo.content !== 'string' || !photo.content ||
        photo.content.length % 4 !== 0 ||
        photo.content.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.content)) return null;
    const padding = photo.content.endsWith('==') ? 2 : photo.content.endsWith('=') ? 1 : 0;
    const bytes = photo.content.length / 4 * 3 - padding;
    totalBytes += bytes;
    if (bytes === 0 || bytes > MAX_PHOTO_BYTES || totalBytes > MAX_TOTAL_PHOTO_BYTES) return null;
    const safeName = photo.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '').slice(0, 60) || 'photo';
    attachments.push({ filename: `${index + 1}-${safeName}.${extension}`, content: photo.content });
  }
  return attachments;
}
