import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AuthConfig } from '../src/auth/auth.config.js';
import { DatabaseService } from '../src/database/database.module.js';
import { configureApp } from '../src/setup.js';

describe('Lesson access control matrix', () => {
  let app: INestApplication;
  let db: DatabaseService['dataSource']['manager'];
  let origin: string;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.defineProperty(req, 'ip', {
        value: `lesson-access-${randomUUID()}`,
      });
      next();
    });
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService).dataSource.manager;
    origin = app.get(AuthConfig).origin;
  });

  afterAll(() => app?.close());

  async function account(role: 'student' | 'instructor' | 'admin') {
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
    if (role !== 'student')
      await db.query(
        'INSERT INTO user_roles(user_id,role_code) VALUES ($1,$2)',
        [user.id, role],
      );
    return { id: user.id as string, session };
  }

  async function lessonFor(
    owner: { session: string },
    isPreview: boolean,
  ): Promise<{ courseId: string; lessonId: string }> {
    const course = await request(app.getHttpServer())
      .post('/courses')
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .send({ title: 'Access matrix', slug: `access-${randomUUID()}` })
      .expect(201)
      .then(({ body }) => body);
    const chapter = await request(app.getHttpServer())
      .post(`/courses/${course.id}/chapters`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .send({ title: 'Chapter' })
      .expect(201)
      .then(({ body }) => body);
    const lesson = await request(app.getHttpServer())
      .post(`/chapters/${chapter.id}/lessons`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .send({
        title: 'Lesson',
        type: 'TEXT',
        isPreview,
        content: { textBody: '<p>Body</p>' },
      })
      .expect(201)
      .then(({ body }) => body);
    return { courseId: course.id, lessonId: lesson.id };
  }

  const publish = (courseId: string) =>
    db.query(
      `UPDATE courses SET status='published', published_at=now() WHERE id=$1`,
      [courseId],
    );
  const read = (lessonId: string, session?: string) => {
    const req = request(app.getHttpServer()).get(`/lessons/${lessonId}`);
    return session ? req.set('Cookie', session) : req;
  };

  it('covers every decision branch', async () => {
    const owner = await account('instructor');
    const other = await account('instructor');
    const admin = await account('admin');
    const student = await account('student');
    const enrolled = await account('student');

    const preview = await lessonFor(owner, true);
    const locked = await lessonFor(owner, false);

    // Guest + preview + draft course: preview flag is void.
    await read(preview.lessonId).expect(403);
    // Non-owner instructor on a draft course is treated as a plain user.
    await read(locked.lessonId, other.session).expect(403);
    await read(locked.lessonId, student.session).expect(403);
    // Owner and admin bypass draft status.
    await read(locked.lessonId, owner.session).expect(200);
    await read(locked.lessonId, admin.session).expect(200);

    await publish(preview.courseId);
    await publish(locked.courseId);
    await db.query(
      'INSERT INTO enrollments(user_id,course_id) VALUES ($1,$2)',
      [enrolled.id, locked.courseId],
    );

    // Guest + preview + published.
    await read(preview.lessonId).expect(200);
    // Guest + non-preview + published.
    await read(locked.lessonId).expect(403);
    // Un-enrolled student.
    await read(locked.lessonId, student.session)
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('ENROLLMENT_REQUIRED'));
    // Enrolled student, and owner of a published course.
    await read(locked.lessonId, enrolled.session).expect(200);
    await read(locked.lessonId, owner.session).expect(200);

    // Revoked enrollment loses access.
    await db.query(
      'UPDATE enrollments SET revoked_at=now() WHERE user_id=$1 AND course_id=$2',
      [enrolled.id, locked.courseId],
    );
    await read(locked.lessonId, enrolled.session).expect(403);

    // Archived course: only owner/admin.
    await db.query(`UPDATE courses SET status='archived' WHERE id=$1`, [
      preview.courseId,
    ]);
    await read(preview.lessonId).expect(403);
    await read(preview.lessonId, owner.session).expect(200);

    // Media routes share the same guard.
    await request(app.getHttpServer())
      .get(`/lessons/${locked.lessonId}/video-access`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/lessons/${locked.lessonId}/document-view`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/lessons/${randomUUID()}`)
      .expect(404);
  });
});
