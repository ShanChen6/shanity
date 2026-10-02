import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthConfig } from '../src/auth/auth.config.js';
import { DatabaseService } from '../src/database/database.module.js';
import { configureApp } from '../src/setup.js';

describe('Chapters with PostgreSQL', () => {
  let app: INestApplication;
  let db: DatabaseService['dataSource']['manager'];
  let origin: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    const testIp = `chapters-${randomUUID()}`;
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
    const [user] = await db.query('SELECT id FROM users WHERE email=$1', [email]);
    if (role !== 'student')
      await db.query('INSERT INTO user_roles(user_id,role_code) VALUES ($1,$2)', [
        user.id,
        role,
      ]);
    return { id: user.id as string, session };
  }

  it('authorizes chapter CRUD by parent owner and sorts positions', async () => {
    const owner = await account('instructor');
    const other = await account('instructor');
    const admin = await account('admin');
    const student = await account('student');
    const createCourse = (session: string, slug: string) =>
      request(app.getHttpServer())
        .post('/courses')
        .set('Origin', origin)
        .set('Cookie', session)
        .send({ title: slug, slug });
    const course = await createCourse(owner.session, 'chapter-owner-course')
      .expect(201)
      .then((result) => result.body);
    const otherCourse = await createCourse(other.session, 'chapter-other-course')
      .expect(201)
      .then((result) => result.body);
    const foreignChapter = await request(app.getHttpServer())
      .post(`/courses/${otherCourse.id}/chapters`)
      .set('Origin', origin)
      .set('Cookie', other.session)
      .send({ title: 'Foreign chapter' })
      .expect(201);
    const chapterPath = `/courses/${course.id}/chapters`;
    const create = (session: string, body: object) =>
      request(app.getHttpServer())
        .post(chapterPath)
        .set('Origin', origin)
        .set('Cookie', session)
        .send(body);
    const update = (session: string, id: string, body: object) =>
      request(app.getHttpServer())
        .patch(`/chapters/${id}`)
        .set('Origin', origin)
        .set('Cookie', session)
        .send(body);
    const remove = (session: string, id: string) =>
      request(app.getHttpServer())
        .delete(`/chapters/${id}`)
        .set('Origin', origin)
        .set('Cookie', session);
    const reorder = (session: string, chapterOrders: object[]) =>
      request(app.getHttpServer())
        .patch(`${chapterPath}/reorder`)
        .set('Origin', origin)
        .set('Cookie', session)
        .send({ chapterOrders });

    await request(app.getHttpServer()).get(chapterPath).expect(401);
    await create('', { title: 'Guest' }).expect(401);
    await create(student.session, { title: 'Student' }).expect(403);
    await request(app.getHttpServer())
      .post(`/courses/${course.id}/chapters`)
      .set('Origin', origin)
      .set('Cookie', other.session)
      .send({ title: 'Non-owner create' })
      .expect(403);
    await request(app.getHttpServer())
      .get(chapterPath)
      .set('Cookie', student.session)
      .expect(403);

    const first = await create(owner.session, { title: 'First' }).expect(201);
    expect(first.body).toMatchObject({
      courseId: course.id,
      title: 'First',
      description: null,
      position: 0,
    });
    const explicit = await create(owner.session, {
      title: 'Explicit position',
      description: 'Details',
      position: 4,
    }).expect(201);
    const automatic = await create(owner.session, { title: 'After explicit' })
      .expect(201);
    expect(automatic.body.position).toBe(5);
    const adminCreated = await create(admin.session, { title: 'Admin chapter' })
      .expect(201);
    expect(adminCreated.body.position).toBe(6);
    await create(owner.session, {
      title: 'Mass assignment',
      courseId: otherCourse.id,
      id: randomUUID(),
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
    }).expect(400);

    const list = (session: string) =>
      request(app.getHttpServer())
        .get(chapterPath)
        .set('Cookie', session);
    const ordered = await list(owner.session).expect(200);
    expect(ordered.body.map((chapter: { position: number }) => chapter.position))
      .toEqual([0, 4, 5, 6]);
    await list(other.session).expect(403);
    const adminList = await list(admin.session).expect(200);
    expect(adminList.body.map((chapter: { id: string }) => chapter.id)).toEqual([
      first.body.id,
      explicit.body.id,
      automatic.body.id,
      adminCreated.body.id,
    ]);

    const ownerOrder = [
      { id: first.body.id, position: 3 },
      { id: explicit.body.id, position: 1 },
      { id: automatic.body.id, position: 0 },
      { id: adminCreated.body.id, position: 2 },
    ];
    const positionSnapshot = () =>
      db.query(
        'SELECT id,position FROM chapters WHERE course_id=$1 ORDER BY id',
        [course.id],
      );
    const beforeInvalidReorders = await positionSnapshot();
    const validReorder = await reorder(owner.session, ownerOrder).expect(200);
    expect(
      validReorder.body.map((chapter: { id: string }) => chapter.id),
    ).toEqual([
      automatic.body.id,
      explicit.body.id,
      adminCreated.body.id,
      first.body.id,
    ]);
    expect(await positionSnapshot()).not.toEqual(beforeInvalidReorders);
    const afterValidReorder = await positionSnapshot();

    await reorder(owner.session, ownerOrder.slice(1)).expect(400);
    await reorder(owner.session, [
      ...ownerOrder.slice(0, -1),
      { ...ownerOrder[ownerOrder.length - 1]!, id: foreignChapter.body.id },
    ]).expect(400);
    await reorder(owner.session, [
      ...ownerOrder.slice(0, -1),
      { ...ownerOrder[ownerOrder.length - 1]!, position: 1 },
    ]).expect(400);
    await reorder(owner.session, [
      ...ownerOrder.slice(0, -1),
      { ...ownerOrder[ownerOrder.length - 1]!, id: first.body.id },
    ]).expect(400);
    expect(await positionSnapshot()).toEqual(afterValidReorder);
    await reorder(other.session, ownerOrder).expect(403);
    await reorder(student.session, ownerOrder).expect(403);
    await reorder('', ownerOrder).expect(401);

    const adminOrder = [
      { id: first.body.id, position: 0 },
      { id: explicit.body.id, position: 1 },
      { id: automatic.body.id, position: 2 },
      { id: adminCreated.body.id, position: 3 },
    ];
    await reorder(admin.session, adminOrder).expect(200);
    expect(await positionSnapshot()).not.toEqual(afterValidReorder);

    await update(owner.session, first.body.id, {
      title: 'Updated first',
      description: 'Updated description',
      position: 5,
    }).expect(200).expect(({ body }) => {
      expect(body).toMatchObject({
        title: 'Updated first',
        description: 'Updated description',
        position: 5,
        courseId: course.id,
      });
    });
    await update(other.session, first.body.id, { title: 'Forbidden' }).expect(403);
    await update(student.session, first.body.id, { title: 'Forbidden' }).expect(403);
    await update(owner.session, first.body.id, { courseId: otherCourse.id }).expect(400);
    await update(owner.session, first.body.id, { title: null }).expect(400);
    await update(owner.session, first.body.id, { position: null }).expect(400);
    await update(admin.session, first.body.id, { title: 'Admin update' }).expect(200);
    await update(owner.session, randomUUID(), { title: 'Missing' }).expect(404);

    const reordered = await list(owner.session).expect(200);
    expect(reordered.body.map((chapter: { position: number }) => chapter.position))
      .toEqual([1, 2, 3, 5]);

    const concurrentOrderA = [
      { id: first.body.id, position: 3 },
      { id: explicit.body.id, position: 2 },
      { id: automatic.body.id, position: 1 },
      { id: adminCreated.body.id, position: 0 },
    ];
    const concurrentOrderB = [
      { id: first.body.id, position: 0 },
      { id: explicit.body.id, position: 1 },
      { id: automatic.body.id, position: 2 },
      { id: adminCreated.body.id, position: 3 },
    ];
    await Promise.all([
      reorder(owner.session, concurrentOrderA).expect(200),
      reorder(owner.session, concurrentOrderB).expect(200),
    ]);
    const concurrentResult = await positionSnapshot();
    const isPermutation = (orders: typeof concurrentOrderA) =>
      orders.every(
        ({ id, position }) =>
          concurrentResult.find((row: { id: string }) => row.id === id)
            ?.position === position,
      );
    expect(
      isPermutation(concurrentOrderA) || isPermutation(concurrentOrderB),
    ).toBe(true);
    await remove(other.session, explicit.body.id).expect(403);
    await remove(student.session, explicit.body.id).expect(403);
    await remove(owner.session, explicit.body.id).expect(204);
    await remove(admin.session, automatic.body.id).expect(204);
    await remove(admin.session, adminCreated.body.id).expect(204);
    await remove(owner.session, randomUUID()).expect(404);

    const remaining = await db.query(
      'SELECT id,course_id,created_at,updated_at FROM chapters WHERE id=$1',
      [first.body.id],
    );
    expect(remaining).toHaveLength(1);
    expect(remaining[0].course_id).toBe(course.id);
  });
});