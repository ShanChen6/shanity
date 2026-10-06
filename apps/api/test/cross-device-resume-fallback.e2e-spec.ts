import { learningApp, type Account } from './support/learning-fixture.js';

describe('Cross-device progress, resume fallback and enrollment suspension', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let owner: Account;

  beforeAll(async () => {
    t = await learningApp('cross-device');
    owner = await t.account('instructor');
  });
  afterAll(() => t?.app.close());

  const resume = (session: string, courseId: string) =>
    t.http().get(`/courses/${courseId}/resume-lesson`).set('Cookie', session);
  const start = (session: string, lessonId: string) =>
    t.send('post', `/lessons/${lessonId}/progress/start`, session).expect(201);

  it('a completion on device A is the next read on device B (no stale cache)', async () => {
    const student = await t.account();
    const course = await t.course(owner, 10, [student]);
    const deviceB = await t.login(student.email);
    for (const lesson of course.lessons.slice(0, 7))
      await t.complete(student.session, lesson.id).expect(200);
    const before = await t.progress(deviceB, course.id).expect(200);
    expect(before.body.percentage).toBe(70);
    expect(before.headers['cache-control']).toContain('no-store');

    await t.complete(student.session, course.lessons[7]!.id).expect(200);
    const after = await t.progress(deviceB, course.id).expect(200);
    expect(after.body).toMatchObject({
      percentage: 80,
      lastAccessedLessonId: course.lessons[7]!.id,
    });
    const resumed = await resume(deviceB, course.id).expect(200);
    expect(resumed.body.lessonSlug).toBe(course.lessons[7]!.slug);
  });

  it('resume falls back to the first unfinished lesson when the last one is deleted', async () => {
    const student = await t.account();
    const course = await t.course(owner, 6, [student]);
    for (const lesson of course.lessons.slice(0, 3))
      await t.complete(student.session, lesson.id).expect(200);
    const opened = course.lessons[4]!; // lesson 5, skipping lesson 4
    await start(student.session, opened.id);
    expect((await resume(student.session, course.id)).body).toMatchObject({
      lessonSlug: opened.slug,
      hasStarted: true,
    });

    await t
      .send(
        'delete',
        `/courses/${course.id}/lessons/${opened.id}`,
        owner.session,
      )
      .expect(204);
    // Lesson 4 is the lowest-position lesson not yet completed.
    const fallback = await resume(student.session, course.id).expect(200);
    expect(fallback.body).toMatchObject({
      lessonSlug: course.lessons[3]!.slug,
      hasStarted: false,
    });
  });

  it('resume also falls back when the last lesson is unpublished', async () => {
    const student = await t.account();
    const course = await t.course(owner, 3, [student]);
    await t.complete(student.session, course.lessons[0]!.id).expect(200);
    await start(student.session, course.lessons[2]!.id);
    await t
      .send('patch', `/lessons/${course.lessons[2]!.id}`, owner.session, {
        isPublished: false,
      })
      .expect(200);
    const fallback = await resume(student.session, course.id).expect(200);
    expect(fallback.body.lessonSlug).toBe(course.lessons[1]!.slug);
  });

  it('a suspended enrollment gets 403 ENROLLMENT_SUSPENDED everywhere; reinstating restores progress', async () => {
    const student = await t.account();
    const course = await t.course(owner, 4, [student]);
    await t.complete(student.session, course.lessons[0]!.id).expect(200);
    await t.db.query(
      `UPDATE enrollments SET revoked_at = now()
       WHERE user_id = $1 AND course_id = $2`,
      [student.id, course.id],
    );

    const suspended = (response: { status: number; body: unknown }) => {
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: 'ENROLLMENT_SUSPENDED',
        message: 'Enrollment Suspended',
      });
    };
    suspended(await t.progress(student.session, course.id));
    suspended(await resume(student.session, course.id));
    suspended(await t.complete(student.session, course.lessons[1]!.id));
    suspended(
      await t
        .http()
        .get(`/lessons/${course.lessons[1]!.id}`)
        .set('Cookie', student.session),
    );
    // Never enrolled is a different answer.
    const stranger = await t.account();
    const notEnrolled = await t.progress(stranger.session, course.id);
    expect(notEnrolled.status).toBe(403);
    expect(notEnrolled.body.code).toBe('ENROLLMENT_REQUIRED');

    await t.db.query(
      `UPDATE enrollments SET revoked_at = NULL
       WHERE user_id = $1 AND course_id = $2`,
      [student.id, course.id],
    );
    const restored = await t.progress(student.session, course.id).expect(200);
    expect(restored.body).toMatchObject({
      completedRequiredLessons: 1,
      percentage: 25,
    });
  });
});
