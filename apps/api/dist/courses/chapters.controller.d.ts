import type { AuthRequest } from '../auth/auth.guards.js';
import type { Course } from './course.entity.js';
import { CreateChapterDto, ReorderChaptersDto, UpdateChapterDto } from './chapters.dto.js';
import { ChaptersService } from './chapters.service.js';
type CourseRequest = AuthRequest & {
    course: Course;
};
export declare class ChaptersController {
    private readonly chapters;
    constructor(chapters: ChaptersService);
    create(req: CourseRequest, dto: CreateChapterDto): Promise<import("./chapter.entity.js").Chapter>;
    list(req: CourseRequest): Promise<import("./chapter.entity.js").Chapter[]>;
    reorder(req: CourseRequest, dto: ReorderChaptersDto): Promise<import("./chapter.entity.js").Chapter[]>;
    update(id: string, dto: UpdateChapterDto): Promise<import("./chapter.entity.js").Chapter>;
    remove(id: string): Promise<void>;
}
export {};
