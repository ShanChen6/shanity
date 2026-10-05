import type { MediaStorageDriver } from './media-storage.types.js';
type StorageEnvironment = NodeJS.ProcessEnv;
export declare class MediaStorageFactory {
    create(environment?: StorageEnvironment): MediaStorageDriver;
}
export {};
