import type { Relation } from 'typeorm';
import { Chapter } from '../../../courses/chapter.entity.js';
export declare enum LessonType {
    TEXT = "TEXT",
    VIDEO = "VIDEO",
    DOCUMENT = "DOCUMENT"
}
export declare enum VideoProvider {
    LOCAL = "LOCAL",
    S3 = "S3",
    EXTERNAL_EMBED = "EXTERNAL_EMBED",
    YOUTUBE = "YOUTUBE",
    VIMEO = "VIMEO"
}
export declare enum MediaProcessingStatus {
    PROCESSING = "PROCESSING",
    READY = "READY"
}
export declare enum DocumentFileType {
    PDF = "PDF",
    SLIDE = "SLIDE",
    DOCX = "DOCX",
    OTHER = "OTHER"
}
export declare class Lesson {
    id: string;
    courseId: string;
    chapterId: string;
    chapter: Relation<Chapter>;
    title: string;
    slug: string;
    type: LessonType;
    position: number;
    isPreview: boolean;
    isPublished: boolean;
    textBody: string | null;
    videoAssetId: string | null;
    videoExternalUrl: string | null;
    videoProvider: VideoProvider | null;
    videoDurationSeconds: number | null;
    videoFileSize: string | null;
    videoMimeType: string | null;
    videoStatus: MediaProcessingStatus | null;
    documentAssetId: string | null;
    documentFileName: string | null;
    documentFileSize: string | null;
    documentMimeType: string | null;
    documentFileType: DocumentFileType | null;
    documentDownloadAllowed: boolean | null;
    createdAt: Date;
    updatedAt: Date;
}
