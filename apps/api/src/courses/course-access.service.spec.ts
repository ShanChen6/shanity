import { DatabaseService } from '../database/database.module.js';
import { CourseAccessService } from './course-access.service.js';

describe('CourseAccessService', () => {
  const query = vi.fn();
  const service = new CourseAccessService({
    dataSource: { query },
  } as unknown as DatabaseService);

  beforeEach(() => query.mockReset());

  const lesson = (overrides: Record<string, unknown> = {}) => ({
    isPreview: false,
    isPublished: true,
    isEnrolled: false,
    courseStatus: 'published',
    instructorId: 'owner-id',
    isAdmin: false,
    ...overrides,
  });

  it('grants anonymous access to preview lessons', async () => {
    query.mockResolvedValue([lesson({ isPreview: true })]);

    await expect(
      service.canAccessLesson(undefined, 'lesson-id'),
    ).resolves.toEqual({ granted: true });
    expect(query).toHaveBeenCalledWith(expect.any(String), ['lesson-id', null]);
  });

  it('requires authentication for protected lessons', async () => {
    query.mockResolvedValue([lesson()]);

    await expect(
      service.canAccessLesson(undefined, 'lesson-id'),
    ).resolves.toEqual({ granted: false, reason: 'AUTHENTICATION_REQUIRED' });
  });

  it('requires enrollment for an authenticated student', async () => {
    query.mockResolvedValue([lesson()]);

    await expect(
      service.canAccessLesson('user-id', 'lesson-id'),
    ).resolves.toEqual({ granted: false, reason: 'ENROLLMENT_REQUIRED' });
  });

  it('can require enrollment even when a lesson is marked as preview', async () => {
    query.mockResolvedValue([lesson({ isPreview: true })]);

    await expect(
      service.canAccessLesson('user-id', 'lesson-id', {
        allowPreview: false,
      }),
    ).resolves.toEqual({
      granted: false,
      reason: 'ENROLLMENT_REQUIRED',
    });
  });

  it('grants protected lessons to enrolled students', async () => {
    query.mockResolvedValue([lesson({ isEnrolled: true })]);

    await expect(
      service.canAccessLesson('user-id', 'lesson-id'),
    ).resolves.toEqual({ granted: true });
  });

  it('rejects a guest preview before evaluating preview when course is draft', async () => {
    query.mockResolvedValue([
      lesson({ isPreview: true, courseStatus: 'draft' }),
    ]);

    await expect(
      service.canAccessLesson(undefined, 'lesson-id'),
    ).resolves.toEqual({ granted: false, reason: 'COURSE_UNAVAILABLE' });
  });

  it('allows the course owner to access a draft non-preview lesson', async () => {
    query.mockResolvedValue([
      lesson({ courseStatus: 'draft', instructorId: 'owner-id' }),
    ]);

    await expect(
      service.canAccessLesson('owner-id', 'lesson-id'),
    ).resolves.toEqual({ granted: true, bypass: true });
  });

  it('allows an administrator to access an unpublished draft lesson', async () => {
    query.mockResolvedValue([
      lesson({ courseStatus: 'draft', isPublished: false, isAdmin: true }),
    ]);

    await expect(
      service.canAccessLesson('admin-id', 'lesson-id'),
    ).resolves.toEqual({ granted: true, bypass: true });
  });
});
