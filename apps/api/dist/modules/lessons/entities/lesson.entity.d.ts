import type { Relation } from 'typeorm';
import { Chapter } from '../../../courses/chapter.entity.js';
export declare enum LessonType {
    TEXT = "TEXT",
    VIDEO = "VIDEO",
    DOCUMENT = "DOCUMENT"
}
export declare enum VideoProvider {
    S3 = "S3",
    YOUTUBE = "YOUTUBE",
    VIMEO = "VIMEO"
}
export declare enum MediaProcessingStatus {
    PROCESSING = "PROCESSING",
    READY = "READY"
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
    videoStatus: MediaProcessingStatus | null;
    documentAssetId: string | null;
    documentFileName: string | null;
    documentFileSize: string | null;
    documentDownloadAllowed: boolean | null;
    createdAt: Date;
    updatedAt: Date;
}
