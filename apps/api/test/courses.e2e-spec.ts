import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthConfig } from '../src/auth/auth.config.js';
import { DatabaseService } from '../src/database/database.module.js';
import { configureApp } from '../src/setup.js';

describe('Courses with PostgreSQL', () => {
  let app: INestApplication;
  let db: DatabaseService['dataSource']['manager'];
  let origin: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    const testIp = `courses-${randomUUID()}`;
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
  });

  async function account(role: 'student' | 'instructor' | 'admin') {
    const email = `${randomUUID()}@example.invalid`;
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Origin', origin)
      .send({ email, password: 'Testing-a-long-password-42', displayName: role })
      .expect(201);
    const session = ((response.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
    const [user] = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (role !== 'student')
      await db.query(
        'INSERT INTO user_roles(user_id,role_code) VALUES ($1,$2)',
        [user.id, role],
      );
    return { id: user.id as string, session };
  }

  it('creates draft courses and scopes instructor reads by owner while admins see all', async () => {
    const instructor = await account('instructor');
    const otherInstructor = await account('instructor');
    const admin = await account('admin');
    const student = await account('student');
    const create = (session: string, slug: string, extra: object = {}) =>
      request(app.getHttpServer())
        .post('/courses')
        .set('Origin', origin)
        .set('Cookie', session)
        .send({ title: `Course ${slug}`, slug, ...extra });

    await request(app.getHttpServer()).get('/courses').expect(401);
    await request(app.getHttpServer())
      .get('/courses')
      .set('Cookie', student.session)
      .expect(403);
    await create(instructor.session, 'forged', { status: 'published' }).expect(400);

    const owned = await create(instructor.session, 'owned-course', {
      description: 'Owned by instructor',
    }).expect(201);
    const other = await create(otherInstructor.session, 'other-course').expect(201);
    const adminCreated = await create(admin.session, 'admin-course').expect(201);

    expect(owned.body).toMatchObject({
      title: 'Course owned-course',
      slug: 'owned-course',
      description: 'Owned by instructor',
      status: 'draft',
      ownerId: instructor.id,
    });
    expect(other.body.ownerId).toBe(otherInstructor.id);
    expect(adminCreated.body.ownerId).toBe(admin.id);
    expect(
      await db.query('SELECT id FROM courses WHERE id=$1 AND status=$2', [
        owned.body.id,
        'draft',
      ]),
    ).toHaveLength(1);

    const instructorList = await request(app.getHttpServer())
      .get('/courses')
      .set('Cookie', instructor.session)
      .expect(200);
    expect(instructorList.body.map((course: { id: string }) => course.id)).toEqual([
      owned.body.id,
    ]);
    await request(app.getHttpServer())
      .get(`/courses/${owned.body.id}`)
      .set('Cookie', instructor.session)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/courses/${other.body.id}`)
      .set('Cookie', instructor.session)
      .expect(404);

    const adminList = await request(app.getHttpServer())
      .get('/courses')
      .set('Cookie', admin.session)
      .expect(200);
    expect(adminList.body).toHaveLength(3);
    await request(app.getHttpServer())
      .get(`/courses/${other.body.id}`)
      .set('Cookie', admin.session)
      .expect(200);
    await create(instructor.session, 'owned-course').expect(409);
  });
});