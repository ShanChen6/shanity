import { LessonAccessService } from './lesson-access.service.js';
export declare class LessonAccessController {
    private readonly lessons;
    constructor(lessons: LessonAccessService);
    get(id: string): Promise<{
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
        type: import("./entities/lesson.entity.js").LessonType;
        position: number;
        isPreview: boolean;
        isPublished: boolean;
    }>;
}
