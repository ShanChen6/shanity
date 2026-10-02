import { StreamableFile } from '@nestjs/common';
import { type AuthRequest } from '../auth/auth.guards.js';
import { AvatarService } from './avatar.service.js';
import { AvatarStorage } from './avatar-storage.js';
export declare class AvatarController {
    private readonly avatars;
    constructor(avatars: AvatarService);
    uploadAvatar(req: AuthRequest, file?: Express.Multer.File): Promise<{
        id: string;
        email: string;
        displayName: string;
        hasPassword: boolean;
        avatarUrl: string | null;
        roles: string[];
    }>;
    removeAvatar(req: AuthRequest): Promise<{
        id: string;
        email: string;
        displayName: string;
        hasPassword: boolean;
        avatarUrl: string | null;
        roles: string[];
    }>;
}
export declare class AvatarFilesController {
    private readonly storage;
    constructor(storage: AvatarStorage);
    image(key: string): Promise<StreamableFile>;
}
