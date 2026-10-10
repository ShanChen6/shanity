import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  learningApp,
  type Account,
  type CourseFixture,
} from '../../support/learning-fixture.js';

type Beat = {
  accepted: boolean;
  durationSeconds: number;
  requiredSeconds: number;
  isAttended: boolean;
};

/** C11: heartbeat attendance, credited by the server only. */
describe('C11 live attendance', { timeout: 60_000 }, () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let owner: Account;
  let course: CourseFixture;

  beforeAll(async () => {
    t = await learningApp('live-attendance');
    owner = await t.account('instructor');
    course = await t.course(owner, 1);
  });
  afterAll(async () => {
    await t?.app.close();
  });

  async function learner() {
    const account = await t.account();
    await t.db.query(
      'INSERT INTO enrollments(user_id, course_id) VALUES ($1, $2)',
      [account.id, course.id],
    );
    return account;
  }
  /** A 60-minute session whose window is [now + startMin, +60 min]. */
  async function session(startMinutes = -1, minutes = 60) {
    const [row] = await t.db.query(
      `INSERT INTO live_sessions (course_id, instructor_id, title, start_time,
         end_time, embed_url, provider)
       VALUES ($1, $2, 'Buổi học', now() + make_interval(mins => $3::int),
         now() + make_interval(mins => $3::int + $4::int),
         'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1', 'YOUTUBE')
       RETURNING id`,
      [course.id, owner.id, startMinutes, minutes],
    );
    return row.id as string;
  }
  const ping = (user: Account, id: string) =>
    t.send('post', `/api/v1/live-sessions/${id}/heartbeat`, user.session);
  /** Pretends the last accepted ping was `seconds` ago. */
  const rewind = (user: Account, id: string, seconds: number) =>
    t.db.query(
      `UPDATE live_attendances
       SET last_active_at = now() - make_interval(secs => $3),
           first_joined_at = LEAST(first_joined_at, now() - make_interval(secs => $3))
       WHERE session_id = $1 AND student_id = $2`,
      [id, user.id, seconds],
    );
  const stored = async (user: Account, id: string) =>
    (
      await t.db.query(
        `SELECT duration_seconds AS "durationSeconds", is_attended AS "isAttended"
         FROM live_attendances WHERE session_id = $1 AND student_id = $2`,
        [id, user.id],
      )
    )[0] as { durationSeconds: number; isAttended: boolean } | undefined;

  it('credits one interval per accepted ping, never more than time actually passed', async () => {
    const student = await learner();
    const id = await session();
    const first = (await ping(student, id).expect(200)).body as Beat;
    expect(first).toMatchObject({
      accepted: true,
      durationSeconds: 30,
      requiredSeconds: 1800,
    });

    // A second ping 0 s later: too soon, nothing credited.
    expect((await ping(student, id).expect(200)).body).toMatchObject({
      accepted: false,
      durationSeconds: 30,
    });

    // 25 s later: credited 25, not 30.
    await rewind(student, id, 25);
    expect((await ping(student, id).expect(200)).body.durationSeconds).toBe(55);
    // After a long absence (tab hidden 10 min): still only one interval.
    await rewind(student, id, 600);
    expect((await ping(student, id).expect(200)).body.durationSeconds).toBe(85);
  });

  it('credits a first ping only for the time since the class started', async () => {
    const student = await learner();
    const id = await session(0); // starts right now
    const first = (await ping(student, id).expect(200)).body as Beat;
    expect(first.durationSeconds).toBeLessThan(5);
  });

  it('AC2: 30 of 60 minutes marks the student attended, 29.5 does not', async () => {
    const student = await learner();
    const id = await session(-31);
    await ping(student, id).expect(200);
    await t.db.query(
      `UPDATE live_attendances SET duration_seconds = 1740
       WHERE session_id = $1 AND student_id = $2`,
      [id, student.id],
    );
    await rewind(student, id, 30);
    const almost = (await ping(student, id).expect(200)).body as Beat;
    expect(almost).toMatchObject({ durationSeconds: 1770, isAttended: false });
    await rewind(student, id, 30);
    const reached = (await ping(student, id).expect(200)).body as Beat;
    expect(reached).toMatchObject({ durationSeconds: 1800, isAttended: true });
    expect(await stored(student, id)).toEqual({
      durationSeconds: 1800,
      isAttended: true,
    });
  });

  it('AC3: a burst of 100 pings is throttled and credits one interval', async () => {
    const student = await learner();
    const id = await session();
    const responses = await Promise.all(
      Array.from({ length: 100 }, () => ping(student, id)),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(96);
    expect(
      responses.filter((r) => r.status === 200 && (r.body as Beat).accepted),
    ).toHaveLength(1);
    expect(
      responses.find((r) => r.status === 429)?.headers['retry-after'],
    ).toBeDefined();
    expect((await stored(student, id))?.durationSeconds).toBe(30);
  });

  it('only counts while the class is live, and only for enrolled learners', async () => {
    const student = await learner();
    expect((await ping(student, await session(10)).expect(409)).body.code).toBe(
      'LIVE_SESSION_NOT_LIVE',
    );
    expect(
      (await ping(student, await session(-120)).expect(409)).body.code,
    ).toBe('LIVE_SESSION_NOT_LIVE');
    const live = await session();
    const outsider = await t.account();
    expect((await ping(outsider, live).expect(403)).body.code).toBe(
      'ENROLLMENT_REQUIRED',
    );
    expect((await ping(owner, live).expect(403)).body.code).toBe(
      'LIVE_ATTENDANCE_STUDENTS_ONLY',
    );
    await t
      .http()
      .post(`/api/v1/live-sessions/${live}/heartbeat`)
      .set('Origin', process.env.WEB_ORIGIN!)
      .expect(401);
  });

  it('uses the course threshold, and tells the learner their standing', async () => {
    const strict = await t.course(owner, 1);
    await t.db.query(
      'UPDATE courses SET live_attendance_threshold = 80 WHERE id = $1',
      [strict.id],
    );
    const student = await t.account();
    await t.db.query(
      'INSERT INTO enrollments(user_id, course_id) VALUES ($1, $2)',
      [student.id, strict.id],
    );
    const [row] = await t.db.query(
      `INSERT INTO live_sessions (course_id, instructor_id, title, start_time,
         end_time, embed_url, provider)
       VALUES ($1, $2, 'x', now() - interval '1 minute', now() + interval '59 minutes',
         'https://meet.jit.si/abc', 'JITSI') RETURNING id`,
      [strict.id, owner.id],
    );
    const me = await t
      .http()
      .get(`/api/v1/live-sessions/${row.id}/attendance/me`)
      .set('Cookie', student.session)
      .expect(200);
    expect(me.body).toEqual({
      durationSeconds: 0,
      isAttended: false,
      requiredSeconds: 2880,
    });
  });

  it('reports every learner as PRESENT or ABSENT to teachers only', async () => {
    const id = await session(-31);
    const present = await learner();
    const brief = await learner();
    const absent = await learner();
    await ping(present, id).expect(200);
    await t.db.query(
      `UPDATE live_attendances SET duration_seconds = 1800, is_attended = true
       WHERE session_id = $1 AND student_id = $2`,
      [id, present.id],
    );
    await ping(brief, id).expect(200);

    const report = await t
      .http()
      .get(`/api/v1/courses/${course.id}/live-sessions/${id}/attendance-report`)
      .set('Cookie', owner.session)
      .expect(200);
    const byId = new Map(
      (
        report.body.students as Array<{
          studentId: string;
          status: string;
          durationSeconds: number;
        }>
      ).map((s) => [s.studentId, s]),
    );
    expect(byId.get(present.id)).toMatchObject({
      status: 'PRESENT',
      durationSeconds: 1800,
    });
    expect(byId.get(brief.id)).toMatchObject({
      status: 'ABSENT',
      durationSeconds: 30,
    });
    expect(byId.get(absent.id)).toMatchObject({
      status: 'ABSENT',
      durationSeconds: 0,
    });
    expect(report.body).toMatchObject({
      thresholdPercent: 50,
      requiredSeconds: 1800,
    });
    expect(report.body.summary.present).toBeGreaterThanOrEqual(1);

    await t
      .http()
      .get(`/api/v1/courses/${course.id}/live-sessions/${id}/attendance-report`)
      .set('Cookie', present.session)
      .expect(403);
    const other = await t.course(owner, 1);
    await t
      .http()
      .get(`/api/v1/courses/${other.id}/live-sessions/${id}/attendance-report`)
      .set('Cookie', owner.session)
      .expect(404);
  });
});
