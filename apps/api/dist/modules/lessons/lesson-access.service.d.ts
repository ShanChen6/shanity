import { DataSource } from 'typeorm';
import { LessonType } from './entities/lesson.entity.js';
export declare class LessonAccessService {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    getAccessible(lessonId: string): Promise<{
        fileName?: string | null | undefined;
        fileSize?: string | null | undefined;
        fileType?: import("./entities/lesson.entity.js").DocumentFileType | null | undefined;
        mimeType?: string | null | undefined;
        allowDownload?: boolean | null | undefined;
        videoProvider?: import("./entities/lesson.entity.js").VideoProvider | null | undefined;
        videoExternalUrl?: string | null | undefined;
        durationSeconds?: number | null | undefined;
        content?: string | null | undefined;
        id: string;
        chapterId: string;
        title: string;
        slug: string;
        type: LessonType;
        position: number;
        isPreview: boolean;
        isPublished: boolean;
    }>;
}
