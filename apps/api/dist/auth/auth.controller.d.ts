import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { ListUsersQueryDto, LoginDto, ProfileDto, RegisterDto } from './auth.dto.js';
import { type AuthRequest } from './auth.guards.js';
import { GoogleService } from './google.service.js';
export declare class AuthController {
    private readonly auth;
    private readonly google;
    constructor(auth: AuthService, google: GoogleService);
    private write;
    register(dto: RegisterDto, res: Response): Promise<{
        authenticated: boolean;
    }>;
    login(dto: LoginDto, res: Response): Promise<{
        authenticated: boolean;
    }>;
    refresh(req: Request, res: Response): Promise<{
        authenticated: boolean;
    }>;
    logout(req: Request, res: Response): Promise<void>;
    googleLogin(res: Response): Promise<void>;
    googleLink(req: AuthRequest, res: Response): Promise<{
        url: string;
    }>;
    googleCallback(req: Request, res: Response): Promise<void>;
}
export declare class UsersController {
    private readonly auth;
    constructor(auth: AuthService);
    list(query: ListUsersQueryDto): Promise<{
        items: {
            id: string;
            email: string;
            displayName: string;
            status: string;
            roles: string[];
            createdAt: Date;
        }[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    }>;
    me(req: AuthRequest): Promise<{
        id: any;
        email: any;
        displayName: any;
        roles: any[];
    }>;
    update(req: AuthRequest, dto: ProfileDto): Promise<{
        id: any;
        email: any;
        displayName: any;
        roles: any[];
    }>;
    adminCheck(): {
        authorized: boolean;
    };
}
