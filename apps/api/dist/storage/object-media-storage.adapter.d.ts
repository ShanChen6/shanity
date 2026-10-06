import type { Readable } from 'node:stream';
import type { MediaStorageDriver, MediaUploadMetadata, StorageFileResult } from './media-storage.types.js';
export declare class ObjectMediaStorageAdapter implements MediaStorageDriver {
    readonly provider: "S3";
    private unavailable;
    upload(_file: Express.Multer.File | Buffer, _path: string, _metadata?: MediaUploadMetadata): Promise<StorageFileResult>;
    delete(_filePath: string): Promise<void>;
    getSignedUrl(_filePath: string, _expiresInSeconds: number): Promise<string>;
    getStream(_filePath: string, _range?: {
        start: number;
        end: number;
    }): Promise<Readable>;
}
