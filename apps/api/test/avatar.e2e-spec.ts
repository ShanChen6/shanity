import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/setup.js';
import { DatabaseService } from '../src/database/database.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { AuthConfig } from '../src/auth/auth.config.js';
import {
  AvatarStorage,
  LocalAvatarStorage,
} from '../src/avatar/avatar-storage.js';
import { MAX_AVATAR_BYTES } from '../src/avatar/avatar.service.js';

if (!process.env.PGDATABASE?.endsWith('_test'))
  throw new Error('Use an isolated test database');
describe('Self avatar management', () => {
  let app: INestApplication;
  let db: DatabaseService['client'];
  let storage: AvatarStorage;
  let root: string;
  let origin: string;
  let png: Buffer;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'shanity-avatar-'));
    const previous = process.env.AVATAR_STORAGE_DIR;
    process.env.AVATAR_STORAGE_DIR = root;
    storage = new LocalAvatarStorage();
    if (previous === undefined) delete process.env.AVATAR_STORAGE_DIR;
    else process.env.AVATAR_STORAGE_DIR = previous;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AvatarStorage)
      .useValue(storage)
      .compile();
    app = module.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.defineProperty(req, 'ip', { value: randomUUID() });
      next();
    });
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService).client;
    origin = app.get(AuthConfig).origin;
    png = await sharp({
      create: { width: 800, height: 600, channels: 3, background: '#165dff' },
    })
      .png()
      .toBuffer();
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
    await rm(root, { recursive: true, force: true });
  });
  async function user() {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Origin', origin)
      .send({
        email: `${randomUUID()}@example.invalid`,
        password: 'Avatar-test-password-42',
        displayName: 'Avatar Student',
      })
      .expect(201);
    const cookies = (res.headers['set-cookie'] as unknown as string[]).map(
      (value) => value.split(';')[0],
    );
    const me = await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', cookies)
      .expect(200);
    expect(me.body.avatarUrl).toBeNull();
    return { cookies, id: me.body.id as string };
  }
  function upload(
    cookies: string[],
    data = png,
    type = 'image/png',
    filename = 'photo.png',
  ) {
    return request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Origin', origin)
      .set('Cookie', cookies)
      .attach('file', data, { filename, contentType: type });
  }
  function remove(cookies: string[]) {
    return request(app.getHttpServer())
      .delete('/users/me/avatar')
      .set('Origin', origin)
      .set('Cookie', cookies);
  }

  it('accepts real JPEG/PNG/WebP, generates keys, normalizes, replaces and removes idempotently', async () => {
    const actor = await user();
    let oldUrl: string | null = null;
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const bytes = await sharp(png).toFormat(format).toBuffer();
      const res = await upload(
        actor.cookies,
        bytes,
        `image/${format}`,
        '../../unsafe.exe',
      ).expect(200);
      expect(res.body.id).toBe(actor.id);
      expect(res.body.avatarUrl).toMatch(/^\/avatars\/[0-9a-f-]{36}\.webp$/);
      expect(res.body.avatarUrl).not.toBe(oldUrl);
      const image = await request(app.getHttpServer())
        .get(res.body.avatarUrl)
        .expect(200);
      expect(image.headers['content-type']).toContain('image/webp');
      expect(image.headers['x-content-type-options']).toBe('nosniff');
      const meta = await sharp(image.body).metadata();
      expect(meta.width).toBe(512);
      expect(meta.height).toBe(384);
      expect(meta.exif).toBeUndefined();
      expect(
        (await db('users').where({ id: actor.id }).first('avatar_key'))
          .avatar_key,
      ).toBe(res.body.avatarUrl.split('/').pop());
      if (oldUrl) await request(app.getHttpServer()).get(oldUrl).expect(404);
      oldUrl = res.body.avatarUrl;
    }
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', actor.cookies)
      .expect(200)
      .expect((res) => expect(res.body.avatarUrl).toBe(oldUrl));
    const removed = await remove(actor.cookies).expect(200);
    expect(removed.body.avatarUrl).toBeNull();
    await request(app.getHttpServer()).get(oldUrl!).expect(404);
    await remove(actor.cookies)
      .expect(200)
      .expect((res) => expect(res.body.avatarUrl).toBeNull());
  });

  it('does not upscale small images', async () => {
    const actor = await user();
    const small = await sharp(png).resize(32, 24).png().toBuffer();
    const res = await upload(actor.cookies, small).expect(200);
    const image = await request(app.getHttpServer())
      .get(res.body.avatarUrl)
      .expect(200);
    expect((await sharp(image.body).metadata()).width).toBe(32);
  });

  it('rejects untrusted types, mismatches, malformed files, oversized and excessive pixels', async () => {
    const actor = await user();
    await upload(actor.cookies, Buffer.from('<svg/>'), 'image/svg+xml').expect(
      415,
    );
    await upload(actor.cookies, Buffer.from('not an image')).expect(400);
    await upload(actor.cookies, png, 'image/jpeg').expect(400);
    await upload(actor.cookies, Buffer.alloc(MAX_AVATAR_BYTES + 1)).expect(413);
    const huge = await sharp({
      create: { width: 4100, height: 4100, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
    await upload(actor.cookies, huge).expect(400);
    await upload(actor.cookies, png.subarray(0, 80)).expect(400);
    await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Origin', origin)
      .set('Cookie', actor.cookies)
      .send({})
      .expect(400);
    expect(
      (await db('users').where({ id: actor.id }).first('avatar_key'))
        .avatar_key,
    ).toBeNull();
  });

  it('authenticates before upload, rejects CSRF, foreign IDs, extra files/fields and traversal', async () => {
    const actor = await user(),
      other = await user();
    await upload([], png).expect(401);
    await remove([]).expect(401);
    await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Origin', 'https://evil.invalid')
      .set('Cookie', actor.cookies)
      .attach('file', png, 'a.png')
      .expect(403);
    for (const field of ['userId', 'id', 'role', 'avatar_key']) {
      await request(app.getHttpServer())
        .post('/users/me/avatar')
        .set('Origin', origin)
        .set('Cookie', actor.cookies)
        .field(field, other.id)
        .attach('file', png, 'a.png')
        .expect(400);
    }
    await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Origin', origin)
      .set('Cookie', actor.cookies)
      .attach('other', png, 'a.png')
      .expect(400);
    await request(app.getHttpServer())
      .post('/users/me/avatar')
      .set('Origin', origin)
      .set('Cookie', actor.cookies)
      .attach('file', png, 'a.png')
      .attach('file', png, 'b.png')
      .expect(400);
    await request(app.getHttpServer())
      .post(`/users/${other.id}/avatar`)
      .set('Origin', origin)
      .set('Cookie', actor.cookies)
      .attach('file', png, 'a.png')
      .expect(404);
    await remove(actor.cookies).send({ userId: other.id }).expect(400);
    await request(app.getHttpServer())
      .get('/avatars/%2e%2e%2f.env')
      .expect(404);
    await expect(storage.delete('../outside.webp')).rejects.toThrow();
    expect(
      (await db('users').where({ id: other.id }).first('avatar_key'))
        .avatar_key,
    ).toBeNull();
  });

  it('keeps the old reference on storage failure and cleans a new object on database failure', async () => {
    const actor = await user();
    const original = await upload(actor.cookies).expect(200);
    const files = (await readdir(root)).sort();
    vi.spyOn(storage, 'put').mockRejectedValueOnce(
      new Error('private filesystem path'),
    );
    const failed = await upload(actor.cookies).expect(500);
    expect(JSON.stringify(failed.body)).not.toContain('private');
    // Failing a query inside the transaction must roll back its reference update.
    vi.spyOn(app.get(AuthService), 'profile').mockRejectedValueOnce(
      new Error('database failure'),
    );
    await upload(actor.cookies).expect(500);
    expect((await readdir(root)).sort()).toEqual(files);
    const me = await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', actor.cookies)
      .expect(200);
    expect(me.body.avatarUrl).toBe(original.body.avatarUrl);
  });

  it('retains committed replacement/removal if old-object cleanup fails', async () => {
    const actor = await user();
    const first = await upload(actor.cookies).expect(200);
    vi.spyOn(storage, 'delete').mockRejectedValueOnce(
      new Error('cleanup failed'),
    );
    const next = await upload(actor.cookies).expect(200);
    expect(next.body.avatarUrl).not.toBe(first.body.avatarUrl);
    await request(app.getHttpServer()).get(next.body.avatarUrl).expect(200);
    vi.spyOn(storage, 'delete').mockRejectedValueOnce(
      new Error('cleanup failed'),
    );
    await remove(actor.cookies)
      .expect(200)
      .expect((res) => expect(res.body.avatarUrl).toBeNull());
  });

  it('serializes concurrent replacement and deletion without broken references', async () => {
    const actor = await user();
    const before = new Set(await readdir(root));
    await Promise.all([
      upload(actor.cookies).expect(200),
      upload(actor.cookies).expect(200),
      remove(actor.cookies).expect(200),
    ]);
    const me = await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', actor.cookies)
      .expect(200);
    const added = (await readdir(root)).filter((key) => !before.has(key));
    expect(added).toEqual(
      me.body.avatarUrl ? [me.body.avatarUrl.split('/').pop()] : [],
    );
    if (me.body.avatarUrl)
      await request(app.getHttpServer()).get(me.body.avatarUrl).expect(200);
  });
});
