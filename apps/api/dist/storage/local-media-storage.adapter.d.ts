import type { Readable } from 'node:stream';
import type { MediaStorageDriver, MediaUploadMetadata, StorageFileResult } from './media-storage.types.js';
export interface LocalMediaStorageOptions {
    root: string;
    signingSecret: string;
    deliveryPath?: string;
}
export declare class LocalMediaStorageAdapter implements MediaStorageDriver {
    private readonly options;
    readonly provider: "LOCAL";
    private readonly root;
    private readonly deliveryPath;
    private readonly signer;
    constructor(options: LocalMediaStorageOptions);
    upload(file: Express.Multer.File | Buffer, path: string, metadata?: MediaUploadMetadata): Promise<StorageFileResult>;
    delete(filePath: string): Promise<void>;
    getSignedUrl(filePath: string, expiresInSeconds: number): Promise<string>;
    getStream(filePath: string, range?: {
        start: number;
        end: number;
    }): Promise<Readable>;
    private ensureExists;
    private normalizeKey;
    private resolvePath;
}
