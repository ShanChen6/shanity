import type { AuthRequest } from '../auth/auth.guards.js';
import { CreateCourseDto } from './courses.dto.js';
import { CoursesService } from './courses.service.js';
export declare class CoursesController {
    private readonly courses;
    constructor(courses: CoursesService);
    create(req: AuthRequest, dto: CreateCourseDto): Promise<import("./course.entity.js").Course>;
    list(req: AuthRequest): Promise<import("./course.entity.js").Course[]>;
    get(req: AuthRequest, id: string): Promise<import("./course.entity.js").Course>;
}
