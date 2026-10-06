import type { Request, Response } from 'express';
import { MediaUrlSigner } from '../../storage/media-url-signer.js';
import { VideoPlaybackService } from './video-playback.service.js';
export declare class VideoPlaybackController {
    private readonly playback;
    constructor(playback: VideoPlaybackService);
    access(id: string): Promise<{
        url: string;
        expiresInSeconds: null;
    } | {
        url: string;
        expiresInSeconds: number;
    }>;
}
export declare class LocalVideoDeliveryController {
    private readonly signer;
    private readonly playback;
    constructor(signer: MediaUrlSigner, playback: VideoPlaybackService);
    stream(path: string | string[], expiresValue: string | undefined, signature: string | undefined, request: Request, response: Response): Promise<void>;
    private parseRange;
}
