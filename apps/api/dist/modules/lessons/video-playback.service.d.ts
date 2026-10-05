import { DataSource } from 'typeorm';
import { CourseAccessService } from '../../courses/course-access.service.js';
import type { MediaStorageDriver } from '../../storage/media-storage.types.js';
export declare class VideoPlaybackService {
    private readonly accessPolicy;
    private readonly dataSource;
    private readonly mediaStorage;
    constructor(accessPolicy: CourseAccessService, dataSource: DataSource, mediaStorage: MediaStorageDriver);
    createAccess(userId: string | undefined, lessonId: string): Promise<{
        url: string;
        expiresInSeconds: null;
    } | {
        url: string;
        expiresInSeconds: number;
    }>;
    storedVideo(filePath: string): Promise<{
        size: number;
        contentType: string;
    }>;
    getStream(filePath: string, range?: {
        start: number;
        end: number;
    }): Promise<import("stream").Readable>;
    private accessTtl;
}
