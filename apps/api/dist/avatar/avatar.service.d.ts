import { DatabaseService } from '../database/database.module.js';
import { AuthService } from '../auth/auth.service.js';
import { AvatarStorage } from './avatar-storage.js';
export declare const MAX_AVATAR_BYTES: number;
export declare function normalizeAvatar(file?: Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'size'>): Promise<Buffer<ArrayBuffer>>;
export declare class AvatarService {
    private readonly database;
    private readonly auth;
    private readonly storage;
    private readonly logger;
    constructor(database: DatabaseService, auth: AuthService, storage: AvatarStorage);
    private cleanup;
    upload(id: string, file?: Express.Multer.File): Promise<{
        id: any;
        email: any;
        displayName: any;
        avatarUrl: string | null;
        roles: any[];
    }>;
    remove(id: string): Promise<{
        id: any;
        email: any;
        displayName: any;
        avatarUrl: string | null;
        roles: any[];
    }>;
    private replace;
}
