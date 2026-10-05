import { LessonType } from '../entities/lesson.entity.js';
export declare class LessonContentDto {
    textBody?: string;
    videoUrl?: string;
    videoAssetId?: string;
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
