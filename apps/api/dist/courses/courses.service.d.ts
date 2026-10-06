import { CoursePublishabilityValidator } from './course-publishability.validator.js';
import { Course } from './course.entity.js';
import type { CreateCourseDto, UpdateCourseDto } from './courses.dto.js';
import type { Principal } from '../auth/auth.service.js';
import { DatabaseService } from '../database/database.module.js';
import type { PublicCourseQueryDto } from './public-courses.dto.js';
export declare class CoursesService {
    private readonly database;
    private readonly publishability;
    constructor(database: DatabaseService, publishability: CoursePublishabilityValidator);
    enroll(userId: string, courseId: string): Promise<{
        message: string;
        enrollmentId: string;
        enrolledAt: Date;
    }>;
    enrollmentStatus(userId: string, courseId: string): Promise<{
        isEnrolled: boolean;
        enrolledAt: Date;
    } | {
        isEnrolled: boolean;
        enrolledAt?: undefined;
    }>;
    create(principal: Principal, dto: CreateCourseDto): Promise<Course>;
    update(course: Course, dto: UpdateCourseDto): Promise<Course>;
    publish(id: string): Promise<Course>;
    unpublish(id: string): Promise<Course>;
    archive(id: string): Promise<Course>;
    listPublic({ page, limit, search, instructorId, sortBy, sortOrder, }: PublicCourseQueryDto): Promise<{
        data: {
            id: string;
            title: string;
            slug: string;
            shortDescription: string | null;
            thumbnail: string | null;
            publishedAt: Date | null;
            instructor: {
                id: string;
                displayName: string | null;
                avatar: string | null;
            } | null;
        }[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    getPublicBySlug(slug: string): Promise<{
        course: {
            id: string;
            title: string;
            slug: string;
            description: string | null;
            shortDescription: string | null;
            thumbnail: string | null;
            publishedAt: Date | null;
            isSequential: boolean;
        };
        instructor: {
            id: string;
            displayName: string | null;
            avatar: string | null;
            bio: null;
        } | null;
        curriculum: {
            id: string | null;
            title: string | null;
            description: string | null;
            orderIndex: number | null;
        }[];
    }>;
    getPublicSyllabus(slug: string): Promise<{
        curriculum: {
            lessons: {
                id: string;
                title: string;
                slug: string;
                type: string;
                position: number;
                isPreview: boolean;
                isRequired: boolean;
            }[];
            id: string | null;
            title: string | null;
            description: string | null;
            orderIndex: number | null;
        }[];
        course: {
            id: string;
            title: string;
            slug: string;
            description: string | null;
            shortDescription: string | null;
            thumbnail: string | null;
            publishedAt: Date | null;
            isSequential: boolean;
        };
        instructor: {
            id: string;
            displayName: string | null;
            avatar: string | null;
            bio: null;
        } | null;
    }>;
    private assertTransition;
    list(principal: Principal): Promise<Course[]>;
}
