import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CurriculumEvents } from '../../src/modules/curriculum/curriculum-events.js';
import { learningApp, type Account } from '../support/learning-fixture.js';

const redisUrl = process.env.REDIS_TEST_URL;
const backends = [
  { name: 'in-process', redis: undefined },
  { name: 'redis', redis: redisUrl },
];

describe.each(backends)('public catalog cache ($name)', ({ name, redis }) => {
  if (name === 'redis' && !redis) {
    it.skip('needs REDIS_TEST_URL', () => undefined);
    return;
  }
  let t: Awaited<ReturnType<typeof learningApp>>;
  let owner: Account;
  let slug: string;
  let courseId: string;

  beforeAll(async () => {
    // Off by default under test; this suite is the one place that turns it on.
    // Set per backend: the previous block's afterAll has just cleared it.
    process.env.CACHE_PUBLIC_CATALOG_SECONDS = '60';
    if (redis) process.env.REDIS_URL = redis;
    else delete process.env.REDIS_URL;
    t = await learningApp(`catalog-cache-${name}`);
    owner = await t.account('instructor');
    const course = await t.course(owner, 1);
    courseId = course.id;
    const [row] = await t.db.query('SELECT slug FROM courses WHERE id = $1', [
      courseId,
    ]);
    slug = row.slug;
  });
  afterAll(async () => {
    await t?.app.close();
    delete process.env.REDIS_URL;
    delete process.env.CACHE_PUBLIC_CATALOG_SECONDS;
  });

  const rename = (title: string) =>
    t.db.query('UPDATE courses SET title = $2 WHERE id = $1', [
      courseId,
      title,
    ]);
  const detail = (path = `/public/courses/${slug}`) => t.http().get(path);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  it('serves a repeat read from cache until the catalog changes', async () => {
    await rename('Original title');
    expect((await detail().expect(200)).body.course.title).toBe(
      'Original title',
    );

    // Written behind the API's back: only a cache could still say "Original".
    await rename('Changed in the database');
    expect((await detail().expect(200)).body.course.title).toBe(
      'Original title',
    );

    // Publishing / editing the curriculum emits this event in production.
    t.app.get(CurriculumEvents).emitChanged({ courseId, source: 'test' });
    await settle();
    expect((await detail().expect(200)).body.course.title).toBe(
      'Changed in the database',
    );
  });

  it('shares the cache with the /api/v1 alias and keeps its envelope', async () => {
    await rename('Shared title');
    t.app.get(CurriculumEvents).emitChanged({ courseId, source: 'test' });
    await settle();
    const legacy = await detail().expect(200);
    await rename('Behind the cache');
    const v1 = await detail(`/api/v1/public/courses/${slug}`).expect(200);
    expect(legacy.body.course.title).toBe('Shared title');
    expect(v1.body).toMatchObject({
      success: true,
      data: { course: { title: 'Shared title' } },
    });
  });

  it('caches the browse list but never free-text searches', async () => {
    await rename('Browse before');
    t.app.get(CurriculumEvents).emitChanged({ courseId, source: 'test' });
    await settle();
    const titles = async (query = '') =>
      (
        (await t.http().get(`/public/courses?limit=50${query}`).expect(200))
          .body.data as Array<{ id: string; title: string }>
      )
        .filter((course) => course.id === courseId)
        .map((course) => course.title);

    expect(await titles()).toEqual(['Browse before']);
    await rename('Browse after');
    expect(await titles()).toEqual(['Browse before']); // cached
    expect(await titles('&search=Browse')).toEqual(['Browse after']); // live
  });

  it('does not cache a missing course', async () => {
    const missing = `later-${randomUUID()}`;
    await t.http().get(`/public/courses/${missing}`).expect(404);
    await t.db.query(
      `INSERT INTO courses(slug, title, status, published_at)
       VALUES ($1, 'Appears at once', 'published', now())`,
      [missing],
    );
    expect(
      (await t.http().get(`/public/courses/${missing}`).expect(200)).body.course
        .title,
    ).toBe('Appears at once');
  });
});
