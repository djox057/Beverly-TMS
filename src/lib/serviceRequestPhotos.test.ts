import { describe, expect, it } from 'vitest';
import { MAX_PHOTOS, MAX_PHOTO_BYTES, MAX_TOTAL_PHOTO_BYTES, validateServiceRequestPhotos } from '../../supabase/functions/send-service-request/photos';

const photo = (name: string, type = 'image/jpeg', content = 'AQID') => ({ name, type, content });

describe('service request email photos', () => {
  it('accepts multiple photos and assigns safe image filenames', () => {
    expect(validateServiceRequestPhotos([
      photo('../repair (1).jpg'),
      photo('front.png', 'image/png'),
    ])).toEqual([
      { filename: '1-repair_1.jpg', content: 'AQID' },
      { filename: '2-front.png', content: 'AQID' },
    ]);
    expect(validateServiceRequestPhotos(undefined)).toEqual([]);
  });

  it('rejects invalid formats, excessive count, and excessive bytes', () => {
    expect(validateServiceRequestPhotos([photo('script.js', 'application/javascript')])).toBeNull();
    expect(validateServiceRequestPhotos([photo('photo.jpg', 'image/jpeg', '!bad')])).toBeNull();
    expect(validateServiceRequestPhotos(Array.from({ length: MAX_PHOTOS + 1 }, (_, i) => photo(`${i}.jpg`)))).toBeNull();
    const large = 'AAAA'.repeat(Math.ceil((MAX_PHOTO_BYTES + 1) / 3));
    expect(validateServiceRequestPhotos([photo('large.jpg', 'image/jpeg', large)])).toBeNull();
    const portion = 'AAAA'.repeat(Math.floor(MAX_TOTAL_PHOTO_BYTES / 12) + 1);
    expect(validateServiceRequestPhotos(Array.from({ length: 4 }, (_, i) => photo(`${i}.jpg`, 'image/jpeg', portion)))).toBeNull();
  });
});
