import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AuthConfig } from '../../src/auth/auth.config.js';
import { DatabaseService } from '../../src/database/database.module.js';
import { configureApp } from '../../src/setup.js';

export type Account = { id: string; email: string; session: string };
export type CourseFixture = {
  id: string;
  chapterId: string;
  lessons: Array<{ id: string; slug: string }>;
};

const PASSWORD = 'Testing-a-long-password-42';

/** Boots the real AppModule against PGDATABASE (must be an isolated *_test db). */
export async function learningApp(label: string) {
  if (!process.env.PGDATABASE?.endsWith('_test'))
    throw new Error('Run edge-case suites against an isolated *_test database');
  const { AppModule } = await import('../../src/app.module.js');
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app: INestApplication = module.createNestApplication();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.defineProperty(req, 'ip', { value: `${label}-${randomUUID()}` });
    next();
  });
  configureApp(app);
  await app.init();
  const db = app.get(DatabaseService).dataSource.manager;
  const origin = app.get(AuthConfig).origin;
  const http = () => request(app.getHttpServer());
  const cookies = (response: request.Response) =>
    ((response.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((value) => value.split(';')[0])
      .join('; ');

  const send = (
    method: 'post' | 'patch' | 'delete',
    path: string,
    session: string,
    body: object = {},
  ) =>
    http()
      [method](path)
      .set('Origin', origin)
      .set('Cookie', session)
      .send(body);

  async function account(
    role: 'student' | 'instructor' = 'student',
  ): Promise<Account> {
    const email = `${randomUUID()}@example.invalid`;
    const response = await http()
      .post('/auth/register')
      .set('Origin', origin)
      .send({ email, password: PASSWORD, displayName: role })
      .expect(201);
    const [user] = await db.query('SELECT id FROM users WHERE email=$1', [
      email,
    ]);
    if (role === 'instructor')
      await db.query(
        `INSERT INTO user_roles(user_id, role_code) VALUES ($1, 'instructor')`,
        [user.id],
      );
    return { id: user.id as string, email, session: cookies(response) };
  }

  /** A second, independent session for the same user (another device). */
  async function login(email: string) {
    const response = await http()
      .post('/auth/login')
      .set('Origin', origin)
      .send({ email, password: PASSWORD })
      .expect(200);
    return cookies(response);
  }

  async function addLesson(
    owner: Account,
    chapterId: string,
    title: string,
    isRequired = true,
  ) {
    const response = await send(
      'post',
      `/chapters/${chapterId}/lessons`,
      owner.session,
      {
        title,
        type: 'TEXT',
        isRequired,
        content: { textBody: `<p>${title}</p>` },
      },
    ).expect(201);
    return { id: response.body.id as string, slug: response.body.slug };
  }

  /** Published course with `count` required text lessons, student enrolled. */
  async function course(
    owner: Account,
    count: number,
    students: Account[] = [],
  ): Promise<CourseFixture> {
    const created = await send('post', '/courses', owner.session, {
      title: 'Edge cases',
      slug: `edge-${randomUUID()}`,
    }).expect(201);
    const chapter = await send(
      'post',
      `/courses/${created.body.id}/chapters`,
      owner.session,
      { title: 'Core' },
    ).expect(201);
    const lessons = [];
    for (let index = 0; index < count; index++)
      lessons.push(
        await addLesson(owner, chapter.body.id, `Lesson ${index + 1}`),
      );
    await db.query(
      `UPDATE courses SET status='published', published_at=now() WHERE id=$1`,
      [created.body.id],
    );
    for (const student of students)
      await db.query(
        'INSERT INTO enrollments(user_id, course_id) VALUES ($1, $2)',
        [student.id, created.body.id],
      );
    return { id: created.body.id, chapterId: chapter.body.id, lessons };
  }

  const complete = (session: string, lessonId: string) =>
    send('post', `/lessons/${lessonId}/progress/complete`, session, {
      scrollPercentage: 100,
    });

  const progress = (session: string, courseId: string) =>
    http().get(`/courses/${courseId}/progress`).set('Cookie', session);

  return {
    app,
    db,
    http,
    send,
    account,
    login,
    addLesson,
    course,
    complete,
    progress,
  };
}
