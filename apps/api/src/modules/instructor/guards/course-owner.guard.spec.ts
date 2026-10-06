import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../../../database/database.module.js';
import {
  COURSE_PROGRESS_FORBIDDEN,
  CourseOwnerGuard,
  type CourseOwnerRequest,
} from './course-owner.guard.js';

const COURSE_ID = '3f2b8a52-7c1e-4b8e-9a0f-1d2c3b4a5e6f';
const course = (overrides: Record<string, unknown> = {}) => ({
  id: COURSE_ID,
  title: 'NestJS Fundamentals',
  ownerId: 'instructor-a',
  instructorId: 'instructor-a',
  ...overrides,
});

describe('CourseOwnerGuard', () => {
  const query = vi.fn();
  const guard = new CourseOwnerGuard({
    dataSource: { query },
  } as unknown as DatabaseService);

  beforeEach(() => query.mockReset());

  function run(roles: string[], id = 'instructor-a', courseId = COURSE_ID) {
    const request = {
      principal: { id, roles },
      params: { courseId },
    } as unknown as CourseOwnerRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { request, result: guard.canActivate(context) };
  }

  it('lets an instructor read their own course and attaches it', async () => {
    query.mockResolvedValue([course()]);
    const { request, result } = run(['instructor']);
    await expect(result).resolves.toBe(true);
    expect(request.ownedCourse).toEqual({
      id: COURSE_ID,
      title: 'NestJS Fundamentals',
    });
    expect(query).toHaveBeenCalledWith(expect.any(String), [COURSE_ID]);
  });

  it('accepts the assigned primary instructor even if someone else owns it', async () => {
    query.mockResolvedValue([course({ ownerId: 'someone-else' })]);
    await expect(run(['instructor']).result).resolves.toBe(true);
  });

  it("rejects another instructor's course with 403 (IDOR)", async () => {
    query.mockResolvedValue([
      course({ ownerId: 'instructor-b', instructorId: 'instructor-b' }),
    ]);
    const { result } = run(['instructor']);
    await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    await expect(result).rejects.toThrow(COURSE_PROGRESS_FORBIDDEN);
  });

  it('answers 403, not 404, for unknown or malformed ids to non-admins', async () => {
    query.mockResolvedValue([]);
    await expect(run(['instructor']).result).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      run(['instructor'], 'instructor-a', 'not-a-uuid').result,
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('lets an admin read any course', async () => {
    query.mockResolvedValue([
      course({ ownerId: 'instructor-b', instructorId: 'instructor-b' }),
    ]);
    await expect(run(['admin'], 'admin-id').result).resolves.toBe(true);
  });

  it('gives admins a real 404 for missing courses', async () => {
    query.mockResolvedValue([]);
    await expect(run(['admin'], 'admin-id').result).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('never admits students, even enrolled ones or course owners', async () => {
    query.mockResolvedValue([course({ ownerId: 'student-id' })]);
    await expect(run(['student'], 'student-id').result).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(query).not.toHaveBeenCalled();
  });
});
