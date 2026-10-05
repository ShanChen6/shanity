import { CreateLessonDto, DocumentSettingsDto, DocumentUploadDto, ReorderLessonsDto, UpdateLessonDto, VideoUploadDto } from './dto/lessons.dto.js';
import { LessonsService } from './lessons.service.js';
export declare class LessonsController {
    private readonly lessons;
    constructor(lessons: LessonsService);
    create(chapterId: string, dto: CreateLessonDto): Promise<import("./entities/lesson.entity.js").Lesson>;
    uploadVideo(chapterId: string, dto: VideoUploadDto, file?: Express.Multer.File): Promise<import("./entities/lesson.entity.js").Lesson>;
    uploadDocument(chapterId: string, dto: DocumentUploadDto, file?: Express.Multer.File): Promise<import("./entities/lesson.entity.js").Lesson>;
    list(chapterId: string): Promise<import("./entities/lesson.entity.js").Lesson[]>;
    reorder(chapterId: string, dto: ReorderLessonsDto): Promise<import("./entities/lesson.entity.js").Lesson[]>;
    get(id: string): Promise<import("./entities/lesson.entity.js").Lesson>;
    update(id: string, dto: UpdateLessonDto): Promise<import("./entities/lesson.entity.js").Lesson>;
    replaceVideo(id: string, dto: VideoUploadDto, file?: Express.Multer.File): Promise<import("./entities/lesson.entity.js").Lesson>;
    replaceDocument(id: string, dto: DocumentUploadDto, file?: Express.Multer.File): Promise<import("./entities/lesson.entity.js").Lesson>;
    updateDocumentSettings(id: string, dto: DocumentSettingsDto): Promise<import("./entities/lesson.entity.js").Lesson>;
    remove(id: string): Promise<void>;
}
