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

const PDF = Buffer.from(
  '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n',
);

describe('Document Lesson media API', () => {
  let app: INestApplication;
  let db: DatabaseService['dataSource']['manager'];
  let origin: string;
  let mediaRoot: string;
  const oldStorageDriver = process.env.STORAGE_DRIVER;
  const oldStorageRoot = process.env.LESSON_MEDIA_STORAGE_DIR;

  beforeAll(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), 'shanity-document-e2e-'));
    process.env.STORAGE_DRIVER = 'local';
    process.env.LESSON_MEDIA_STORAGE_DIR = mediaRoot;
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    const testIp = `document-lessons-${randomUUID()}`;
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

  it('enforces private inline and download policies and cleans lifecycle files', async () => {
    const owner = await account('instructor');
    const other = await account('instructor');
    const student = await account('student');
    const course = await request(app.getHttpServer())
      .post('/courses')
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .send({ title: 'Document course', slug: `documents-${randomUUID()}` })
      .expect(201)
      .then(({ body }) => body);
    const chapter = await request(app.getHttpServer())
      .post(`/courses/${course.id}/chapters`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .send({ title: 'Documents' })
      .expect(201)
      .then(({ body }) => body);
    await db.query(
      `UPDATE courses SET status='published', published_at=now() WHERE id=$1`,
      [course.id],
    );
    const uploadPath = `/chapters/${chapter.id}/lessons/document-upload`;

    await request(app.getHttpServer())
      .post(uploadPath)
      .set('Origin', origin)
      .set('Cookie', other.session)
      .field('title', 'Forbidden')
      .attach('file', PDF, {
        filename: 'guide.pdf',
        contentType: 'application/pdf',
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(uploadPath)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .field('title', 'Fake document')
      .attach('file', Buffer.from('MZ executable'), {
        filename: 'fake.pdf',
        contentType: 'application/pdf',
      })
      .expect(400);

    const lesson = await request(app.getHttpServer())
      .post(uploadPath)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .field('title', 'Protected document')
      .attach('file', PDF, {
        filename: 'javascript-guide.pdf',
        contentType: 'application/pdf',
      })
      .expect(201)
      .then(({ body }) => body);
    expect(lesson).toMatchObject({
      type: 'DOCUMENT',
      documentFileName: 'javascript-guide.pdf',
      documentMimeType: 'application/pdf',
      documentFileType: 'PDF',
      documentDownloadAllowed: false,
    });
    expect(Number(lesson.documentFileSize)).toBe(PDF.length);
    expect(
      await readFile(join(mediaRoot, ...lesson.documentAssetId.split('/'))),
    ).toEqual(PDF);

    const viewPath = `/lessons/${lesson.id}/document-view`;
    const downloadPath = `/lessons/${lesson.id}/document-download`;
    await request(app.getHttpServer()).get(viewPath).expect(401);
    await request(app.getHttpServer())
      .get(viewPath)
      .set('Cookie', student.session)
      .expect(403);
    await request(app.getHttpServer())
      .get(downloadPath)
      .set('Cookie', student.session)
      .expect(403);
    await db.query(
      'INSERT INTO enrollments(user_id,course_id) VALUES ($1,$2)',
      [student.id, course.id],
    );

    const inline = await request(app.getHttpServer())
      .get(viewPath)
      .set('Cookie', student.session)
      .buffer(true)
      .expect(200);
    expect(inline.headers['content-disposition']).toMatch(/^inline;/);
    expect(inline.headers['content-security-policy']).toContain(
      "script-src 'none'",
    );
    expect(inline.headers['x-content-type-options']).toBe('nosniff');
    await request(app.getHttpServer())
      .get(downloadPath)
      .set('Cookie', student.session)
      .expect(403)
      .expect(({ body }) => expect(body.message).toBe('DOWNLOAD_NOT_ALLOWED'));

    await request(app.getHttpServer())
      .patch(`/lessons/${lesson.id}/document-settings`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .send({ allowDownload: true })
      .expect(200);
    const download = await request(app.getHttpServer())
      .get(downloadPath)
      .set('Cookie', student.session)
      .buffer(true)
      .expect(200);
    expect(download.headers['content-disposition']).toMatch(/^attachment;/);

    await request(app.getHttpServer())
      .get(`/uploads/lessons/${lesson.documentAssetId}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/lesson-media/${lesson.documentAssetId}`)
      .expect(403);

    const oldKey = lesson.documentAssetId as string;
    const replacement = Buffer.concat([PDF, Buffer.from('% replacement')]);
    const replaced = await request(app.getHttpServer())
      .post(`/lessons/${lesson.id}/document-upload`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .attach('file', replacement, {
        filename: 'replacement.pdf',
        contentType: 'application/pdf',
      })
      .expect(200);
    expect(replaced.body.documentAssetId).not.toBe(oldKey);
    await expect(
      readFile(join(mediaRoot, ...oldKey.split('/'))),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });

    const replacementKey = replaced.body.documentAssetId as string;
    await request(app.getHttpServer())
      .delete(`/lessons/${lesson.id}`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .expect(204);
    await expect(
      readFile(join(mediaRoot, ...replacementKey.split('/'))),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
