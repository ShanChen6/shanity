var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BadRequestException, ConflictException, Injectable, NotFoundException, } from '@nestjs/common';
import { CoursePublishabilityValidator } from './course-publishability.validator.js';
import { CourseStatus } from './course-status.js';
import { Course } from './course.entity.js';
import { Chapter } from './chapter.entity.js';
import { assertCourseTransition, InvalidCourseTransitionError, } from './course-lifecycle.js';
import { DatabaseService } from '../database/database.module.js';
import { User } from '../users/user.entity.js';
const uniqueViolation = (error) => error?.code === '23505';
let CoursesService = class CoursesService {
    database;
    publishability;
    constructor(database, publishability) {
        this.database = database;
        this.publishability = publishability;
    }
    async create(principal, dto) {
        const repository = this.database.dataSource.getRepository(Course);
        try {
            return await repository.save(repository.create({
                title: dto.title,
                slug: dto.slug,
                description: dto.description,
                shortDescription: dto.shortDescription,
                thumbnail: dto.thumbnail,
                ownerId: principal.id,
                status: CourseStatus.DRAFT,
            }));
        }
        catch (error) {
            if (uniqueViolation(error))
                throw new ConflictException('Course slug already exists');
            throw error;
        }
    }
    async update(course, dto) {
        const repository = this.database.dataSource.getRepository(Course);
        try {
            return await repository.save(repository.merge(course, dto));
        }
        catch (error) {
            if (uniqueViolation(error))
                throw new ConflictException('Course slug already exists');
            throw error;
        }
    }
    async publish(id) {
        return this.database.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(Course);
            const course = await repository.findOne({
                where: { id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!course)
                throw new NotFoundException('Course not found');
            this.assertTransition(course.status, CourseStatus.PUBLISHED);
            const [facts] = await manager.query(`SELECT
          (SELECT count(*) FROM course_sections WHERE course_id = $1)::integer AS section_count,
          (SELECT count(*) FROM course_sections AS section
            WHERE section.course_id = $1
              AND NOT EXISTS (
                SELECT 1 FROM lessons
                WHERE lessons.section_id = section.id
                  AND lessons.course_id = section.course_id
              ))::integer AS sections_without_lessons,
          (SELECT count(*) FROM lessons WHERE course_id = $1)::integer AS lesson_count,
          (SELECT count(*) FROM lessons
            WHERE course_id = $1
              AND NULLIF(btrim(body), '') IS NULL
              AND NULLIF(btrim(video_storage_key), '') IS NULL)::integer AS lessons_without_content`, [id]);
            const errors = this.publishability.validate(course, {
                sectionCount: Number(facts.section_count),
                sectionsWithoutLessons: Number(facts.sections_without_lessons),
                lessonCount: Number(facts.lesson_count),
                lessonsWithoutContent: Number(facts.lessons_without_content),
            });
            if (errors.length)
                throw new BadRequestException({
                    message: 'Course is not ready to publish',
                    errors,
                });
            course.status = CourseStatus.PUBLISHED;
            course.publishedAt = new Date();
            return repository.save(course);
        });
    }
    async archive(id) {
        return this.database.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(Course);
            const course = await repository.findOne({
                where: { id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!course)
                throw new NotFoundException('Course not found');
            this.assertTransition(course.status, CourseStatus.ARCHIVED);
            course.status = CourseStatus.ARCHIVED;
            return repository.save(course);
        });
    }
    async listPublic({ page, limit, search, instructorId, sortBy, sortOrder, }) {
        const query = this.database.dataSource
            .getRepository(Course)
            .createQueryBuilder('course')
            .leftJoin(User, 'instructor', 'instructor.id = course.instructorId')
            .where('course.status = :publishedStatus', {
            publishedStatus: CourseStatus.PUBLISHED,
        });
        if (search) {
            query.andWhere('(course.title ILIKE :search OR course.shortDescription ILIKE :search)', { search: `%${search.replace(/[\\%_]/g, '\\$&')}%` });
        }
        if (instructorId)
            query.andWhere('course.instructorId = :instructorId', { instructorId });
        const total = await query.clone().getCount();
        const sortColumn = sortBy === 'createdAt' ? 'course.createdAt' : 'course.publishedAt';
        const rows = await query
            .select('course.id', 'id')
            .addSelect('course.title', 'title')
            .addSelect('course.slug', 'slug')
            .addSelect('course.shortDescription', 'shortDescription')
            .addSelect('course.thumbnail', 'thumbnail')
            .addSelect('course.publishedAt', 'publishedAt')
            .addSelect('instructor.id', 'instructorId')
            .addSelect('instructor.displayName', 'instructorDisplayName')
            .addSelect('instructor.avatarKey', 'instructorAvatarKey')
            .orderBy(sortColumn, sortOrder)
            .addOrderBy('course.id', 'ASC')
            .offset((page - 1) * limit)
            .limit(limit)
            .getRawMany();
        return {
            data: rows.map((course) => ({
                id: course.id,
                title: course.title,
                slug: course.slug,
                shortDescription: course.shortDescription,
                thumbnail: course.thumbnail,
                publishedAt: course.publishedAt,
                instructor: course.instructorId
                    ? {
                        id: course.instructorId,
                        displayName: course.instructorDisplayName,
                        avatar: course.instructorAvatarKey
                            ? `/avatars/${course.instructorAvatarKey}`
                            : null,
                    }
                    : null,
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async getPublicBySlug(slug) {
        const rows = await this.database.dataSource
            .getRepository(Course)
            .createQueryBuilder('course')
            .leftJoin(User, 'instructor', 'instructor.id = COALESCE(course.instructorId, course.ownerId)')
            .leftJoin(Chapter, 'chapter', 'chapter.courseId = course.id')
            .select('course.id', 'courseId')
            .addSelect('course.title', 'title')
            .addSelect('course.slug', 'slug')
            .addSelect('course.description', 'description')
            .addSelect('course.shortDescription', 'shortDescription')
            .addSelect('course.thumbnail', 'thumbnail')
            .addSelect('course.publishedAt', 'publishedAt')
            .addSelect('instructor.id', 'instructorId')
            .addSelect('instructor.displayName', 'instructorDisplayName')
            .addSelect('instructor.avatarKey', 'instructorAvatarKey')
            .addSelect('chapter.id', 'chapterId')
            .addSelect('chapter.title', 'chapterTitle')
            .addSelect('chapter.description', 'chapterDescription')
            .addSelect('chapter.position', 'chapterPosition')
            .where('course.slug = :slug', { slug })
            .andWhere('course.status = :publishedStatus', {
            publishedStatus: CourseStatus.PUBLISHED,
        })
            .orderBy('chapter.position', 'ASC')
            .addOrderBy('chapter.id', 'ASC')
            .getRawMany();
        if (!rows.length)
            throw new NotFoundException('Course not found');
        const course = rows[0];
        return {
            course: {
                id: course.courseId,
                title: course.title,
                slug: course.slug,
                description: course.description,
                shortDescription: course.shortDescription,
                thumbnail: course.thumbnail,
                publishedAt: course.publishedAt,
            },
            instructor: course.instructorId
                ? {
                    id: course.instructorId,
                    displayName: course.instructorDisplayName,
                    avatar: course.instructorAvatarKey
                        ? `/avatars/${course.instructorAvatarKey}`
                        : null,
                    bio: null,
                }
                : null,
            curriculum: rows
                .filter((row) => row.chapterId !== null)
                .map((row) => ({
                id: row.chapterId,
                title: row.chapterTitle,
                description: row.chapterDescription,
                orderIndex: row.chapterPosition,
            })),
        };
    }
    assertTransition(current, next) {
        try {
            assertCourseTransition(current, next);
        }
        catch (error) {
            if (error instanceof InvalidCourseTransitionError)
                throw new ConflictException(error.message);
            throw error;
        }
    }
    list(principal) {
        const query = this.database.dataSource
            .getRepository(Course)
            .createQueryBuilder('course');
        if (principal.roles.includes('admin')) {
            return query
                .orderBy('course.createdAt', 'DESC')
                .addOrderBy('course.id', 'DESC')
                .getMany();
        }
        if (principal.roles.includes('instructor')) {
            query.where('course.ownerId = :ownerId', { ownerId: principal.id });
        }
        else {
            query.where('course.status = :status', { status: CourseStatus.PUBLISHED });
        }
        return query
            .orderBy('course.createdAt', 'DESC')
            .addOrderBy('course.id', 'DESC')
            .getMany();
    }
};
CoursesService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DatabaseService,
        CoursePublishabilityValidator])
], CoursesService);
export { CoursesService };
//# sourceMappingURL=courses.service.js.map