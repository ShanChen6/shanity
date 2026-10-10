import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Event = {
  id: string;
  title: string;
  courseName: string;
  status: string;
  role: string;
  liveClassUrl: string;
  embedUrl?: unknown;
};

/** C12: GET /api/v1/live-sessions/my-schedule and its data isolation. */
describe('C12 my schedule', { timeout: 60_000 }, () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let teacher: Account;
  let student: Account;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await learningApp('live-schedule');
    teacher = await t.account('instructor');
    student = await t.account();
    const otherTeacher = await t.account('instructor');
    const enrolled = await t.course(teacher, 1, [student]);
    const notEnrolled = await t.course(otherTeacher, 1);
    const revoked = await t.course(otherTeacher, 1, [student]);
    await t.db.query(
      'UPDATE enrollments SET revoked_at = now() WHERE course_id = $1 AND user_id = $2',
      [revoked.id, student.id],
    );
    const unpublished = await t.course(otherTeacher, 1, [student]);
    await t.db.query(`UPDATE courses SET status = 'draft' WHERE id = $1`, [
      unpublished.id,
    ]);
    const add = async (
      key: string,
      courseId: string,
      ownerId: string,
      startHours: number,
    ) => {
      const [row] = await t.db.query(
        `INSERT INTO live_sessions (course_id, instructor_id, title, start_time,
           end_time, embed_url, provider)
         VALUES ($1, $2, $3, now() + make_interval(hours => $4::int),
           now() + make_interval(hours => $4::int + 1),
           'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1', 'YOUTUBE')
         RETURNING id`,
        [courseId, ownerId, key, startHours],
      );
      ids[key] = row.id;
    };
    await add('mine-tomorrow', enrolled.id, teacher.id, 24);
    await add('mine-next-month', enrolled.id, teacher.id, 24 * 40);
    await add('not-enrolled', notEnrolled.id, otherTeacher.id, 24);
    await add('revoked', revoked.id, otherTeacher.id, 24);
    await add('unpublished', unpublished.id, otherTeacher.id, 24);
  });
  afterAll(async () => {
    await t?.app.close();
  });

  const schedule = (user: Account, days = 7) => {
    const start = new Date(Date.now() - 86_400_000).toISOString();
    const end = new Date(Date.now() + days * 86_400_000).toISOString();
    return t
      .http()
      .get(
        `/api/v1/live-sessions/my-schedule?startDate=${start}&endDate=${end}`,
      )
      .set('Cookie', user.session);
  };

  it('shows a learner only the sessions of courses they actively learn in', async () => {
    const response = await schedule(student).expect(200);
    const events = response.body.sessions as Event[];
    expect(events.map((e) => e.title)).toEqual(['mine-tomorrow']);
    expect(events[0]).toMatchObject({
      status: 'SCHEDULED',
      role: 'student',
      liveClassUrl: expect.stringMatching(
        new RegExp(`/live/${ids['mine-tomorrow']}$`),
      ),
    });
    // The calendar never carries the player URL.
    expect(JSON.stringify(response.body)).not.toContain('youtube.com/embed');
  });

  it('shows teachers what they teach, and only within the range asked', async () => {
    const week = (await schedule(teacher).expect(200)).body.sessions as Event[];
    expect(week.map((e) => e.title)).toEqual(['mine-tomorrow']);
    expect(week[0].role).toBe('instructor');
    const twoMonths = (await schedule(teacher, 60).expect(200)).body
      .sessions as Event[];
    expect(twoMonths.map((e) => e.title)).toEqual([
      'mine-tomorrow',
      'mine-next-month',
    ]);
  });

  it('gives an admin with no course of their own an empty calendar', async () => {
    const admin = await t.account('admin');
    expect((await schedule(admin).expect(200)).body.sessions).toEqual([]);
  });

  it('validates the range and is not mistaken for a session id', async () => {
    await t
      .http()
      .get('/api/v1/live-sessions/my-schedule')
      .set('Cookie', student.session)
      .expect(400);
    await schedule(student, 120).expect(400);
    const start = new Date().toISOString();
    await t
      .http()
      .get(
        `/api/v1/live-sessions/my-schedule?startDate=${start}&endDate=${start}`,
      )
      .set('Cookie', student.session)
      .expect(400);
    await t.http().get('/api/v1/live-sessions/my-schedule').expect(401);
  });
});
