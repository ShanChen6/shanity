import type { Request, Response } from 'express';
import { AuthConfig } from '../../auth/auth.config.js';
import { AuthService } from '../../auth/auth.service.js';
import { MediaUrlSigner } from '../../storage/media-url-signer.js';
import { VideoPlaybackService } from './video-playback.service.js';
export declare class VideoPlaybackController {
    private readonly auth;
    private readonly config;
    private readonly playback;
    constructor(auth: AuthService, config: AuthConfig, playback: VideoPlaybackService);
    access(request: Request, id: string): Promise<{
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
