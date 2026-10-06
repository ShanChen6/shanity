import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AuthConfig } from '../src/auth/auth.config.js';
import { DatabaseService } from '../src/database/database.module.js';
import { configureApp } from '../src/setup.js';

describe('Sequential lesson locking', () => {
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
        value: `sequential-${randomUUID()}`,
      });
      next();
    });
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService).dataSource.manager;
    origin = app.get(AuthConfig).origin;
  });

  afterAll(() => app?.close());

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
    if (role !== 'student')
      await db.query(
        'INSERT INTO user_roles(user_id,role_code) VALUES ($1,$2)',
        [user.id, role],
      );
    return { id: user.id as string, session };
  }

  const post = (path: string, session: string, body: object) =>
    request(app.getHttpServer())
      .post(path)
      .set('Origin', origin)
      .set('Cookie', session)
      .send(body);

  // Chapter 1: R1 (required), O2 (optional), R3 (required).
  // Chapter 2: R4 (required). Positions follow creation order.
  async function sequentialCourse(owner: { session: string }) {
    const course = await post('/courses', owner.session, {
      title: 'Sequential course',
      slug: `sequential-${randomUUID()}`,
    })
      .expect(201)
      .then(({ body }) => body as { id: string; slug: string });
    const chapter = async (title: string) =>
      post(`/courses/${course.id}/chapters`, owner.session, { title })
        .expect(201)
        .then(({ body }) => body as { id: string });
    const lesson = (chapterId: string, title: string, isRequired: boolean) =>
      post(`/chapters/${chapterId}/lessons`, owner.session, {
        title,
        type: 'TEXT',
        isRequired,
        content: { textBody: `<p>${title}</p>` },
      })
        .expect(201)
        .then(({ body }) => body as { id: string; slug: string });
    const first = await chapter('First');
    const second = await chapter('Second');
    const lessons = {
      r1: await lesson(first.id, 'Required one', true),
      o2: await lesson(first.id, 'Optional two', false),
      r3: await lesson(first.id, 'Required three', true),
      r4: await lesson(second.id, 'Required four', true),
    };
    await request(app.getHttpServer())
      .patch(`/courses/${course.id}`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .send({ isSequential: true })
      .expect(200);
    await db.query(
      `UPDATE courses SET status='published', published_at=now() WHERE id=$1`,
      [course.id],
    );
    return { course, lessons };
  }

  const read = (lessonId: string, session: string) =>
    request(app.getHttpServer())
      .get(`/lessons/${lessonId}`)
      .set('Cookie', session);
  const expectLockedBehind = (
    response: request.Response,
    required: { id: string; slug: string },
  ) => {
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: 'PREREQUISITE_LESSON_NOT_COMPLETED',
      requiredLesson: { id: required.id, slug: required.slug },
    });
    expect(typeof response.body.requiredLesson.title).toBe('string');
  };

  it('locks later lessons until earlier required lessons are completed', async () => {
    const owner = await account('instructor');
    const student = await account('student');
    const { course, lessons } = await sequentialCourse(owner);
    await db.query(
      'INSERT INTO enrollments(user_id,course_id) VALUES ($1,$2)',
      [student.id, course.id],
    );

    const syllabus = await request(app.getHttpServer())
      .get(`/public/courses/${course.slug}/syllabus`)
      .expect(200);
    expect(syllabus.body.course.isSequential).toBe(true);

    // Nothing completed: only the first lesson is open, every later lesson
    // (optional ones included) points back to it.
    await read(lessons.r1.id, student.session).expect(200);
    for (const lesson of [lessons.o2, lessons.r3, lessons.r4])
      expectLockedBehind(await read(lesson.id, student.session), lessons.r1);

    // Media and progress routes share the gate.
    expectLockedBehind(
      await request(app.getHttpServer())
        .get(`/lessons/${lessons.r3.id}/document-view`)
        .set('Cookie', student.session),
      lessons.r1,
    );
    expectLockedBehind(
      await post(
        `/lessons/${lessons.r3.id}/progress/complete`,
        student.session,
        {
          scrollPercentage: 100,
        },
      ),
      lessons.r1,
    );

    // Completing R1 unlocks the optional lesson and, since it is optional,
    // the next required one too.
    await post(`/lessons/${lessons.r1.id}/progress/complete`, student.session, {
      scrollPercentage: 100,
    }).expect(200);
    await read(lessons.o2.id, student.session).expect(200);
    await read(lessons.r3.id, student.session).expect(200);
    expectLockedBehind(await read(lessons.r4.id, student.session), lessons.r3);

    // Crossing the chapter boundary.
    await post(`/lessons/${lessons.r3.id}/progress/complete`, student.session, {
      scrollPercentage: 100,
    }).expect(200);
    await read(lessons.r4.id, student.session).expect(200);

    // The owner is never locked out.
    await read(lessons.r4.id, owner.session).expect(200);
  });

  it('leaves non-sequential courses fully open', async () => {
    const owner = await account('instructor');
    const student = await account('student');
    const { course, lessons } = await sequentialCourse(owner);
    await db.query(`UPDATE courses SET is_sequential=false WHERE id=$1`, [
      course.id,
    ]);
    await db.query(
      'INSERT INTO enrollments(user_id,course_id) VALUES ($1,$2)',
      [student.id, course.id],
    );
    await read(lessons.r4.id, student.session).expect(200);
  });
});
