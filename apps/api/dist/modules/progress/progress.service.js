var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BadRequestException, Injectable, NotFoundException, } from '@nestjs/common';
import { DatabaseService } from '../../database/database.module.js';
import { Lesson, LessonType } from '../lessons/entities/lesson.entity.js';
import { LessonProgress, LessonProgressStatus, } from './entities/lesson-progress.entity.js';
import { CourseProgressCalculatorService } from './services/course-progress-calculator.service.js';
import { EnrollmentPolicy } from './services/enrollment-policy.js';
let ProgressService = class ProgressService {
    database;
    progressCalculator;
    enrollments;
    constructor(database, progressCalculator, enrollments) {
        this.database = database;
        this.progressCalculator = progressCalculator;
        this.enrollments = enrollments;
    }
    async lessonForStudent(userId, lessonId) {
        const lesson = await this.database.dataSource
            .getRepository(Lesson)
            .findOneBy({ id: lessonId });
        if (!lesson)
            throw new NotFoundException('Lesson not found');
        await this.enrollments.requireActive(userId, lesson.courseId);
        return lesson;
    }
    async start(userId, lessonId) {
        const lesson = await this.lessonForStudent(userId, lessonId);
        await this.database.dataSource.query(`WITH saved_progress AS (
       INSERT INTO lesson_progress
        (id, user_id, lesson_id, course_id, status, last_position, started_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, now())
       ON CONFLICT (user_id, lesson_id) DO UPDATE
         SET last_accessed_at = CURRENT_TIMESTAMP
       RETURNING course_id
       )
       UPDATE enrollments SET
         last_accessed_lesson_id = $2,
         last_accessed_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND course_id = $3 AND revoked_at IS NULL`, [userId, lesson.id, lesson.courseId, LessonProgressStatus.IN_PROGRESS]);
        return this.find(userId, lesson.id);
    }
    async startLesson(userId, lessonId) {
        const progress = await this.start(userId, lessonId);
        return {
            progress,
            courseProgress: await this.calculateCourseProgress(userId, progress.courseId),
        };
    }
    async updateHeartbeat(userId, lessonId, dto) {
        const lesson = await this.lessonForStudent(userId, lessonId);
        await this.database.dataSource.query(`WITH saved_progress AS (
       INSERT INTO lesson_progress
        (id, user_id, lesson_id, course_id, status, last_position, started_at, last_accessed_at)
       VALUES (public.uuid_generate_v4(), $1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET
         last_position = EXCLUDED.last_position,
         last_accessed_at = CURRENT_TIMESTAMP
       RETURNING course_id
       )
       UPDATE enrollments SET
         last_accessed_lesson_id = $2,
         last_accessed_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND course_id = $3 AND revoked_at IS NULL`, [
            userId,
            lesson.id,
            lesson.courseId,
            LessonProgressStatus.IN_PROGRESS,
            dto.lastPosition,
        ]);
        const progress = await this.find(userId, lesson.id);
        return {
            progress,
            courseProgress: await this.calculateCourseProgress(userId, lesson.courseId),
        };
    }
    async complete(userId, lessonId, evidence) {
        const lesson = await this.lessonForStudent(userId, lessonId);
        if (lesson.type === LessonType.VIDEO)
            throw new BadRequestException('Video lessons complete through video progress');
        if (lesson.type === LessonType.TEXT &&
            (evidence.scrollPercentage ?? 0) < 80)
            throw new BadRequestException('Read at least 80% before completing');
        if (lesson.type === LessonType.DOCUMENT &&
            !(lesson.documentDownloadAllowed && evidence.downloaded) &&
            !evidence.reachedLastPage)
            throw new BadRequestException('View the final page before completing');
        return this.markCompleted(userId, lesson);
    }
    async completeLesson(userId, lessonId, evidence) {
        const progress = await this.complete(userId, lessonId, evidence);
        return {
            progress,
            courseProgress: await this.calculateCourseProgress(userId, progress.courseId),
        };
    }
    async videoProgress(userId, lessonId, dto) {
        const lesson = await this.lessonForStudent(userId, lessonId);
        if (lesson.type !== LessonType.VIDEO)
            throw new BadRequestException('Lesson is not a video');
        await this.start(userId, lessonId);
        if (dto.ended || dto.percentage >= 85) {
            const progress = await this.markCompleted(userId, lesson, dto.seconds);
            return {
                progress,
                courseProgress: await this.calculateCourseProgress(userId, lesson.courseId),
            };
        }
        await this.database.dataSource.query(`WITH saved_progress AS (
       UPDATE lesson_progress SET
         last_position = GREATEST(COALESCE(last_position, 0), $4),
         last_accessed_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND lesson_id = $2
       RETURNING course_id
       )
       UPDATE enrollments SET
         last_accessed_lesson_id = $2,
         last_accessed_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND course_id = $3 AND revoked_at IS NULL`, [userId, lessonId, lesson.courseId, dto.seconds]);
        const progress = await this.find(userId, lessonId);
        return {
            progress,
            courseProgress: await this.calculateCourseProgress(userId, lesson.courseId),
        };
    }
    async courseProgress(userId, courseId) {
        await this.enrollments.requireActive(userId, courseId);
        const rows = (await this.database.dataSource.query(`SELECT lesson.id AS "lessonId", COALESCE(progress.status::text, $3) AS status,
              lesson.is_required AS "isRequired",
              COALESCE(progress.last_position, 0)::int AS "lastPosition",
              progress.started_at AS "startedAt", progress.completed_at AS "completedAt"
       FROM lessons lesson
       LEFT JOIN lesson_progress progress
         ON progress.lesson_id = lesson.id AND progress.user_id = $1
       WHERE lesson.course_id = $2 AND lesson.is_published = true
       ORDER BY lesson.position`, [userId, courseId, 'NOT_STARTED']));
        return Object.assign(await this.progressCalculator.calculate(userId, courseId), { lessons: rows });
    }
    async calculateCourseProgress(userId, courseId) {
        await this.progressCalculator.invalidateStudentProgress(userId, courseId);
        return this.progressCalculator.calculate(userId, courseId);
    }
    async markCompleted(userId, lesson, lastPosition = 0) {
        await this.database.dataSource.query(`WITH saved_progress AS (
       INSERT INTO lesson_progress
        (id, user_id, lesson_id, course_id, status, last_position,
         started_at, last_accessed_at, completed_at)
       VALUES (public.uuid_generate_v4(), $1, $2, $3, $4, $5,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET
         status = $4,
         completed_at = COALESCE(lesson_progress.completed_at, CURRENT_TIMESTAMP),
         last_position = GREATEST(COALESCE(lesson_progress.last_position, 0), $5),
         last_accessed_at = CURRENT_TIMESTAMP
       RETURNING course_id
       )
       UPDATE enrollments SET
         last_accessed_lesson_id = $2,
         last_accessed_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND course_id = $3 AND revoked_at IS NULL`, [
            userId,
            lesson.id,
            lesson.courseId,
            LessonProgressStatus.COMPLETED,
            lastPosition,
        ]);
        return this.find(userId, lesson.id);
    }
    find(userId, lessonId) {
        return this.database.dataSource
            .getRepository(LessonProgress)
            .findOneByOrFail({ userId, lessonId });
    }
};
ProgressService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DatabaseService,
        CourseProgressCalculatorService,
        EnrollmentPolicy])
], ProgressService);
export { ProgressService };
//# sourceMappingURL=progress.service.js.map