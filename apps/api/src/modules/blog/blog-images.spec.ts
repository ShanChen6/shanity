import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  BLOG_IMAGE_MAX_WIDTH,
  MAX_BLOG_IMAGE_BYTES,
  normalizeBlogImage,
} from './blog-images.controller.js';

const png = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: '#3a7' },
  })
    .png()
    .toBuffer();
const file = (buffer: Buffer, mimetype = 'image/png') => ({
  buffer,
  mimetype,
  size: buffer.length,
});

describe('normalizeBlogImage', () => {
  it('shrinks wide images to the article width, keeping the aspect', async () => {
    const image = await normalizeBlogImage(file(await png(3200, 1000)));
    expect(image.width).toBe(BLOG_IMAGE_MAX_WIDTH);
    expect(image.height).toBe(500);
    expect((await sharp(image.data).metadata()).format).toBe('webp');
  });

  it('never enlarges small images', async () => {
    const image = await normalizeBlogImage(file(await png(300, 200)));
    expect([image.width, image.height]).toEqual([300, 200]);
  });

  it('rejects missing, oversized, mislabelled and non-image uploads', async () => {
    await expect(normalizeBlogImage(undefined)).rejects.toMatchObject({
      response: { code: 'BLOG_IMAGE_REQUIRED' },
    });
    const big = Buffer.alloc(MAX_BLOG_IMAGE_BYTES + 1);
    await expect(normalizeBlogImage(file(big))).rejects.toMatchObject({
      response: { code: 'BLOG_IMAGE_TOO_LARGE' },
    });
    await expect(
      normalizeBlogImage(file(Buffer.from('%PDF-1.4'), 'application/pdf')),
    ).rejects.toMatchObject({ response: { code: 'BLOG_IMAGE_TYPE' } });
    await expect(
      normalizeBlogImage(file(await png(10, 10), 'image/jpeg')),
    ).rejects.toMatchObject({ response: { code: 'BLOG_IMAGE_INVALID' } });
  });
});
