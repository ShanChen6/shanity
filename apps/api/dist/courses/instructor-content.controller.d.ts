import { StreamableFile } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type AuthRequest } from '../auth/auth.guards.js';
import { Course } from './course.entity.js';
declare class LessonDto {
    title: string;
    type: string;
    body?: string;
    videoUrl?: string;
}
declare class LessonOrderDto {
    ids: string[];
}
type OwnedRequest = AuthRequest & {
    course: Course;
};
export declare class InstructorContentController {
    private readonly database;
    constructor(database: DataSource);
    private chapter;
    list(req: OwnedRequest): Promise<any>;
    create(req: OwnedRequest, chapterId: string, dto: LessonDto): Promise<any>;
    reorder(req: OwnedRequest, chapterId: string, dto: LessonOrderDto): Promise<any>;
    update(req: OwnedRequest, id: string, dto: LessonDto): Promise<any>;
    remove(req: OwnedRequest, id: string): Promise<void>;
    upload(req: OwnedRequest, file?: Express.Multer.File): Promise<{
        url: string;
    }>;
}
export declare class CourseMediaController {
    private readonly database;
    constructor(database: DataSource);
    read(id: string): Promise<StreamableFile>;
}
export {};
