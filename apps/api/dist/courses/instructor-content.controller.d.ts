import { StreamableFile } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { type AuthRequest } from '../auth/auth.guards.js';
import { Course } from './course.entity.js';
import { LessonsService } from '../modules/lessons/lessons.service.js';
declare class LessonDto {
    title: string;
    type: string;
    body?: string;
    videoUrl?: string;
    isPreview?: boolean;
}
declare class LessonOrderDto {
    ids: string[];
}
type OwnedRequest = AuthRequest & {
    course: Course;
};
export declare class InstructorContentController {
    private readonly database;
    private readonly lessons;
    constructor(database: DataSource, lessons: LessonsService);
    private assertLessonInCourse;
    private assertChapterInCourse;
    private chapter;
    list(req: OwnedRequest): Promise<any>;
    create(req: OwnedRequest, chapterId: string, dto: LessonDto): Promise<{
        id: string;
        chapterId: string;
        title: string;
        type: string;
        body: string;
        videoUrl: string | null;
        isPreview: boolean;
        position: number;
    }>;
    reorder(req: OwnedRequest, chapterId: string, dto: LessonOrderDto): Promise<any>;
    update(req: OwnedRequest, id: string, dto: LessonDto): Promise<{
        id: string;
        chapterId: string;
        title: string;
        type: string;
        body: string;
        videoUrl: string | null;
        isPreview: boolean;
        position: number;
    }>;
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
