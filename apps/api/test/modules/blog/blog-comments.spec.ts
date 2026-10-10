import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ToxicityClassifier,
  type ToxicityResult,
} from '../../../src/modules/blog/moderation/toxicity-classifier.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

/** The AI layer, scripted per test: a score, or null for "no answer". */
class ScriptedClassifier extends ToxicityClassifier {
  readonly provider = 'scripted';
  score: number | null = 0.02;
  calls = 0;
  classify(): Promise<ToxicityResult | null> {
    this.calls++;
    return Promise.resolve(
      this.score === null
        ? null
        : {
            score: this.score,
            categories: { harassment: this.score },
            provider: this.provider,
          },
    );
  }
}

type Comment = { id: string; content: string; status: string };
type Thread = { comments: Comment[]; pending: Comment[]; total: number };

/** C9: blog comments through the automated moderation pipeline. */
describe('C9 blog comments', { timeout: 60_000 }, () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  const ai = new ScriptedClassifier();
  let admin: Account;
  let author: Account;
  let slug: string;

  beforeAll(async () => {
    t = await learningApp('blog-comments', (builder) =>
      builder.overrideProvider(ToxicityClassifier).useValue(ai),
    );
    [admin, author] = await Promise.all([
      t.account('admin'),
      t.account('instructor'),
    ]);
    const category = await t
      .send('post', '/api/v1/blog/categories', admin.session, {
        name: `Bình luận ${randomUUID().slice(0, 6)}`,
      })
      .expect(201);
    const post = await t
      .send('post', '/api/v1/blog/posts', author.session, {
        title: `Bài để bình luận ${randomUUID().slice(0, 6)}`,
        content: 'Nội dung',
        categoryId: category.body.id,
      })
      .expect(201);
    slug = post.body.slug;
    await t
      .send('post', `/api/v1/blog/posts/${post.body.id}/submit`, author.session)
      .expect(200);
    await t
      .send('post', `/api/v1/blog/posts/${post.body.id}/publish`, admin.session)
      .expect(200);
  });
  afterAll(async () => {
    await t?.app.close();
  });
  beforeEach(() => {
    ai.score = 0.02;
    ai.calls = 0;
  });

  /** A learner: enrolled, and an account older than a day. */
  async function trustedLearner() {
    const learner = await t.account();
    const course = await t.course(author, 1, [learner]);
    expect(course.id).toBeTruthy();
    await t.db.query(
      `UPDATE users SET created_at = now() - interval '30 days' WHERE id = $1`,
      [learner.id],
    );
    return learner;
  }
  const comment = (user: Account, content: string) =>
    t.send('post', `/api/v1/blog/posts/${slug}/comments`, user.session, {
      content,
    });
  const thread = (user?: Account) => {
    const request = t.http().get(`/api/v1/blog/posts/${slug}/comments`);
    if (user) request.set('Cookie', user.session);
    return request.expect(200).then((response) => response.body as Thread);
  };
  const stored = async (id: string) =>
    (
      await t.db.query(
        `SELECT status, is_approved, toxicity_score, rejection_reason, moderation
         FROM post_comments WHERE id = $1`,
        [id],
      )
    )[0];

  it('AC1: a trusted learner’s clean comment is published at once', async () => {
    const learner = await trustedLearner();
    const response = await comment(
      learner,
      'Bài viết rất hay, cảm ơn tác giả!',
    ).expect(200);
    expect(response.body).toMatchObject({
      status: 'APPROVED',
      reason: null,
      message: 'Bình luận của bạn đã được đăng.',
    });
    expect(await stored(response.body.comment.id)).toMatchObject({
      status: 'APPROVED',
      is_approved: true,
      toxicity_score: 0.02,
      moderation: { decidedBy: 'trust', provider: 'scripted' },
    });
    const visitor = await thread();
    expect(visitor.comments.map((c) => c.id)).toContain(
      response.body.comment.id,
    );
  });

  it('AC2: profanity and junk links are rejected by the rules, AI untouched', async () => {
    const learner = await trustedLearner();
    for (const [content, reason] of [
      ['Bài này như lồn', 'PROFANITY'],
      ['Tài liệu ôn thi giá rẻ tại https://re-lam.xyz', 'SPAM_LINK'],
      ['Inbox zalo 0912 345 678 nhé', 'CONTACT_INFO'],
    ]) {
      const response = await comment(learner, content).expect(200);
      expect(response.body).toMatchObject({ status: 'REJECTED', reason });
      expect(response.body.message).toMatch(/vi phạm quy chuẩn nội dung/);
      expect(await stored(response.body.comment.id)).toMatchObject({
        status: 'REJECTED',
        is_approved: false,
        rejection_reason: reason,
      });
    }
    expect(ai.calls).toBe(0);
  });

  it('AC2: a toxic score is rejected by the AI layer', async () => {
    ai.score = 0.91;
    const response = await comment(
      await trustedLearner(),
      'Viết dở tệ, tác giả kém cỏi',
    ).expect(200);
    expect(response.body).toMatchObject({
      status: 'REJECTED',
      reason: 'TOXIC',
    });
  });

  it('AC3 + AC4: a borderline comment waits, seen by its author only, then goes public', async () => {
    ai.score = 0.5;
    const learner = await trustedLearner();
    const response = await comment(
      learner,
      'Chỗ này giải thích hơi ẩu đấy',
    ).expect(200);
    expect(response.body).toMatchObject({
      status: 'PENDING',
      reason: 'SUSPICIOUS',
      message: 'Bình luận của bạn đang chờ kiểm duyệt.',
    });
    const id = response.body.comment.id as string;

    // The author sees it marked pending; another learner and guests do not.
    const own = await thread(learner);
    expect(own.pending.map((c) => c.id)).toEqual([id]);
    expect(own.comments.map((c) => c.id)).not.toContain(id);
    const other = await thread(await trustedLearner());
    expect(
      [...other.pending, ...other.comments].map((c) => c.id),
    ).not.toContain(id);
    expect((await thread()).pending).toEqual([]);

    // It is on the admin queue.
    const queue = await t
      .http()
      .get('/api/v1/admin/comments?status=PENDING&limit=100')
      .set('Cookie', admin.session)
      .expect(200);
    expect((queue.body.data as Comment[]).map((c) => c.id)).toContain(id);

    // An admin approves it: public for everyone, audited.
    await t
      .send('patch', `/api/v1/admin/comments/${id}/approve`, admin.session)
      .expect(200);
    expect((await thread()).comments.map((c) => c.id)).toContain(id);
    expect((await thread(learner)).pending).toEqual([]);
    const logs = await t.db.query(
      'SELECT actor_id, from_status, to_status FROM post_comment_review_logs WHERE comment_id = $1',
      [id],
    );
    expect(logs).toEqual([
      { actor_id: admin.id, from_status: 'PENDING', to_status: 'APPROVED' },
    ]);
  });

  it('holds clean comments from new accounts and when the AI cannot answer', async () => {
    const newcomer = await t.account(); // created just now, no enrollment
    expect(
      (await comment(newcomer, 'Cảm ơn bạn đã chia sẻ').expect(200)).body,
    ).toMatchObject({
      status: 'PENDING',
      reason: 'UNTRUSTED_AUTHOR',
    });
    ai.score = null;
    expect(
      (await comment(await trustedLearner(), 'Rất hữu ích ạ').expect(200)).body,
    ).toMatchObject({ status: 'PENDING', reason: 'AI_UNAVAILABLE' });
  });

  it('trusts an account with more than three approved comments', async () => {
    const regular = await t.account();
    await t.db.query(
      `UPDATE users SET created_at = now() - interval '30 days' WHERE id = $1`,
      [regular.id],
    );
    for (let i = 0; i < 4; i++) {
      const held = await comment(
        regular,
        `Ý kiến số ${i + 1} về bài viết`,
      ).expect(200);
      expect(held.body.status).toBe('PENDING');
      await t
        .send(
          'patch',
          `/api/v1/admin/comments/${held.body.comment.id}/approve`,
          admin.session,
        )
        .expect(200);
    }
    expect(
      (await comment(regular, 'Giờ thì tôi đã quen rồi').expect(200)).body
        .status,
    ).toBe('APPROVED');
  });

  it('rejects duplicates and limits the pace', async () => {
    const learner = await trustedLearner();
    await comment(learner, 'Câu hỏi của mình là gì nhỉ').expect(200);
    expect(
      (await comment(learner, '  câu hỏi của mình là gì nhỉ ').expect(200))
        .body,
    ).toMatchObject({ status: 'REJECTED', reason: 'DUPLICATE' });
    for (let i = 0; i < 3; i++)
      await comment(learner, `Thêm ý ${i}`).expect(200);
    expect((await comment(learner, 'Thêm nữa').expect(429)).body.code).toBe(
      'COMMENT_RATE_LIMITED',
    );
  });

  it('lets admins reject what slipped through, and only admins', async () => {
    const learner = await trustedLearner();
    const published = await comment(
      learner,
      'Một bình luận bình thường',
    ).expect(200);
    const id = published.body.comment.id as string;
    await t
      .send('patch', `/api/v1/admin/comments/${id}/reject`, author.session)
      .expect(403);
    await t
      .send('patch', `/api/v1/admin/comments/${id}/reject`, admin.session, {
        reason: 'Lạc đề',
      })
      .expect(200);
    expect(await stored(id)).toMatchObject({
      status: 'REJECTED',
      is_approved: false,
      rejection_reason: 'Lạc đề',
    });
    expect((await thread()).comments.map((c) => c.id)).not.toContain(id);
    await t
      .send('patch', `/api/v1/admin/comments/${id}/reject`, admin.session)
      .expect(409);
  });

  it('requires a session to comment, and a published post', async () => {
    await t
      .http()
      .post(`/api/v1/blog/posts/${slug}/comments`)
      .set('Origin', process.env.WEB_ORIGIN!)
      .send({ content: 'x' })
      .expect(401);
    const learner = await trustedLearner();
    await t
      .send(
        'post',
        '/api/v1/blog/posts/khong-ton-tai/comments',
        learner.session,
        { content: 'x' },
      )
      .expect(404);
    await comment(learner, '   ').expect(400);
    await comment(learner, 'x'.repeat(2001)).expect(400);
  });

  it('keeps is_approved and status in step at the database', async () => {
    const learner = await trustedLearner();
    const { body } = await comment(learner, 'Kiểm tra ràng buộc').expect(200);
    await expect(
      t.db.query(`UPDATE post_comments SET is_approved = false WHERE id = $1`, [
        body.comment.id,
      ]),
    ).rejects.toMatchObject({ constraint: 'CHK_post_comments_approved' });
  });
});
