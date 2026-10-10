import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Card = {
  slug: string;
  excerpt: string;
  category: { slug: string } | null;
  readingMinutes: number;
};

/** C8: the public blog API behind the SSR pages, OG images and sitemap. */
describe('C8 public blog API', { timeout: 60_000 }, () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let admin: Account;
  let author: Account;
  let category: { id: string; slug: string };
  const tag = randomUUID().slice(0, 6);

  beforeAll(async () => {
    t = await learningApp('public-blog');
    [admin, author] = await Promise.all([
      t.account('admin'),
      t.account('instructor'),
    ]);
    category = (
      await t
        .send('post', '/api/v1/blog/categories', admin.session, {
          name: `Toán ${tag}`,
        })
        .expect(201)
    ).body;
  });
  afterAll(async () => {
    await t?.app.close();
  });

  async function post(
    stage: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'HIDDEN',
    extra: object = {},
  ) {
    const created = await t
      .send('post', '/api/v1/blog/posts', author.session, {
        title: `Bài ${stage} ${tag} ${randomUUID().slice(0, 4)}`,
        content: 'Một hai ba bốn năm. $$a^2 + b^2 = c^2$$',
        categoryId: category.id,
        ...extra,
      })
      .expect(201);
    const { id, slug } = created.body as { id: string; slug: string };
    const step = (user: Account, action: string) =>
      t
        .send('post', `/api/v1/blog/posts/${id}/${action}`, user.session, {})
        .expect(200);
    if (stage !== 'DRAFT') await step(author, 'submit');
    if (stage === 'PUBLISHED' || stage === 'HIDDEN')
      await step(admin, 'publish');
    if (stage === 'HIDDEN') await step(admin, 'hide');
    return slug;
  }
  const list = (query = '') =>
    t.http().get(`/public/blog/posts${query}`).expect(200);

  it('lists published posts only, newest first, without a session', async () => {
    const older = await post('PUBLISHED');
    const newer = await post('PUBLISHED', { excerpt: 'Tóm tắt riêng' });
    const hidden = await post('HIDDEN');
    const draft = await post('DRAFT');
    const pending = await post('PENDING_REVIEW');

    const body = (await list(`?category=${category.slug}&limit=50`)).body as {
      items: Card[];
      total: number;
    };
    const slugs = body.items.map((item) => item.slug);
    expect(slugs).toEqual([newer, older]);
    expect(body.total).toBe(2);
    for (const gone of [hidden, draft, pending])
      expect(slugs).not.toContain(gone);

    const [first, second] = body.items;
    expect(first.excerpt).toBe('Tóm tắt riêng');
    // No excerpt given: derived from the content, math stripped.
    expect(second.excerpt).toBe('Một hai ba bốn năm.');
    expect(second).toMatchObject({
      category: { slug: category.slug },
      readingMinutes: 1,
    });
  });

  it('serves a published post by slug and 404s everything else', async () => {
    const published = await post('PUBLISHED');
    const response = await t
      .http()
      .get(`/public/blog/posts/${published}`)
      .expect(200);
    expect(response.headers['cache-control']).toBe('public, max-age=60');
    expect(response.body.post).toMatchObject({
      slug: published,
      content: 'Một hai ba bốn năm. $$a^2 + b^2 = c^2$$',
    });
    for (const stage of ['DRAFT', 'PENDING_REVIEW', 'HIDDEN'] as const) {
      const slug = await post(stage);
      expect(
        (await t.http().get(`/public/blog/posts/${slug}`).expect(404)).body
          .code,
      ).toBe('BLOG_POST_NOT_FOUND');
    }
  });

  it('advertises the linked course only while it is published', async () => {
    const course = await t.course(author, 1);
    await t.db.query(
      `UPDATE courses SET access_type = 'PAID', price = 499000,
         short_description = 'Học nhanh' WHERE id = $1`,
      [course.id],
    );
    const slug = await post('PUBLISHED', { linkedCourseId: course.id });
    const shown = await t.http().get(`/public/blog/posts/${slug}`).expect(200);
    expect(shown.body.relatedCourse).toMatchObject({
      id: course.id,
      accessType: 'PAID',
      price: 499000,
      shortDescription: 'Học nhanh',
      instructorName: 'instructor',
    });

    await t.db.query(`UPDATE courses SET status = 'draft' WHERE id = $1`, [
      course.id,
    ]);
    const hidden = await t.http().get(`/public/blog/posts/${slug}`).expect(200);
    expect(hidden.body.relatedCourse).toBeNull();
  });

  it('is served under /api/v1/public in the standard envelope', async () => {
    const slug = await post('PUBLISHED');
    const response = await t
      .http()
      .get(`/api/v1/public/blog/posts/${slug}`)
      .expect(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { post: { slug } },
    });
  });

  it('lists every published post for the sitemap', async () => {
    const published = await post('PUBLISHED');
    const draft = await post('DRAFT');
    const response = await t.http().get('/public/blog/sitemap').expect(200);
    const slugs = (response.body as Array<{ slug: string }>).map((r) => r.slug);
    expect(slugs).toContain(published);
    expect(slugs).not.toContain(draft);
  });

  it('validates its query', async () => {
    await t.http().get('/public/blog/posts?limit=51').expect(400);
    await t.http().get('/public/blog/posts?category=Không Hợp Lệ').expect(400);
  });
});
