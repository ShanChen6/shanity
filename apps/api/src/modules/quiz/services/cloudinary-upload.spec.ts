import { describe, expect, it } from 'vitest';
import {
  cloudinaryConfig,
  isCloudinaryUrl,
  signCloudinaryParams,
} from './cloudinary-upload.js';

describe('cloudinary upload helpers', () => {
  it('signs the alphabetically sorted params followed by the secret', () => {
    // sha1('folder=f&timestamp=123' + 'abcd'), computed independently.
    expect(signCloudinaryParams({ timestamp: 123, folder: 'f' }, 'abcd')).toBe(
      '29c43c013f53f7d3d2e84d2bcd9839fec452346f',
    );
  });

  it('is unconfigured unless all three variables are set', () => {
    expect(cloudinaryConfig({ CLOUDINARY_CLOUD_NAME: 'c' })).toBeNull();
    expect(
      cloudinaryConfig({
        CLOUDINARY_CLOUD_NAME: 'c',
        CLOUDINARY_API_KEY: 'k',
        CLOUDINARY_API_SECRET: 's',
      }),
    ).toEqual({ cloudName: 'c', apiKey: 'k', apiSecret: 's' });
  });

  it('only accepts delivery URLs of its own account', () => {
    expect(
      isCloudinaryUrl(
        'https://res.cloudinary.com/mine/image/upload/a.png',
        'mine',
      ),
    ).toBe(true);
    expect(
      isCloudinaryUrl(
        'https://res.cloudinary.com/other/image/upload/a.png',
        'mine',
      ),
    ).toBe(false);
    expect(isCloudinaryUrl('https://evil.test/mine/a.png', 'mine')).toBe(false);
  });
});
