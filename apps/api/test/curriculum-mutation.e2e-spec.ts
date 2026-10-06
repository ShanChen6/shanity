import {
  CurriculumEvents,
  type CourseCurriculumChanged,
} from '../src/modules/curriculum/curriculum-events.js';
import {
  learningApp,
  type Account,
  type CourseFixture,
} from './support/learning-fixture.js';

// Progress is derived on every read from the *current* curriculum, so each
// edit below must show up in the very next GET with no backfill.
describe('Dynamic progress under curriculum mutations', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let owner: Account;
  const events: CourseCurriculumChanged[] = [];

  beforeAll(async () => {
    t = await learningApp('curriculum-mutation');
    owner = await t.account('instructor');
    t.app.get(CurriculumEvents).onChanged((event) => {
      events.push(event);
    });
  });
  afterAll(() => t?.app.close());

  // 10 required lessons, lessons 1..8 completed by the student: 80%.
  async function eightOfTen() {
    const student = await t.account();
    const course = await t.course(owner, 10, [student]);
    for (const lesson of course.lessons.slice(0, 8))
      await t.complete(student.session, lesson.id).expect(200);
    await expectProgress(student, course, 8, 10, 80);
    return { student, course };
  }

  async function expectProgress(
    student: Account,
    course: CourseFixture,
    done: number,
    total: number,
    percentage: number,
  ) {
    const { body } = await t.progress(student.session, course.id).expect(200);
    expect(body).toMatchObject({
      completedRequiredLessons: done,
      totalRequiredLessons: total,
      percentage,
      isCompleted: percentage === 100,
    });
  }

  const patchLesson = (lessonId: string, body: object) =>
    t.send('patch', `/lessons/${lessonId}`, owner.session, body).expect(200);

  const changedFor = (courseId: string) =>
    events.filter((event) => event.courseId === courseId);

  it('8/10 (80%) -> instructor adds 2 required lessons -> 8/12 (66%)', async () => {
    const { student, course } = await eightOfTen();
    const before = changedFor(course.id).length;
    await t.addLesson(owner, course.chapterId, 'New 1');
    await t.addLesson(owner, course.chapterId, 'New 2');
    // floor(66.67) = 66: a percentage never overstates real completion.
    await expectProgress(student, course, 8, 12, 66);
    // Each mutation announced CourseCurriculumChanged (cache invalidation).
    await vi.waitFor(() =>
      expect(changedFor(course.id).length).toBe(before + 2),
    );
  });

  it('a new optional lesson does not change the percentage', async () => {
    const { student, course } = await eightOfTen();
    await t.addLesson(owner, course.chapterId, 'Bonus', false);
    await expectProgress(student, course, 8, 10, 80);
  });

  it('required -> optional and deletions recount from the remaining required set', async () => {
    const { student, course } = await eightOfTen();
    const [first, second] = course.lessons;
    const last = course.lessons[9]!;
    // A completed lesson becomes optional: 7/9.
    await patchLesson(first!.id, { isRequired: false });
    await expectProgress(student, course, 7, 9, 77);
    // ...and back to required: 8/10 again, the completion was never lost.
    await patchLesson(first!.id, { isRequired: true });
    await expectProgress(student, course, 8, 10, 80);
    // Deleting an untouched lesson: 8/9.
    await t
      .send('delete', `/courses/${course.id}/lessons/${last.id}`, owner.session)
      .expect(204);
    await expectProgress(student, course, 8, 9, 88);
    // Deleting a completed lesson: 7/8.
    await t
      .send(
        'delete',
        `/courses/${course.id}/lessons/${second!.id}`,
        owner.session,
      )
      .expect(204);
    await expectProgress(student, course, 7, 8, 87);
    expect(changedFor(course.id).map((event) => event.source)).toEqual(
      expect.arrayContaining([
        'PATCH /lessons/:id',
        'DELETE /courses/:courseId/lessons/:id',
      ]),
    );
  });

  it('unpublished lessons leave both totals; republishing restores them', async () => {
    const { student, course } = await eightOfTen();
    const [completed] = course.lessons;
    const untouched = course.lessons[9]!;
    await patchLesson(untouched.id, { isPublished: false });
    await expectProgress(student, course, 8, 9, 88);
    await patchLesson(completed!.id, { isPublished: false });
    await expectProgress(student, course, 7, 8, 87);
    await patchLesson(untouched.id, { isPublished: true });
    await patchLesson(completed!.id, { isPublished: true });
    await expectProgress(student, course, 8, 10, 80);
  });

  it('completing every remaining required lesson reaches exactly 100%', async () => {
    const { student, course } = await eightOfTen();
    await t.complete(student.session, course.lessons[8]!.id).expect(200);
    await expectProgress(student, course, 9, 10, 90);
    await t.complete(student.session, course.lessons[9]!.id).expect(200);
    await expectProgress(student, course, 10, 10, 100);
    // Adding required content re-opens the course instead of staying "done".
    await t.addLesson(owner, course.chapterId, 'Epilogue');
    await expectProgress(student, course, 10, 11, 90);
  });
});
