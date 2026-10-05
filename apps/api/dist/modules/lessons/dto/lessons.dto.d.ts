import { LessonType } from '../entities/lesson.entity.js';
export declare class LessonContentDto {
    textBody?: string;
    videoUrl?: string;
    documentAssetId?: string;
    documentFileName?: string;
    documentFileSize?: number;
    documentDownloadAllowed?: boolean;
}
export declare class CreateLessonDto {
    title: string;
    type: LessonType;
    isPreview?: boolean;
    content: LessonContentDto;
    position?: number;
}
export declare class UpdateLessonDto {
    title?: string;
    type?: LessonType;
    isPreview?: boolean;
    content?: LessonContentDto;
    position?: number;
}
export declare class LessonOrderDto {
    id: string;
    position: number;
}
export declare class ReorderLessonsDto {
    lessonOrders: LessonOrderDto[];
}
export declare class VideoUploadDto {
    title?: string;
    isPreview?: boolean;
    durationSeconds?: number;
}
export declare class DocumentUploadDto {
    title?: string;
    isPreview?: boolean;
    allowDownload?: boolean;
}
export declare class DocumentSettingsDto {
    allowDownload: boolean;
}
