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
    update(req: AuthRequest & {
        course: Course;
    }, _id: string, dto: UpdateCourseDto): Promise<Course>;
    publish(id: string): Promise<Course>;
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
}
