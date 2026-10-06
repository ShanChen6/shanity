import { Test } from '@nestjs/testing';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { MEDIA_STORAGE_DRIVER } from './media-storage.constants.js';
import { LocalMediaStorageAdapter } from './local-media-storage.adapter.js';
import type { MediaStorageDriver } from './media-storage.types.js';
import { StorageModule } from './storage.module.js';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');

describe('StorageModule', () => {
  const originalDriver = process.env.STORAGE_DRIVER;
  const originalRoot = process.env.LESSON_MEDIA_STORAGE_DIR;
  const originalSecret = process.env.MEDIA_SIGNING_SECRET;
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'shanity-media-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.LESSON_MEDIA_STORAGE_DIR = root;
    process.env.MEDIA_SIGNING_SECRET =
      'test-signing-secret-that-is-at-least-32-bytes';
  });

  afterEach(async () => {
    if (originalDriver === undefined) delete process.env.STORAGE_DRIVER;
    else process.env.STORAGE_DRIVER = originalDriver;
    if (originalRoot === undefined) delete process.env.LESSON_MEDIA_STORAGE_DIR;
    else process.env.LESSON_MEDIA_STORAGE_DIR = originalRoot;
    if (originalSecret === undefined) delete process.env.MEDIA_SIGNING_SECRET;
    else process.env.MEDIA_SIGNING_SECRET = originalSecret;
    await rm(root, { recursive: true, force: true });
  });

  it('injects the local adapter when STORAGE_DRIVER=local', async () => {
    const module = await Test.createTestingModule({
      imports: [StorageModule],
    }).compile();
    expect(module.get(MEDIA_STORAGE_DRIVER)).toBeInstanceOf(
      LocalMediaStorageAdapter,
    );
    await module.close();
  });

  it('uploads, streams, signs and idempotently deletes a private file', async () => {
    const storage: MediaStorageDriver = new LocalMediaStorageAdapter({
      root,
      signingSecret: process.env.MEDIA_SIGNING_SECRET!,
    });
    const result = await storage.upload(PDF, 'pending/course/asset.pdf', {
      kind: 'document',
      originalName: 'lesson.pdf',
      contentType: 'application/pdf',
    });
    expect(result).toMatchObject({
      filePath: 'pending/course/asset.pdf',
      size: PDF.length,
      contentType: 'application/pdf',
    });
    expect(result.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(
      await readFile(join(root, 'pending', 'course', 'asset.pdf')),
    ).toEqual(PDF);

    const stream = await storage.getStream(result.filePath);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as Readable)
      chunks.push(Buffer.from(chunk as Uint8Array));
    expect(Buffer.concat(chunks)).toEqual(PDF);
    expect(await storage.getSignedUrl(result.filePath, 3600)).toMatch(
      /^\/lesson-media\/pending\/course\/asset\.pdf\?expires=\d+&signature=[\w-]+$/,
    );

    await storage.delete(result.filePath);
    await storage.delete(result.filePath);
    await expect(storage.getStream(result.filePath)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('rejects an executable renamed to PDF by inspecting magic bytes', async () => {
    const storage = new LocalMediaStorageAdapter({
      root,
      signingSecret: process.env.MEDIA_SIGNING_SECRET!,
    });
    const disguisedExecutable = Buffer.concat([
      Buffer.from('MZ'),
      Buffer.alloc(256),
    ]);
    await expect(
      storage.upload(disguisedExecutable, 'pending/fake.pdf', {
        kind: 'document',
        originalName: 'fake.pdf',
        contentType: 'application/pdf',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('enforces the configurable video size limit using actual bytes', async () => {
    const previous = process.env.MAX_VIDEO_SIZE_MB;
    process.env.MAX_VIDEO_SIZE_MB = '1';
    const storage = new LocalMediaStorageAdapter({
      root,
      signingSecret: process.env.MEDIA_SIGNING_SECRET!,
    });
    const oversized = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from('ftypisom'),
      Buffer.alloc(1024 * 1024),
    ]);
    try {
      await expect(
        storage.upload(oversized, 'pending/large.mp4', {
          kind: 'video',
          originalName: 'large.mp4',
          contentType: 'video/mp4',
        }),
      ).rejects.toMatchObject({ status: 413 });
    } finally {
      if (previous === undefined) delete process.env.MAX_VIDEO_SIZE_MB;
      else process.env.MAX_VIDEO_SIZE_MB = previous;
    }
  });

  it('rejects traversal outside the lesson media root', async () => {
    const storage = new LocalMediaStorageAdapter({
      root,
      signingSecret: process.env.MEDIA_SIGNING_SECRET!,
    });
    await expect(
      storage.upload(PDF, '../avatar.pdf', {
        kind: 'document',
        originalName: 'lesson.pdf',
        contentType: 'application/pdf',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
