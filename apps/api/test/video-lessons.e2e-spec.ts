import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AuthConfig } from '../src/auth/auth.config.js';
import { DatabaseService } from '../src/database/database.module.js';
import { configureApp } from '../src/setup.js';

const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypisom'),
  Buffer.alloc(32),
]);

describe('Video Lesson media API', () => {
  let app: INestApplication;
  let db: DatabaseService['dataSource']['manager'];
  let origin: string;
  let mediaRoot: string;
  const oldStorageDriver = process.env.STORAGE_DRIVER;
  const oldStorageRoot = process.env.LESSON_MEDIA_STORAGE_DIR;

  beforeAll(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 'shanity-video-e2e-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.LESSON_MEDIA_STORAGE_DIR = mediaRoot;
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    const testIp = `video-lessons-${randomUUID()}`;
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.defineProperty(req, 'ip', { value: testIp });
      next();
    });
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService).dataSource.manager;
    origin = app.get(AuthConfig).origin;
  });

  afterAll(async () => {
    await app?.close();
    await rm(mediaRoot, { recursive: true, force: true });
    if (oldStorageDriver === undefined) delete process.env.STORAGE_DRIVER;
    else process.env.STORAGE_DRIVER = oldStorageDriver;
    if (oldStorageRoot === undefined)
      delete process.env.LESSON_MEDIA_STORAGE_DIR;
    else process.env.LESSON_MEDIA_STORAGE_DIR = oldStorageRoot;
  });

  async function account(role: 'student' | 'instructor') {
    const email = `${randomUUID()}@example.invalid`;
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Origin', origin)
      .send({
        email,
        password: 'Testing-a-long-password-42',
        displayName: role,
      })
      .expect(201);
    const session = (
      (response.headers['set-cookie'] as unknown as string[]) ?? []
    )
      .map((value) => value.split(';')[0])
      .join('; ');
    const [user] = await db.query('SELECT id FROM users WHERE email=$1', [
      email,
    ]);
    if (role === 'instructor')
      await db.query(
        'INSERT INTO user_roles(user_id,role_code) VALUES ($1,$2)',
        [user.id, role],
      );
    return { id: user.id as string, session };
  }

  it('stores private video metadata, authorizes playback and cleans replacements', async () => {
    const owner = await account('instructor');
    const other = await account('instructor');
    const student = await account('student');
    const course = await request(app.getHttpServer())
      .post('/courses')
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .send({ title: 'Video course', slug: `video-${randomUUID()}` })
      .expect(201)
      .then(({ body }) => body);
    const chapter = await request(app.getHttpServer())
      .post(`/courses/${course.id}/chapters`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .send({ title: 'Videos' })
      .expect(201)
      .then(({ body }) => body);
    await db.query(
      `UPDATE courses SET status='published', published_at=now() WHERE id=$1`,
      [course.id],
    );
    const uploadPath = `/chapters/${chapter.id}/lessons/video-upload`;

    await request(app.getHttpServer())
      .post(uploadPath)
      .set('Origin', origin)
      .set('Cookie', other.session)
      .field('title', 'Forbidden')
      .attach('file', MP4, { filename: 'video.mp4', contentType: 'video/mp4' })
      .expect(403);
    await request(app.getHttpServer())
      .post(uploadPath)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .field('title', 'Disguised executable')
      .attach('file', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(128)]), {
        filename: 'fake.mp4',
        contentType: 'video/mp4',
      })
      .expect(400);

    const lesson = await request(app.getHttpServer())
      .post(uploadPath)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .field('title', 'Protected video')
      .field('durationSeconds', '90')
      .attach('file', MP4, { filename: 'video.mp4', contentType: 'video/mp4' })
      .expect(201)
      .then(({ body }) => body);
    expect(lesson).toMatchObject({
      type: 'VIDEO',
      videoProvider: 'LOCAL',
      videoMimeType: 'video/mp4',
      videoDurationSeconds: 90,
      videoStatus: 'READY',
      isPublished: true,
    });
    expect(Number(lesson.videoFileSize)).toBe(MP4.length);
    expect(
      await readFile(join(mediaRoot, ...lesson.videoAssetId.split('/'))),
    ).toEqual(MP4);
    const [metadata] = await db.query(
      'SELECT video_asset_id,video_file_size,video_mime_type,video_provider FROM lessons WHERE id=$1',
      [lesson.id],
    );
    expect(metadata).toMatchObject({
      video_asset_id: lesson.videoAssetId,
      video_mime_type: 'video/mp4',
      video_provider: 'LOCAL',
    });
    expect(Number(metadata.video_file_size)).toBe(MP4.length);

    const accessPath = `/lessons/${lesson.id}/video-access`;
    await request(app.getHttpServer()).get(accessPath).expect(403);
    await request(app.getHttpServer())
      .get(accessPath)
      .set('Cookie', student.session)
      .expect(403);
    await db.query(
      'INSERT INTO enrollments(user_id,course_id) VALUES ($1,$2)',
      [student.id, course.id],
    );
    const enrolledAccess = await request(app.getHttpServer())
      .get(accessPath)
      .set('Cookie', student.session)
      .expect(200);
    expect(enrolledAccess.body.url).toMatch(/^\/lesson-media\//);

    const oldKey = lesson.videoAssetId as string;
    const replacement = Buffer.concat([MP4, Buffer.from('replacement')]);
    const replaced = await request(app.getHttpServer())
      .post(`/lessons/${lesson.id}/video-upload`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .field('durationSeconds', '120')
      .attach('file', replacement, {
        filename: 'replacement.mp4',
        contentType: 'video/mp4',
      })
      .expect(200);
    expect(replaced.body.videoAssetId).not.toBe(oldKey);
    await expect(
      readFile(join(mediaRoot, ...oldKey.split('/'))),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    const preview = await request(app.getHttpServer())
      .post(uploadPath)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .field('title', 'Preview video')
      .field('isPreview', 'true')
      .attach('file', MP4, {
        filename: 'preview.webm',
        contentType: 'video/webm',
      })
      .expect(400);
    expect(preview.body.statusCode).toBe(400);
    const validPreview = await request(app.getHttpServer())
      .post(uploadPath)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .field('title', 'Preview video')
      .field('isPreview', 'true')
      .attach('file', MP4, {
        filename: 'preview.mp4',
        contentType: 'video/mp4',
      })
      .expect(201)
      .then(({ body }) => body);
    const previewAccess = await request(app.getHttpServer())
      .get(`/lessons/${validPreview.id}/video-access`)
      .expect(200);
    const ranged = await request(app.getHttpServer())
      .get(previewAccess.body.url)
      .set('Range', 'bytes=0-7')
      .expect(206);
    expect(ranged.headers['content-range']).toBe(`bytes 0-7/${MP4.length}`);
    expect(Number(ranged.headers['content-length'])).toBe(8);

    const replacementKey = replaced.body.videoAssetId as string;
    await request(app.getHttpServer())
      .delete(`/lessons/${lesson.id}`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .expect(204);
    await expect(
      readFile(join(mediaRoot, ...replacementKey.split('/'))),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    await request(app.getHttpServer())
      .delete(`/chapters/${chapter.id}`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .expect(204);
    await expect(
      readFile(join(mediaRoot, ...validPreview.videoAssetId.split('/'))),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
