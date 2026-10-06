import { describe, expect, it, vi } from 'vitest';
import { ResumeLearningService } from './resume-learning.service.js';

const row = {
  courseId: 'course-id',
  courseTitle: 'Course',
  courseSlug: 'course',
  lessonId: 'lesson-id',
  lessonTitle: 'Lesson 2.1',
  lessonSlug: 'lesson-2-1',
  lastPosition: 90,
  hasStarted: true,
};

describe('ResumeLearningService', () => {
  it('resolves the authoritative course lesson and server position', async () => {
    const query = vi.fn().mockResolvedValue([row]);
    const service = new ResumeLearningService(
      { dataSource: { query } } as never,
      {} as never,
    );
    await expect(service.course('user-id', 'course-id')).resolves.toEqual({
      lessonSlug: 'lesson-2-1',
      lessonTitle: 'Lesson 2.1',
      lastPosition: 90,
      hasStarted: true,
    });
    expect(query.mock.calls[0][0]).toContain('lesson.is_published = true');
    expect(query.mock.calls[0][0]).toContain('chapter.position');
  });

  it('returns the latest enrollment with the shared progress percentage', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ courseId: 'course-id' }])
      .mockResolvedValueOnce([row]);
    const calculate = vi.fn().mockResolvedValue({ percentage: 45 });
    const service = new ResumeLearningService(
      { dataSource: { query } } as never,
      { calculate } as never,
    );
    await expect(service.latest('user-id')).resolves.toMatchObject({
      hasActiveCourse: true,
      resumeLesson: { id: 'lesson-id', lastPosition: 90 },
      progressPercentage: 45,
    });
    expect(query.mock.calls[0][0]).toContain(
      'last_accessed_at DESC NULLS LAST',
    );
  });

  it('returns no active course for a student without enrollments', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new ResumeLearningService(
      { dataSource: { query } } as never,
      {} as never,
    );
    await expect(service.latest('user-id')).resolves.toEqual({
      hasActiveCourse: false,
    });
  });
});
