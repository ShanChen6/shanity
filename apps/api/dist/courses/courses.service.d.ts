import { Course } from './course.entity.js';
import type { CreateCourseDto } from './courses.dto.js';
import type { Principal } from '../auth/auth.service.js';
import { DatabaseService } from '../database/database.module.js';
export declare class CoursesService {
    private readonly database;
    constructor(database: DatabaseService);
    create(principal: Principal, dto: CreateCourseDto): Promise<Course>;
    list(principal: Principal): Promise<Course[]>;
    get(principal: Principal, id: string): Promise<Course>;
}
