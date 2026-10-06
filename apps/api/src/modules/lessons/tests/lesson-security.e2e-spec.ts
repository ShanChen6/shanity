import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { AuthConfig } from '../../../auth/auth.config.js';
import { DatabaseService } from '../../../database/database.module.js';
import { configureApp } from '../../../setup.js';

const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 24]),
  Buffer.from('ftypisom'),
  Buffer.alloc(32),
]);

type Account = { id: string; session: string };

describe('Lesson authorization boundary security audit', () => {
  let app: INestApplication;
  let db: DatabaseService['dataSource']['manager'];
  let origin: string;
  let mediaRoot: string;
  let owner: Account;
  let attacker: Account;
  let student: Account;
  let protectedLessonId: string;
  let draftPreviewLessonId: string;
  let protectedMediaPath: string;
  const oldStorageDriver = process.env.STORAGE_DRIVER;
  const oldStorageRoot = process.env.LESSON_MEDIA_STORAGE_DIR;

  beforeAll(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 'shanity-security-e2e-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.LESSON_MEDIA_STORAGE_DIR = mediaRoot;

    const { AppModule } = await import('../../../app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.defineProperty(req, 'ip', { value: `lesson-security-${randomUUID()}` });
      next();
    });
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService).dataSource.manager;
    origin = app.get(AuthConfig).origin;

    owner = await createAccount('instructor');
    attacker = await createAccount('instructor');
    student = await createAccount('student');

    const published = await createCourse(owner, 'Published security course');
    const publishedChapter = await createChapter(owner, published.id);
    protectedLessonId = await createTextLesson(owner, publishedChapter.id, false);
    await db.query(
      `UPDATE courses SET status='published', published_at=now() WHERE id=$1`,
      [published.id],
    );

    const video = await request(app.getHttpServer())
      .post(`/chapters/${publishedChapter.id}/lessons/video-upload`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .field('title', 'Protected media')
      .attach('file', MP4, { filename: 'protected.mp4', contentType: 'video/mp4' })
      .expect(201);
    protectedMediaPath = `/lesson-media/${video.body.videoAssetId}`;

    const draft = await createCourse(owner, 'Draft security course');
    const draftChapter = await createChapter(owner, draft.id);
    draftPreviewLessonId = await createTextLesson(owner, draftChapter.id, true);
  });

  afterAll(async () => {
    await app?.close();
    await rm(mediaRoot, { recursive: true, force: true });
    if (oldStorageDriver === undefined) delete process.env.STORAGE_DRIVER;
    else process.env.STORAGE_DRIVER = oldStorageDriver;
    if (oldStorageRoot === undefined) delete process.env.LESSON_MEDIA_STORAGE_DIR;
    else process.env.LESSON_MEDIA_STORAGE_DIR = oldStorageRoot;
  });

  async function createAccount(role: 'student' | 'instructor'): Promise<Account> {
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
    const session = ((response.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    const [user] = await db.query('SELECT id FROM users WHERE email=$1', [email]);
    if (role === 'instructor')
      await db.query(
        `INSERT INTO user_roles(user_id, role_code) VALUES ($1, 'instructor')`,
        [user.id],
      );
    return { id: user.id as string, session };
  }

  async function createCourse(account: Account, title: string) {
    return request(app.getHttpServer())
      .post('/courses')
      .set('Origin', origin)
      .set('Cookie', account.session)
      .send({ title, slug: `security-${randomUUID()}` })
      .expect(201)
      .then(({ body }) => body as { id: string });
  }

  async function createChapter(account: Account, courseId: string) {
    return request(app.getHttpServer())
      .post(`/courses/${courseId}/chapters`)
      .set('Origin', origin)
      .set('Cookie', account.session)
      .send({ title: 'Security chapter' })
      .expect(201)
      .then(({ body }) => body as { id: string });
  }

  async function createTextLesson(
    account: Account,
    chapterId: string,
    isPreview: boolean,
  ) {
    return request(app.getHttpServer())
      .post(`/chapters/${chapterId}/lessons`)
      .set('Origin', origin)
      .set('Cookie', account.session)
      .send({
        title: `Security lesson ${randomUUID()}`,
        type: 'TEXT',
        isPreview,
        content: { textBody: '<p>Protected content</p>' },
      })
      .expect(201)
      .then(({ body }) => body.id as string);
  }

  it('TC01 rejects a guest opening a protected lesson by direct URL', async () => {
    await request(app.getHttpServer())
      .get(`/lessons/${protectedLessonId}`)
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('ENROLLMENT_REQUIRED'));
  });

  it('TC02 rejects an authenticated but unenrolled student', async () => {
    await request(app.getHttpServer())
      .get(`/lessons/${protectedLessonId}`)
      .set('Cookie', student.session)
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('ENROLLMENT_REQUIRED'));
  });

  it('TC03 never exposes a preview lesson from a draft course', async () => {
    await request(app.getHttpServer())
      .get(`/lessons/${draftPreviewLessonId}`)
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('LESSON_NOT_AVAILABLE'));
  });

  it('TC04 blocks a non-owner instructor mutation', async () => {
    await request(app.getHttpServer())
      .patch(`/lessons/${protectedLessonId}`)
      .set('Origin', origin)
      .set('Cookie', attacker.session)
      .send({ title: 'Stolen lesson' })
      .expect(403);

    const [lesson] = await db.query('SELECT title FROM lessons WHERE id=$1', [
      protectedLessonId,
    ]);
    expect(lesson.title).not.toBe('Stolen lesson');
  });

  it('TC05 blocks a guessed private media path without a signed request', async () => {
    await request(app.getHttpServer()).get(protectedMediaPath).expect(403);
  });
});
