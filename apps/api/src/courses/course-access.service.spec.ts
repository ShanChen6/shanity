import { DatabaseService } from '../database/database.module.js';
import { CourseAccessService } from './course-access.service.js';

describe('CourseAccessService', () => {
  const query = vi.fn();
  const service = new CourseAccessService({
    dataSource: { query },
  } as unknown as DatabaseService);

  beforeEach(() => query.mockReset());

  it('grants anonymous access to preview lessons', async () => {
    query.mockResolvedValue([{ isPreview: true, isEnrolled: false }]);

    await expect(service.canAccessLesson(undefined, 'lesson-id')).resolves.toEqual(
      { granted: true },
    );
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      'lesson-id',
      null,
    ]);
  });

  it('requires authentication for protected lessons', async () => {
    query.mockResolvedValue([{ isPreview: false, isEnrolled: false }]);

    await expect(service.canAccessLesson(undefined, 'lesson-id')).resolves.toEqual(
      { granted: false, reason: 'AUTHENTICATION_REQUIRED' },
    );
  });

  it('requires enrollment for an authenticated student', async () => {
    query.mockResolvedValue([{ isPreview: false, isEnrolled: false }]);

    await expect(service.canAccessLesson('user-id', 'lesson-id')).resolves.toEqual(
      { granted: false, reason: 'ENROLLMENT_REQUIRED' },
    );
  });

  it('grants protected lessons to enrolled students', async () => {
    query.mockResolvedValue([{ isPreview: false, isEnrolled: true }]);

    await expect(service.canAccessLesson('user-id', 'lesson-id')).resolves.toEqual(
      { granted: true },
    );
  });
});
