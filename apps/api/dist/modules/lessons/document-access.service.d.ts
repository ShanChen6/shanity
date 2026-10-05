import { DataSource } from 'typeorm';
import type { Principal } from '../../auth/auth.service.js';
import { CourseAccessService } from '../../courses/course-access.service.js';
import type { MediaStorageDriver } from '../../storage/media-storage.types.js';
export declare class DocumentAccessService {
    private readonly accessPolicy;
    private readonly dataSource;
    private readonly mediaStorage;
    constructor(accessPolicy: CourseAccessService, dataSource: DataSource, mediaStorage: MediaStorageDriver);
    open(principal: Principal | undefined, lessonId: string, behavior: 'view' | 'download'): Promise<{
        stream: import("stream").Readable;
        fileName: string;
        fileSize: number;
        mimeType: string;
    }>;
    private findDocument;
}
