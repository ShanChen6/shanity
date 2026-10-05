import { DataSource } from 'typeorm';
import type { MediaStorageDriver } from '../../storage/media-storage.types.js';
export declare class VideoPlaybackService {
    private readonly dataSource;
    private readonly mediaStorage;
    constructor(dataSource: DataSource, mediaStorage: MediaStorageDriver);
    createAccess(lessonId: string): Promise<{
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
