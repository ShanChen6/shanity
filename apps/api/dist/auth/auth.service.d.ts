import type { EntityManager } from 'typeorm';
import { DatabaseService } from '../database/database.module.js';
import { AuthConfig } from './auth.config.js';
import type { ChangePasswordDto, CreateUserDto, UpdateUserDto, RegisterDto, LoginDto, ListUsersQueryDto, ChangeUserRoleDto, ChangeUserStatusDto } from './auth.dto.js';
export interface Principal {
    id: string;
    sessionId: string;
    roles: string[];
}
export declare const uniqueViolation: (error: unknown) => boolean;
export declare class AuthService {
    readonly database: DatabaseService;
    readonly config: AuthConfig;
    constructor(database: DatabaseService, config: AuthConfig);
    register(dto: RegisterDto): Promise<{
        access: string;
        refresh: string;
    }>;
    createUser(actor: Principal, dto: CreateUserDto): Promise<{
        id: string;
        email: string;
        displayName: string;
        status: string;
        roles: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    updateUser(actor: Principal, id: string, dto: UpdateUserDto): Promise<{
        id: string;
        email: string;
        displayName: string;
        status: string;
        roles: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    login(dto: LoginDto): Promise<{
        access: string;
        refresh: string;
    }>;
    changePassword(actor: Principal, dto: ChangePasswordDto): Promise<void>;
    issue(trx: EntityManager, userId: string): Promise<{
        access: string;
        refresh: string;
    }>;
    private access;
    refresh(token?: string): Promise<{
        access: string;
        refresh: string;
    }>;
    logout(token?: string): Promise<void>;
    authenticate(token?: string): Promise<Principal>;
    profile(id: string, db?: EntityManager): Promise<{
        id: string;
        email: string;
        displayName: string;
        hasPassword: boolean;
        avatarUrl: string | null;
        roles: string[];
    }>;
    userDetail(id: string, db?: EntityManager): Promise<{
        id: string;
        email: string;
        displayName: string;
        status: string;
        roles: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    private lockAdminMutation;
    changeUserStatus(actor: Principal, id: string, status: ChangeUserStatusDto['status']): Promise<{
        id: string;
        email: string;
        displayName: string;
        status: string;
        roles: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    changeUserRole(actor: Principal, id: string, role: ChangeUserRoleDto['role']): Promise<{
        id: string;
        email: string;
        displayName: string;
        status: string;
        roles: string[];
        createdAt: Date;
        updatedAt: Date;
    }>;
    userStatistics(): Promise<{
        totalUsers: number;
        students: number;
        instructors: number;
        admins: number;
        activeUsers: number;
    }>;
    listUsers({ page, limit, search, role, status }: ListUsersQueryDto): Promise<{
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
}
