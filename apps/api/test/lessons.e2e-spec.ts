import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AuthConfig } from '../src/auth/auth.config.js';
import { DatabaseService } from '../src/database/database.module.js';
import { configureApp } from '../src/setup.js';

describe('Lessons with PostgreSQL', () => {
  let app: INestApplication;
  let db: DatabaseService['dataSource']['manager'];
  let origin: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    const testIp = `lessons-${randomUUID()}`;
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
      .send({
        email,
        password: 'Testing-a-long-password-42',
        displayName: role,
      })
      .expect(201);
    const session = (
      (response.headers['set-cookie'] as unknown as string[]) ?? []
    )
      .map((cookie) => cookie.split(';')[0])
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

  it('enforces deep ownership on lesson CRUD', async () => {
    const owner = await account('instructor');
    const other = await account('instructor');
    const admin = await account('admin');
    const student = await account('student');
    const http = () => request(app.getHttpServer());
    const as = (
      session: string,
      method: 'get' | 'post' | 'patch' | 'delete',
      path: string,
    ) => http()[method](path).set('Origin', origin).set('Cookie', session);
    const course = await as(owner.session, 'post', '/courses')
      .send({ title: 'Lesson course', slug: `lesson-course-${randomUUID()}` })
      .expect(201)
      .then((r) => r.body);
    const chapter = await as(
      owner.session,
      'post',
      `/courses/${course.id}/chapters`,
    )
      .send({ title: 'Chapter' })
      .expect(201)
      .then((r) => r.body);
    const path = `/chapters/${chapter.id}/lessons`;
    const text = {
      title: 'Intro',
      type: 'TEXT',
      content: {
        textBody:
          '<h2>Header</h2><p><strong>Bold</strong> and <em>italic</em></p>' +
          '<pre><code>const safe = true;</code></pre><ul><li>Item</li></ul>',
      },
    };

    await http().get(path).expect(401);
    await as('', 'post', path).send(text).expect(401);
    await as(student.session, 'post', path).send(text).expect(403);
    await as(other.session, 'post', path)
      .send({
        ...text,
        courseId: course.id,
        instructorId: owner.id,
        authorId: owner.id,
      })
      .expect(403);
    await as(other.session, 'get', path).expect(403);

    const first = await as(owner.session, 'post', path)
      .send({
        ...text,
        courseId: randomUUID(),
        instructorId: other.id,
        authorId: other.id,
      })
      .expect(201);
    expect(first.body).toMatchObject({
      position: 0,
      isPreview: false,
      chapterId: chapter.id,
      courseId: course.id,
      textBody:
        '<h2>Header</h2><p><strong>Bold</strong> and <em>italic</em></p>' +
        '<pre><code>const safe = true;</code></pre><ul><li>Item</li></ul>',
    });
    const second = await as(owner.session, 'post', path)
      .send({ ...text, title: 'Intro' })
      .expect(201);
    expect(second.body.position).toBe(1);
    expect(second.body.slug).not.toBe(first.body.slug);
    await as(owner.session, 'post', path)
      .send({ ...text, position: 1 })
      .expect(409);
    const video = await as(owner.session, 'post', path)
      .send({
        title: 'Video',
        type: 'VIDEO',
        isPreview: true,
        content: { videoUrl: 'https://www.youtube.com/watch?v=abc' },
      })
      .expect(201);
    expect(video.body).toMatchObject({ position: 2, videoProvider: 'YOUTUBE' });
    const document = await as(admin.session, 'post', path)
      .send({
        title: 'Doc',
        type: 'DOCUMENT',
        content: {
          documentAssetId: 'asset-1',
          documentFileName: 'a.pdf',
          documentFileSize: 10,
          documentDownloadAllowed: true,
        },
      })
      .expect(201)
      .then((response) => response.body);

    for (const body of [
      { ...text, content: {} },
      { ...text, content: { videoUrl: 'https://youtu.be/x' } },
      { ...text, type: 'VIDEO', content: { videoUrl: 'not a url' } },
      {
        ...text,
        type: 'VIDEO',
        content: { videoUrl: 'https://evil.example/x' },
      },
      { ...text, type: 'DOCUMENT', content: { documentAssetId: 'a' } },
      { ...text, content: { textBody: '<script>alert(1)</script>' } },
      { ...text, type: 'QUIZ' },
      { ...text, id: randomUUID() },
      { ...text, createdAt: new Date().toISOString() },
    ])
      await as(owner.session, 'post', path).send(body).expect(400);

    const list = await as(owner.session, 'get', path).expect(200);
    expect(list.body.map((l: { position: number }) => l.position)).toEqual([
      0, 1, 2, 3,
    ]);

    const otherCourse = await as(other.session, 'post', '/courses')
      .send({ title: 'Other course', slug: `other-course-${randomUUID()}` })
      .expect(201)
      .then((response) => response.body);
    const foreignChapter = await as(
      other.session,
      'post',
      `/courses/${otherCourse.id}/chapters`,
    )
      .send({ title: 'Foreign chapter' })
      .expect(201)
      .then((response) => response.body);
    const foreignLesson = await as(
      other.session,
      'post',
      `/chapters/${foreignChapter.id}/lessons`,
    )
      .send(text)
      .expect(201)
      .then((response) => response.body);

    const reorderPath = `${path}/reorder`;
    const validOrder = [
      { id: first.body.id, position: 3 },
      { id: second.body.id, position: 2 },
      { id: video.body.id, position: 1 },
      { id: document.id, position: 0 },
    ];
    const positionSnapshot = () =>
      db.query(
        'SELECT id,position FROM lessons WHERE chapter_id=$1 ORDER BY id',
        [chapter.id],
      );
    const beforeInvalidReorders = await positionSnapshot();
    const reorder = (session: string, lessonOrders: object[]) =>
      as(session, 'patch', reorderPath).send({ lessonOrders });

    await reorder(other.session, validOrder).expect(403);
    await reorder(student.session, validOrder).expect(403);
    await reorder('', validOrder).expect(401);
    await reorder(owner.session, validOrder.slice(1)).expect(400);
    await reorder(owner.session, [
      ...validOrder,
      { id: randomUUID(), position: 4 },
    ]).expect(400);
    await reorder(owner.session, [
      ...validOrder.slice(0, -1),
      { id: foreignLesson.id, position: 0 },
    ]).expect(400);
    await reorder(owner.session, [
      ...validOrder.slice(0, -1),
      { id: document.id, position: 1 },
    ]).expect(400);
    expect(await positionSnapshot()).toEqual(beforeInvalidReorders);

    const reordered = await reorder(owner.session, validOrder).expect(200);
    expect(reordered.body.map((lesson: { id: string }) => lesson.id)).toEqual([
      document.id,
      video.body.id,
      second.body.id,
      first.body.id,
    ]);
    expect(await positionSnapshot()).toEqual(
      [...validOrder]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(({ id, position }) => ({ id, position })),
    );
    const orderedAfterReorder = await as(owner.session, 'get', path).expect(
      200,
    );
    expect(
      orderedAfterReorder.body.map((lesson: { id: string }) => lesson.id),
    ).toEqual([document.id, video.body.id, second.body.id, first.body.id]);
    await reorder(admin.session, validOrder).expect(200);

    const lessonPath = `/lessons/${first.body.id}`;
    await as(other.session, 'get', lessonPath).expect(403);
    await as(other.session, 'patch', lessonPath)
      .send({ title: 'x' })
      .expect(403);
    await as(other.session, 'delete', lessonPath).expect(403);
    await as(student.session, 'get', lessonPath).expect(403);
    await http().get(lessonPath).expect(403);
    await as(owner.session, 'get', `/lessons/${randomUUID()}`).expect(404);

    await as(owner.session, 'get', lessonPath)
      .expect(200)
      .then((r) => expect(r.body.title).toBe('Intro'));
    const patched = await as(owner.session, 'patch', lessonPath)
      .send({
        title: 'Renamed',
        isPreview: true,
        content: {
          textBody:
            `<script>alert('XSS')</script><h1>Bài học 1</h1>` +
            '<img src=x onerror=alert(1) />',
        },
      })
      .expect(200);
    expect(patched.body).toMatchObject({
      title: 'Renamed',
      isPreview: true,
      textBody: '<h1>Bài học 1</h1><img src="x" />',
    });
    const [storedTextLesson] = await db.query(
      'SELECT text_body FROM lessons WHERE id=$1',
      [first.body.id],
    );
    expect(storedTextLesson.text_body).toBe(
      '<h1>Bài học 1</h1><img src="x" />',
    );
    await as(owner.session, 'patch', lessonPath)
      .send({ type: 'VIDEO' })
      .expect(400);
    await as(owner.session, 'patch', lessonPath)
      .send({ id: randomUUID() })
      .expect(400);
    await as(owner.session, 'patch', lessonPath)
      .send({ position: 1 })
      .expect(409);
    const retyped = await as(admin.session, 'patch', lessonPath)
      .send({ type: 'VIDEO', content: { videoUrl: 'https://vimeo.com/1' } })
      .expect(200);
    expect(retyped.body).toMatchObject({
      type: 'VIDEO',
      textBody: null,
      videoProvider: 'VIMEO',
    });

    await as(owner.session, 'delete', lessonPath).expect(204);
    await as(owner.session, 'get', lessonPath).expect(404);
  });
});
