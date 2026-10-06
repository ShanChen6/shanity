import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { QuizScope } from '../entities/quiz.entity.js';
import type { QuizEntity } from '../entities/quiz.entity.js';

export type QuizTarget = Pick<QuizEntity, 'scope' | 'targetId'>;

/** A contextual quiz whose target row does not exist (or is the wrong type). */
export class QuizTargetNotFoundError extends Error {
  constructor(
    readonly scope: QuizScope,
    readonly targetId: string | null,
  ) {
    super(`Quiz ${String(scope).toLowerCase()} target not found`);
    this.name = 'QuizTargetNotFoundError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// One primary-key lookup per scope; LESSON joins through its chapter, which is
// authoritative for the course (lessons.course_id is a denormalized copy).
const TARGET_COURSE_SQL: Partial<Record<QuizScope, string>> = {
  [QuizScope.LESSON]: `SELECT chapter.course_id AS "courseId"
    FROM lessons lesson
    INNER JOIN chapters chapter ON chapter.id = lesson.chapter_id
    WHERE lesson.id = $1`,
  [QuizScope.CHAPTER]: `SELECT course_id AS "courseId"
    FROM chapters WHERE id = $1`,
  [QuizScope.COURSE]: `SELECT id AS "courseId" FROM courses WHERE id = $1`,
};

/**
 * Traces any quiz target back to the Course that holds authority over it.
 * Shared by authoring authorization, attempts and grading.
 */
@Injectable()
export class QuizCourseResolverService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * The quiz's owning Course id, or null for STANDALONE (global admin policy).
   * Throws QuizTargetNotFoundError when a contextual target cannot be resolved.
   */
  async resolveCourseIdByQuiz(
    quiz: QuizTarget,
    manager?: EntityManager,
  ): Promise<string | null> {
    if (quiz.scope === QuizScope.STANDALONE) return null;
    if (quiz.scope === QuizScope.COURSE && quiz.targetId) return quiz.targetId;
    const courseId = await this.findTargetCourseId(quiz, manager);
    if (!courseId) throw new QuizTargetNotFoundError(quiz.scope, quiz.targetId);
    return courseId;
  }

  /**
   * Verifies the target exists as the type its scope demands and returns its
   * Course id; null when absent, malformed, or the scope has no target.
   */
  async findTargetCourseId(
    { scope, targetId }: QuizTarget,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<string | null> {
    const sql = TARGET_COURSE_SQL[scope];
    if (!sql || !targetId || !UUID.test(targetId)) return null;
    const [row] = await manager.query<Array<{ courseId: string }>>(sql, [
      targetId,
    ]);
    return row?.courseId ?? null;
  }
}
