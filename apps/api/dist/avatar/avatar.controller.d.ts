import { StreamableFile } from '@nestjs/common';
import { type AuthRequest } from '../auth/auth.guards.js';
import { AvatarService } from './avatar.service.js';
import { AvatarStorage } from './avatar-storage.js';
export declare class AvatarController {
    private readonly avatars;
    constructor(avatars: AvatarService);
    uploadAvatar(req: AuthRequest, file?: Express.Multer.File): Promise<{
        id: any;
        email: any;
        displayName: any;
        avatarUrl: string | null;
        roles: any[];
    }>;
    removeAvatar(req: AuthRequest): Promise<{
        id: any;
        email: any;
        displayName: any;
        avatarUrl: string | null;
        roles: any[];
    }>;
}
export declare class AvatarFilesController {
    private readonly storage;
    constructor(storage: AvatarStorage);
    image(key: string): Promise<StreamableFile>;
}
