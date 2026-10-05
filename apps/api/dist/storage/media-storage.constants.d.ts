export declare const MEDIA_STORAGE_DRIVER: unique symbol;
export declare const MEDIA_LIMITS: {
    readonly avatar: number;
    readonly document: number;
    readonly video: number;
};
export declare function maxVideoBytes(environment?: NodeJS.ProcessEnv): number;
export declare const MEDIA_MIME_TYPES: {
    readonly document: readonly ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip", "text/plain", "text/markdown"];
    readonly video: readonly ["video/mp4", "video/webm", "video/quicktime"];
};
