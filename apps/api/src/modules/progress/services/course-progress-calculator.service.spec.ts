import { describe, expect, it, vi } from 'vitest';
import { CurriculumEvents } from '../../curriculum/curriculum-events.js';
import { NoopProgressCache } from '../cache/progress-cache.js';
import {
  CourseProgressCalculatorService,
  progressPercentage,
} from './course-progress-calculator.service.js';

function engineWith(row: Record<string, unknown>) {
  const query = vi.fn().mockResolvedValue([
    {
      courseId: 'course-id',
      userId: 'user-id',
      totalLessons: 5,
      totalRequiredLessons: 3,
      completedLessons: 3,
      completedRequiredLessons: 2,
      lastAccessedLessonId: 'lesson-3',
      updatedAt: '2026-10-06T00:00:00.000Z',
      ...row,
    },
  ]);
  return {
    engine: new CourseProgressCalculatorService(
      { dataSource: { query } } as never,
      new NoopProgressCache(),
      new CurriculumEvents(),
    ),
    query,
  };
}

describe('CourseProgressCalculatorService', () => {
  it('separates the progress bar from the completion gate', async () => {
    const lessonsDone = {
      totalRequiredLessons: 9,
      completedRequiredLessons: 9,
    };
    // A failed required quiz: high bar, not completed.
    await expect(
      engineWith({
        ...lessonsDone,
        totalQuizzes: 1,
        totalRequiredQuizzes: 1,
        passedQuizzes: 0,
        passedRequiredQuizzes: 0,
      }).engine.calculate('user-id', 'course-id'),
    ).resolves.toMatchObject({ percentage: 90, isCompleted: false });
    // An optional quiz left: completed below 100%.
    await expect(
      engineWith({
        ...lessonsDone,
        totalQuizzes: 1,
        totalRequiredQuizzes: 0,
        passedQuizzes: 0,
        passedRequiredQuizzes: 0,
      }).engine.calculate('user-id', 'course-id'),
    ).resolves.toMatchObject({ percentage: 90, isCompleted: true });
  });

  it('is the single formula implementation for required lesson progress', async () => {
    const { engine, query } = engineWith({});
    await expect(
      engine.calculate('user-id', 'course-id'),
    ).resolves.toMatchObject({
      totalLessons: 5,
      totalRequiredLessons: 3,
      completedLessons: 3,
      completedRequiredLessons: 2,
      percentage: 66,
      isCompleted: false,
      lastAccessedLessonId: 'lesson-3',
    });
    expect(query.mock.calls[0][0]).toContain('lesson.is_required = true');
  });

  it('returns a completed summary for a course with no required lessons', async () => {
    const { engine } = engineWith({
      totalLessons: 2,
      totalRequiredLessons: 0,
      completedLessons: 0,
      completedRequiredLessons: 0,
    });
    await expect(
      engine.calculate('user-id', 'course-id'),
    ).resolves.toMatchObject({
      percentage: 100,
      isCompleted: true,
    });
  });

  it('clamps inconsistent completed data to 100 percent', async () => {
    const { engine } = engineWith({
      totalRequiredLessons: 2,
      completedRequiredLessons: 3,
    });
    await expect(
      engine.calculate('user-id', 'course-id'),
    ).resolves.toMatchObject({
      percentage: 100,
      isCompleted: true,
    });
  });

  it('maps enrolled courses to the dashboard payload with instructor and resume data', async () => {
    const { engine, query } = engineWith({
      totalRequiredLessons: 25,
      completedRequiredLessons: 18,
      title: 'React Fundamentals',
      slug: 'react-fundamentals',
      thumbnail: 'https://cdn.example/react.png',
      instructorName: 'Shanity Team',
      lastAccessedLessonSlug: 'react-hooks-overview',
      lastAccessedAt: '2026-10-06T10:00:00.000Z',
    });
    await expect(engine.enrolledCourses('user-id')).resolves.toEqual([
      {
        courseId: 'course-id',
        title: 'React Fundamentals',
        slug: 'react-fundamentals',
        thumbnailUrl: 'https://cdn.example/react.png',
        instructorName: 'Shanity Team',
        progress: {
          percentage: 72,
          completedRequiredLessons: 18,
          totalRequiredLessons: 25,
          isCompleted: false,
          lastAccessedLessonSlug: 'react-hooks-overview',
          lastAccessedAt: new Date('2026-10-06T10:00:00.000Z'),
        },
      },
    ]);
    expect(query.mock.calls[0][0]).toContain('enrollment.revoked_at IS NULL');
  });

  it('returns null resume data for enrolled courses never opened', async () => {
    const { engine } = engineWith({
      completedRequiredLessons: 0,
      title: 'NestJS Fundamentals',
      slug: 'nestjs-fundamentals',
      thumbnail: null,
      instructorName: null,
      lastAccessedLessonSlug: null,
      lastAccessedAt: null,
    });
    const [course] = await engine.enrolledCourses('user-id');
    expect(course.progress).toMatchObject({
      percentage: 0,
      lastAccessedLessonSlug: null,
      lastAccessedAt: null,
    });
  });

  describe('dynamic formula (floor, required + published only)', () => {
    it.each([
      [8, 10, 80],
      [8, 12, 66], // two required lessons added: 66.67% floors to 66
      [7, 9, 77], // a completed lesson deleted / made optional
      [8, 9, 88], // an untouched lesson deleted / made optional
      [199, 200, 99], // never "complete" while a required lesson remains
      [10, 10, 100],
      [0, 0, 100], // nothing required
    ])('%i/%i -> %i%%', (done, total, expected) => {
      expect(progressPercentage(done, total)).toBe(expected);
    });

    it('does not mark 199/200 as completed', async () => {
      const { engine } = engineWith({
        totalRequiredLessons: 200,
        completedRequiredLessons: 199,
      });
      await expect(
        engine.calculate('user-id', 'course-id'),
      ).resolves.toMatchObject({ percentage: 99, isCompleted: false });
    });
  });

  describe('cache seam', () => {
    function withCache() {
      const query = vi.fn().mockResolvedValue([]);
      const cache = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        invalidateStudent: vi.fn().mockResolvedValue(undefined),
        invalidateCourse: vi.fn().mockResolvedValue(undefined),
      };
      const events = new CurriculumEvents();
      const calculator = new CourseProgressCalculatorService(
        { dataSource: { query } } as never,
        cache as never,
        events,
      );
      calculator.onModuleInit();
      return { calculator, cache, events, query };
    }

    it('invalidates the whole course when CourseCurriculumChanged fires', async () => {
      const { cache, events } = withCache();
      events.emitChanged({
        courseId: 'course-id',
        source: 'PATCH /lessons/:id',
      });
      await vi.waitFor(() =>
        expect(cache.invalidateCourse).toHaveBeenCalledWith('course-id'),
      );
    });

    it('serves a cached summary without querying, and fills the cache on a miss', async () => {
      const { calculator, cache, query } = withCache();
      const cached = { courseId: 'course-id', percentage: 50 };
      cache.get.mockResolvedValueOnce(cached);
      await expect(calculator.calculate('u', 'course-id')).resolves.toBe(
        cached,
      );
      expect(query).not.toHaveBeenCalled();
      await calculator.calculate('u', 'course-id');
      expect(query).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledWith(
        expect.objectContaining({ courseId: 'course-id' }),
      );
    });

    it('never lets a failing listener break the curriculum edit', () => {
      const events = new CurriculumEvents();
      events.onChanged(() => {
        throw new Error('cache down');
      });
      expect(() =>
        events.emitChanged({ courseId: 'c', source: 'test' }),
      ).not.toThrow();
    });
  });
});
