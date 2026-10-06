import type { AuthRequest } from '../auth/auth.guards.js';
import { Course } from './course.entity.js';
import { CreateCourseDto, UpdateCourseDto } from './courses.dto.js';
import { PublicCourseQueryDto } from './public-courses.dto.js';
import { CoursesService } from './courses.service.js';
export declare class CoursesController {
    private readonly courses;
    constructor(courses: CoursesService);
    create(req: AuthRequest, dto: CreateCourseDto): Promise<Course>;
    list(req: AuthRequest): Promise<Course[]>;
    get(req: AuthRequest & {
        course: Course;
    }): Course;
    enroll(req: AuthRequest, courseId: string): Promise<{
        message: string;
        enrollmentId: string;
        enrolledAt: Date;
    }>;
    enrollmentStatus(req: AuthRequest, courseId: string): Promise<{
        isEnrolled: boolean;
        enrolledAt: Date;
    } | {
        isEnrolled: boolean;
        enrolledAt?: undefined;
    }>;
    update(req: AuthRequest & {
        course: Course;
    }, _id: string, dto: UpdateCourseDto): Promise<Course>;
    publish(id: string): Promise<Course>;
    unpublish(id: string): Promise<Course>;
    archive(id: string): Promise<Course>;
}
export declare class PublicCoursesController {
    private readonly courses;
    constructor(courses: CoursesService);
    list(query: PublicCourseQueryDto): Promise<{
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
    detail(slug: string): Promise<{
        course: {
            id: string;
            title: string;
            slug: string;
            description: string | null;
            shortDescription: string | null;
            thumbnail: string | null;
            publishedAt: Date | null;
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
    syllabus(slug: string): Promise<{
        curriculum: {
            lessons: {
                id: string;
                title: string;
                slug: string;
                type: string;
                position: number;
                isPreview: boolean;
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
        };
        instructor: {
            id: string;
            displayName: string | null;
            avatar: string | null;
            bio: null;
        } | null;
    }>;
}
