import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { Enrollment } from '../../courses/enrollment.entity.js';
import { Lesson, LessonType } from '../lessons/entities/lesson.entity.js';
import {
  LessonProgress,
  LessonProgressStatus,
} from './entities/lesson-progress.entity.js';
import { ProgressService } from './progress.service.js';

function fixture(type: LessonType, downloadAllowed = false) {
  const lesson = {
    id: 'lesson-id',
    courseId: 'course-id',
    type,
    documentDownloadAllowed: downloadAllowed,
  } as Lesson;
  const progress = {
    lessonId: lesson.id,
    status: LessonProgressStatus.IN_PROGRESS,
  } as LessonProgress;
  const query = vi.fn().mockResolvedValue([]);
  const database = {
    dataSource: {
      query,
      getRepository: vi.fn((entity: unknown) => {
        if (entity === Lesson)
          return { findOneBy: vi.fn().mockResolvedValue(lesson) };
        if (entity === Enrollment)
          return {
            findOneBy: vi.fn().mockResolvedValue({ id: 'enrollment-id' }),
          };
        return { findOneByOrFail: vi.fn().mockResolvedValue(progress) };
      }),
    },
  };
  return { service: new ProgressService(database as never), query, progress };
}

describe('ProgressService state machine', () => {
  it('starts idempotently without completing a lesson', async () => {
    const { service, query, progress } = fixture(LessonType.TEXT);
    await expect(service.start('user-id', 'lesson-id')).resolves.toBe(progress);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('last_accessed_at'),
      ['user-id', 'lesson-id', 'course-id', LessonProgressStatus.IN_PROGRESS],
    );
    expect(query.mock.calls.flat().join(' ')).not.toContain('completed_at =');
  });

  it('keeps video below 85% in progress and stores its position', async () => {
    const { service, query } = fixture(LessonType.VIDEO);
    await service.videoProgress('user-id', 'lesson-id', {
      seconds: 42,
      percentage: 84.99,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('GREATEST(COALESCE(last_position, 0), $3)'),
      ['user-id', 'lesson-id', 42],
    );
    expect(query.mock.calls.flat().join(' ')).not.toContain(
      'completed_at = COALESCE',
    );
  });

  it('completes video at 85% and preserves the first completion time', async () => {
    const { service, query } = fixture(LessonType.VIDEO);
    await service.videoProgress('user-id', 'lesson-id', {
      seconds: 85,
      percentage: 85,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('completed_at = COALESCE'),
      ['user-id', 'lesson-id', 'course-id', LessonProgressStatus.COMPLETED, 85],
    );
  });

  it('uses an atomic upsert and preserves the original completion timestamp', async () => {
    const { service, query } = fixture(LessonType.TEXT);
    await Promise.all(
      Array.from({ length: 5 }, () =>
        service.complete('user-id', 'lesson-id', { scrollPercentage: 80 }),
      ),
    );
    const completionSql = query.mock.calls
      .map(([sql]) => String(sql))
      .filter((sql) => sql.includes('ON CONFLICT'));
    expect(completionSql).toHaveLength(5);
    expect(
      completionSql.every((sql) => sql.includes('completed_at = COALESCE')),
    ).toBe(true);
  });

  it('upserts a heartbeat without changing a completed status', async () => {
    const { service, query } = fixture(LessonType.TEXT);
    await service.updateHeartbeat('user-id', 'lesson-id', {
      lastPosition: 64,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('last_position = EXCLUDED.last_position'),
      [
        'user-id',
        'lesson-id',
        'course-id',
        LessonProgressStatus.IN_PROGRESS,
        64,
      ],
    );
    expect(query.mock.calls.flat().join(' ')).not.toContain(
      'status = EXCLUDED.status',
    );
  });

  it('requires both 80% text reading and an explicit completion request', async () => {
    const { service } = fixture(LessonType.TEXT);
    await expect(
      service.complete('user-id', 'lesson-id', { scrollPercentage: 79 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.complete('user-id', 'lesson-id', { scrollPercentage: 80 }),
    ).resolves.toBeTruthy();
  });

  it('allows document download completion only when downloads are enabled', async () => {
    const denied = fixture(LessonType.DOCUMENT, false).service;
    await expect(
      denied.complete('user-id', 'lesson-id', { downloaded: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const allowed = fixture(LessonType.DOCUMENT, true).service;
    await expect(
      allowed.complete('user-id', 'lesson-id', { downloaded: true }),
    ).resolves.toBeTruthy();
  });
});
