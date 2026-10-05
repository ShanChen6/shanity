import type { MediaUploadMetadata } from './media-storage.types.js';
export interface ValidatedMediaFile {
    buffer: Buffer;
    contentType: string;
    originalName: string;
    metadata: MediaUploadMetadata;
}
export declare function validateMediaFile(file: Express.Multer.File | Buffer, metadata?: MediaUploadMetadata): Promise<ValidatedMediaFile>;
