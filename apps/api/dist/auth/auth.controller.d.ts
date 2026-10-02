import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { CreateUserDto, ChangePasswordDto, UpdateUserDto, ChangeUserRoleDto, ChangeUserStatusDto, ListUsersQueryDto, LoginDto, ProfileDto, RegisterDto } from './auth.dto.js';
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
            updatedAt: Date;
        }[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    }>;
    create(req: AuthRequest, dto: CreateUserDto): Promise<{
        id: string;
        email: string;
        displayName: string;
        status: string;
        roles: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    me(req: AuthRequest): Promise<{
        id: string;
        email: string;
        displayName: string;
        hasPassword: boolean;
        avatarUrl: string | null;
        roles: string[];
    }>;
    update(req: AuthRequest, dto: ProfileDto): Promise<{
        id: string;
        email: string;
        displayName: string;
        hasPassword: boolean;
        avatarUrl: string | null;
        roles: string[];
    }>;
    changePassword(req: AuthRequest, dto: ChangePasswordDto, res: Response): Promise<void>;
    adminCheck(): {
        authorized: boolean;
    };
    changeRole(req: AuthRequest, id: string, dto: ChangeUserRoleDto): Promise<{
        id: string;
        email: string;
        displayName: string;
        status: string;
        roles: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    changeStatus(req: AuthRequest, id: string, dto: ChangeUserStatusDto): Promise<{
        id: string;
        email: string;
        displayName: string;
        status: string;
        roles: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    statistics(): Promise<{
        totalUsers: number;
        students: number;
        instructors: number;
        admins: number;
        activeUsers: number;
    }>;
    edit(req: AuthRequest, id: string, dto: UpdateUserDto): Promise<{
        id: string;
        email: string;
        displayName: string;
        status: string;
        roles: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    detail(id: string): Promise<{
        id: string;
        email: string;
        displayName: string;
        status: string;
        roles: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
}
