import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AuthConfig } from '../src/auth/auth.config.js';
import { DatabaseService } from '../src/database/database.module.js';
import { configureApp } from '../src/setup.js';

describe('Preview lesson policy', () => {
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
        value: `preview-lessons-${randomUUID()}`,
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
    if (role === 'instructor')
      await db.query(
        'INSERT INTO user_roles(user_id,role_code) VALUES ($1,$2)',
        [user.id, role],
      );
    return { id: user.id as string, session };
  }

  it('enforces published-course preview, enrollment and ownership rules', async () => {
    const owner = await account('instructor');
    const other = await account('instructor');
    const student = await account('student');
    const slug = `preview-${randomUUID()}`;
    const course = await request(app.getHttpServer())
      .post('/courses')
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .send({ title: 'Preview policy course', slug })
      .expect(201)
      .then(({ body }) => body);
    const chapter = await request(app.getHttpServer())
      .post(`/courses/${course.id}/chapters`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .send({ title: 'Introduction' })
      .expect(201)
      .then(({ body }) => body);
    const lesson = await request(app.getHttpServer())
      .post(`/chapters/${chapter.id}/lessons`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .send({
        title: 'Sample lesson',
        type: 'TEXT',
        isPreview: true,
        content: { textBody: '<p>Public sample</p>' },
      })
      .expect(201)
      .then(({ body }) => body);

    await request(app.getHttpServer()).get(`/lessons/${lesson.id}`).expect(403);
    await request(app.getHttpServer())
      .get(`/lessons/${lesson.id}`)
      .set('Cookie', owner.session)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/lessons/${lesson.id}`)
      .set('Origin', origin)
      .set('Cookie', other.session)
      .send({ isPreview: false })
      .expect(403);

    await db.query(
      `UPDATE courses SET status='published', published_at=now() WHERE id=$1`,
      [course.id],
    );
    const preview = await request(app.getHttpServer())
      .get(`/lessons/${lesson.id}`)
      .expect(200);
    expect(preview.body).toMatchObject({
      id: lesson.id,
      isPreview: true,
      content: '<p>Public sample</p>',
    });

    const syllabus = await request(app.getHttpServer())
      .get(`/public/courses/${slug}/syllabus`)
      .expect(200);
    expect(syllabus.body.curriculum[0].lessons[0]).toMatchObject({
      id: lesson.id,
      isPreview: true,
    });

    await request(app.getHttpServer())
      .patch(`/lessons/${lesson.id}`)
      .set('Origin', origin)
      .set('Cookie', owner.session)
      .send({ isPreview: false })
      .expect(200)
      .expect(({ body }) => expect(body.isPreview).toBe(false));
    await request(app.getHttpServer()).get(`/lessons/${lesson.id}`).expect(401);

    await db.query(
      'INSERT INTO enrollments(user_id,course_id) VALUES ($1,$2)',
      [student.id, course.id],
    );
    await request(app.getHttpServer())
      .get(`/lessons/${lesson.id}`)
      .set('Cookie', student.session)
      .expect(200);
  });
});
