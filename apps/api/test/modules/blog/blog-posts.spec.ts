import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Post = {
  id: string;
  title: string;
  slug: string;
  status: string;
  content: string;
  category: { id: string } | null;
  linkedCourse: { id: string } | null;
  submittedAt: string | null;
  publishedAt: string | null;
  review: { by: { id: string }; note: string | null } | null;
};

/** C7: blog schema, authoring CRUD and the editorial workflow. */
describe('C7 blog posts', { timeout: 60_000 }, () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let admin: Account;
  let author: Account;
  let otherAuthor: Account;
  let student: Account;
  let categoryId: string;

  beforeAll(async () => {
    t = await learningApp('blog-posts');
    [admin, author, otherAuthor, student] = await Promise.all([
      t.account('admin'),
      t.account('instructor'),
      t.account('instructor'),
      t.account(),
    ]);
    const category = await t
      .send('post', '/api/v1/blog/categories', admin.session, {
        name: `Lập trình ${randomUUID().slice(0, 6)}`,
      })
      .expect(201);
    categoryId = category.body.id;
  });
  afterAll(async () => {
    await t?.app.close();
  });

  const create = (user: Account, body: object) =>
    t.send('post', '/api/v1/blog/posts', user.session, body);
  const step = (user: Account, id: string, action: string, body = {}) =>
    t.send('post', `/api/v1/blog/posts/${id}/${action}`, user.session, body);
  const get = (user: Account, id: string) =>
    t.http().get(`/api/v1/blog/posts/${id}`).set('Cookie', user.session);
  const patch = (user: Account, id: string, body: object) =>
    t.send('patch', `/api/v1/blog/posts/${id}`, user.session, body);
  async function draft(user = author, extra: object = {}) {
    const response = await create(user, {
      title: `Bài viết ${randomUUID().slice(0, 8)}`,
      content: '# Xin chào\n\n$$E = mc^2$$',
      categoryId,
      ...extra,
    }).expect(201);
    return response.body as Post;
  }

  describe('authoring', () => {
    it('creates a draft with a Vietnamese-aware slug', async () => {
      const title = `Đường đi của Hàm ${randomUUID().slice(0, 4)}`;
      const post = (await create(author, { title, categoryId }).expect(201))
        .body as Post;
      expect(post).toMatchObject({
        status: 'DRAFT',
        title,
        content: '',
        category: { id: categoryId },
        publishedAt: null,
      });
      expect(post.slug).toMatch(/^duong-di-cua-ham-/);
    });

    it('numbers clashing slugs and refuses a taken explicit one', async () => {
      const title = `Trùng tên ${randomUUID().slice(0, 6)}`;
      const first = (await create(author, { title }).expect(201)).body as Post;
      const second = (await create(author, { title }).expect(201)).body as Post;
      const third = (await create(otherAuthor, { title }).expect(201))
        .body as Post;
      expect(second.slug).toBe(`${first.slug}-2`);
      expect(third.slug).toBe(`${first.slug}-3`);
      expect(
        (await create(author, { title: 'x', slug: first.slug }).expect(409))
          .body.code,
      ).toBe('BLOG_SLUG_TAKEN');
    });

    it('validates input', async () => {
      for (const body of [
        { title: '   ' },
        { title: 'x', slug: 'Có Dấu' },
        { title: 'x', coverImage: 'javascript:alert(1)' },
        { title: 'x', excerpt: 'x'.repeat(501) },
        { title: 'x', categoryId: 'nope' },
        { title: 'x', status: 'PUBLISHED' },
      ])
        await create(author, body).expect(400);
      expect(
        (
          await create(author, { title: 'x', categoryId: randomUUID() }).expect(
            400,
          )
        ).body.code,
      ).toBe('BLOG_CATEGORY_NOT_FOUND');
    });

    it('links only courses the author teaches (admins any)', async () => {
      const mine = await t.course(author, 1);
      const theirs = await t.course(otherAuthor, 1);
      const linked = await draft(author, { linkedCourseId: mine.id });
      expect(linked.linkedCourse?.id).toBe(mine.id);
      expect(
        (
          await create(author, {
            title: 'x',
            linkedCourseId: theirs.id,
          }).expect(403)
        ).body.code,
      ).toBe('BLOG_COURSE_NOT_ALLOWED');
      await create(admin, { title: 'x', linkedCourseId: theirs.id }).expect(
        201,
      );
    });

    it('is closed to students and keeps drafts private', async () => {
      await create(student, { title: 'x' }).expect(403);
      const post = await draft();
      expect((await get(otherAuthor, post.id).expect(404)).body.code).toBe(
        'BLOG_POST_NOT_FOUND',
      );
      await patch(otherAuthor, post.id, { title: 'hijack' }).expect(404);
      await get(admin, post.id).expect(200);
      // Instructors list only their own; admins see everyone's.
      const listed = await t
        .http()
        .get('/api/v1/blog/posts?limit=100')
        .set('Cookie', otherAuthor.session)
        .expect(200);
      expect(
        (listed.body.items as Post[]).some((item) => item.id === post.id),
      ).toBe(false);
      const all = await t
        .http()
        .get('/api/v1/blog/posts?status=DRAFT&limit=100')
        .set('Cookie', admin.session)
        .expect(200);
      expect((all.body.items as Post[]).map((item) => item.id)).toContain(
        post.id,
      );
      expect(all.body).toMatchObject({ page: 1, limit: 100 });
    });

    it('edits drafts, clears optional fields with null and deletes unsubmitted ones', async () => {
      const post = await draft(author, { excerpt: 'Tóm tắt' });
      const edited = (
        await patch(author, post.id, {
          title: 'Tiêu đề mới',
          excerpt: null,
          coverImage: 'https://cdn.example.com/a.png',
        }).expect(200)
      ).body;
      expect(edited).toMatchObject({
        title: 'Tiêu đề mới',
        excerpt: null,
        coverImage: 'https://cdn.example.com/a.png',
        slug: post.slug,
      });
      await t
        .send('delete', `/api/v1/blog/posts/${post.id}`, author.session)
        .expect(204);
      await get(author, post.id).expect(404);
    });
  });

  describe('workflow DRAFT -> PENDING_REVIEW -> PUBLISHED', () => {
    it('publishes after review, audits every step and freezes the slug', async () => {
      const post = await draft();
      const submitted = (await step(author, post.id, 'submit').expect(200))
        .body as Post;
      expect(submitted.status).toBe('PENDING_REVIEW');
      expect(submitted.submittedAt).not.toBeNull();
      // The author's copy is locked while in review.
      expect(
        (await patch(author, post.id, { title: 'x' }).expect(409)).body.code,
      ).toBe('BLOG_POST_NOT_EDITABLE');

      // The review queue: admin, oldest submission first.
      const queue = await t
        .http()
        .get('/api/v1/blog/posts?status=PENDING_REVIEW&limit=100')
        .set('Cookie', admin.session)
        .expect(200);
      expect((queue.body.items as Post[]).map((item) => item.id)).toContain(
        post.id,
      );

      const published = (
        await step(admin, post.id, 'publish', { note: 'Tốt' }).expect(200)
      ).body as Post;
      expect(published).toMatchObject({
        status: 'PUBLISHED',
        review: { by: { id: admin.id }, note: 'Tốt' },
      });
      expect(published.publishedAt).not.toBeNull();

      const logs = await t.db.query(
        `SELECT actor_id, from_status, to_status FROM post_review_logs
         WHERE post_id = $1 ORDER BY created_at`,
        [post.id],
      );
      expect(logs).toEqual([
        {
          actor_id: author.id,
          from_status: 'DRAFT',
          to_status: 'PENDING_REVIEW',
        },
        {
          actor_id: admin.id,
          from_status: 'PENDING_REVIEW',
          to_status: 'PUBLISHED',
        },
      ]);

      // Published: the author cannot edit; admins can, but not the slug.
      await patch(author, post.id, { title: 'x' }).expect(409);
      await patch(admin, post.id, { title: 'Sửa lỗi chính tả' }).expect(200);
      expect(
        (await patch(admin, post.id, { slug: 'duong-dan-moi' }).expect(409))
          .body.code,
      ).toBe('BLOG_SLUG_FROZEN');
      await t
        .send('delete', `/api/v1/blog/posts/${post.id}`, admin.session)
        .expect(409);
    });

    it('sends a post back with a note, and lets the author resubmit', async () => {
      const post = await draft();
      await step(author, post.id, 'submit').expect(200);
      await step(admin, post.id, 'reject', {}).expect(400); // note required
      const rejected = (
        await step(admin, post.id, 'reject', { note: 'Thiếu ví dụ' }).expect(
          200,
        )
      ).body as Post;
      expect(rejected).toMatchObject({
        status: 'DRAFT',
        review: { note: 'Thiếu ví dụ' },
      });
      await patch(author, post.id, { content: 'Có ví dụ rồi' }).expect(200);
      const again = (await step(author, post.id, 'submit').expect(200))
        .body as Post;
      expect(again.review?.note).toBeNull();
      // A post with review history is archived, never deleted.
      await step(author, post.id, 'withdraw').expect(200);
      expect(
        (
          await t
            .send('delete', `/api/v1/blog/posts/${post.id}`, author.session)
            .expect(409)
        ).body.code,
      ).toBe('BLOG_POST_HAS_HISTORY');
    });

    it('refuses out-of-order and unauthorised steps', async () => {
      const post = await draft();
      const invalid = await step(admin, post.id, 'publish').expect(409);
      expect(invalid.body).toMatchObject({
        code: 'BLOG_POST_INVALID_TRANSITION',
        from: 'DRAFT',
        to: 'PUBLISHED',
      });
      await step(author, post.id, 'withdraw').expect(409);
      await step(author, post.id, 'submit').expect(200);
      // Only admins review; only the author submits or withdraws.
      await step(author, post.id, 'publish').expect(403);
      await step(otherAuthor, post.id, 'withdraw').expect(404);
      expect(
        (await step(admin, post.id, 'withdraw').expect(403)).body.code,
      ).toBe('BLOG_POST_AUTHOR_ONLY');
      await step(author, post.id, 'submit').expect(409);
    });

    it('requires content and a category before review', async () => {
      const bare = (await create(author, { title: 'Chưa xong' }).expect(201))
        .body as Post;
      const response = await step(author, bare.id, 'submit').expect(422);
      expect(response.body).toMatchObject({
        code: 'BLOG_POST_INCOMPLETE',
        missing: ['content', 'categoryId'],
      });
    });

    it('hides a published post and keeps its first publication time', async () => {
      const post = await draft();
      await step(author, post.id, 'submit').expect(200);
      const published = (await step(admin, post.id, 'publish').expect(200))
        .body as Post;
      const hidden = (
        await step(admin, post.id, 'hide', {
          note: 'Vi phạm bản quyền',
        }).expect(200)
      ).body as Post;
      expect(hidden).toMatchObject({
        status: 'HIDDEN',
        publishedAt: published.publishedAt,
        review: { note: 'Vi phạm bản quyền' },
      });
      await step(admin, post.id, 'hide').expect(409);
    });
  });

  describe('database guarantees', () => {
    it('rejects illegal transitions and frozen-field edits written directly', async () => {
      const post = await draft();
      await expect(
        t.db.query(
          `UPDATE posts SET status = 'PUBLISHED', published_at = now() WHERE id = $1`,
          [post.id],
        ),
      ).rejects.toMatchObject({ constraint: 'TRG_posts_transition' });

      await step(author, post.id, 'submit').expect(200);
      await step(admin, post.id, 'publish').expect(200);
      await expect(
        t.db.query(`UPDATE posts SET slug = 'khac' WHERE id = $1`, [post.id]),
      ).rejects.toMatchObject({ constraint: 'TRG_posts_published_frozen' });
      await expect(
        t.db.query(`UPDATE posts SET author_id = $2 WHERE id = $1`, [
          post.id,
          otherAuthor.id,
        ]),
      ).rejects.toMatchObject({ constraint: 'TRG_posts_author' });
      await expect(
        t.db.query(`DELETE FROM post_review_logs WHERE post_id = $1`, [
          post.id,
        ]),
      ).rejects.toMatchObject({ constraint: 'TRG_post_review_logs_immutable' });
    });
  });

  describe('categories', () => {
    it('are public to read and admin-only to create', async () => {
      const list = await t.http().get('/api/v1/blog/categories').expect(200);
      expect((list.body as Array<{ id: string }>).map((c) => c.id)).toContain(
        categoryId,
      );
      await t
        .send('post', '/api/v1/blog/categories', author.session, { name: 'X' })
        .expect(403);
      const name = `Trí tuệ nhân tạo ${randomUUID().slice(0, 4)}`;
      const created = await t
        .send('post', '/api/v1/blog/categories', admin.session, { name })
        .expect(201);
      expect(created.body.slug).toMatch(/^tri-tue-nhan-tao-/);
      expect(
        (
          await t
            .send('post', '/api/v1/blog/categories', admin.session, {
              name: 'Khác',
              slug: created.body.slug,
            })
            .expect(409)
        ).body.code,
      ).toBe('BLOG_CATEGORY_SLUG_TAKEN');
    });
  });
});
