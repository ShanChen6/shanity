import { describe, expect, it, vi } from 'vitest';
import { CourseProgressEngine } from './course-progress-engine.service.js';

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
    engine: new CourseProgressEngine({ dataSource: { query } } as never),
    query,
  };
}

describe('CourseProgressEngine', () => {
  it('is the single formula implementation for required lesson progress', async () => {
    const { engine, query } = engineWith({});
    await expect(
      engine.calculate('user-id', 'course-id'),
    ).resolves.toMatchObject({
      totalLessons: 5,
      totalRequiredLessons: 3,
      completedLessons: 3,
      completedRequiredLessons: 2,
      percentage: 67,
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
});
