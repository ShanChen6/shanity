import type { Readable } from 'node:stream';
export type MediaKind = 'document' | 'video';
export interface MediaUploadMetadata extends Record<string, unknown> {
    kind: MediaKind;
    contentType?: string;
    originalName?: string;
}
export interface StorageFileResult {
    filePath: string;
    size: number;
    contentType: string;
    checksumSha256: string;
    metadata: MediaUploadMetadata;
}
export interface MediaStorageDriver {
    readonly provider: 'LOCAL' | 'S3';
    upload(file: Express.Multer.File | Buffer, path: string, metadata?: MediaUploadMetadata): Promise<StorageFileResult>;
    delete(filePath: string): Promise<void>;
    getSignedUrl(filePath: string, expiresInSeconds: number): Promise<string>;
    getStream(filePath: string, range?: {
        start: number;
        end: number;
    }): Promise<Readable>;
}
