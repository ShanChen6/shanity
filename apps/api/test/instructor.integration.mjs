// Run after build/migrate against an isolated *_test database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/setup.js';
import { DatabaseService } from '../dist/database/database.module.js';

await test('instructor content ownership, validation, reorder, media and lifecycle', async () => {
  assert.ok(
    process.env.PGDATABASE?.endsWith('_test'),
    'Use an isolated test database',
  );
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = module.createNestApplication();
  configureApp(app);
  await app.init();
  const db = app.get(DatabaseService).dataSource;
  const origin = process.env.WEB_ORIGIN;
  const server = app.getHttpServer();
  try {
    async function account(role) {
      const email = `${randomUUID()}@example.invalid`;
      const res = await request(server)
        .post('/auth/register')
        .set('Origin', origin)
        .send({ email, password: 'C14-test-password-42', displayName: role })
        .expect(201);
      const [user] = await db.query('SELECT id FROM users WHERE email=$1', [
        email,
      ]);
      if (role === 'instructor')
        await db.query(
          "INSERT INTO user_roles(user_id,role_code) VALUES ($1,'instructor')",
          [user.id],
        );
      return res.headers['set-cookie']
        .map((cookie) => cookie.split(';')[0])
        .join('; ');
    }
    const owner = await account('instructor');
    const other = await account('instructor');
    const student = await account('student');
    const call = (method, path, cookie = owner) =>
      request(server)[method](path).set('Origin', origin).set('Cookie', cookie);
    const course = (
      await call('post', '/courses')
        .send({
          title: 'C14',
          slug: randomUUID(),
          category: 'Design',
          level: 'Advanced',
          language: 'vi',
          price: 123000,
        })
        .expect(201)
    ).body;
    assert.equal(course.price, 123000);
    const path = `/courses/${course.id}`;
    await call('patch', path).send({ price: -1 }).expect(400);
    await call('get', path, other).expect(403);
    await call('get', `${path}/lessons`, student).expect(403);
    await call('post', `${path}/publish`).expect(400);
    const chapter = (
      await call('post', `${path}/chapters`)
        .send({ title: 'Chapter' })
        .expect(201)
    ).body;
    const createLesson = (body) =>
      call('post', `${path}/chapters/${chapter.id}/lessons`).send(body);
    const first = (
      await createLesson({
        title: 'One',
        type: 'Article',
        body: '# Hello',
      }).expect(201)
    ).body;
    const second = (
      await createLesson({
        title: 'Two',
        type: 'Video',
        videoUrl: 'https://example.org/video.mp4',
      }).expect(201)
    ).body;
    await createLesson({ title: ' ', type: 'Article' }).expect(400);
    await call('patch', `${path}/lessons/${first.id}`, other)
      .send({ title: 'Foreign', type: 'Article' })
      .expect(403);
    await call('patch', `${path}/chapters/${chapter.id}/lessons/reorder`)
      .send({ ids: [first.id] })
      .expect(400);
    const reordered = (
      await call('patch', `${path}/chapters/${chapter.id}/lessons/reorder`)
        .send({ ids: [second.id, first.id] })
        .expect(200)
    ).body;
    assert.deepEqual(
      reordered.map((x) => x.id),
      [second.id, first.id],
    );
    await call('post', `${path}/thumbnail`)
      .attach('file', Buffer.from('bad'), 'fake.png')
      .expect(400);
    const png = await sharp({
      create: { width: 32, height: 20, channels: 3, background: '#23664b' },
    })
      .png()
      .toBuffer();
    const media = (
      await call('post', `${path}/thumbnail`)
        .attach('file', png, 'cover.png')
        .expect(201)
    ).body;
    await request(server)
      .get(media.url)
      .expect('Content-Type', /image\/webp/)
      .expect(200);
    await call('patch', path)
      .send({ thumbnail: media.url, description: 'Course description' })
      .expect(200);
    assert.equal(
      (await call('post', `${path}/publish`).expect(201)).body.status,
      'published',
    );
    await request(server).get(`/public/courses/${course.slug}`).expect(200);
    assert.equal(
      (await call('post', `${path}/unpublish`).expect(201)).body.status,
      'draft',
    );
    await request(server).get(`/public/courses/${course.slug}`).expect(404);
    await call('delete', `${path}/lessons/${second.id}`).expect(204);
    await call('delete', `/chapters/${chapter.id}`).expect(204);
    assert.deepEqual(
      (await call('get', `${path}/lessons`).expect(200)).body,
      [],
    );
    assert.equal(
      (await call('post', `${path}/archive`).expect(201)).body.status,
      'archived',
    );
    await call('post', `${path}/publish`).expect(409);
  } finally {
    await app.close();
  }
});
