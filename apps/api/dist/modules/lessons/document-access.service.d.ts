import { DataSource } from 'typeorm';
import type { MediaStorageDriver } from '../../storage/media-storage.types.js';
export declare class DocumentAccessService {
    private readonly dataSource;
    private readonly mediaStorage;
    constructor(dataSource: DataSource, mediaStorage: MediaStorageDriver);
    open(lessonId: string, behavior: 'view' | 'download', bypass: boolean): Promise<{
        stream: import("stream").Readable;
        fileName: string;
        fileSize: number;
        mimeType: string;
    }>;
    private findDocument;
}
