import type { Knex } from 'knex';
import { DatabaseService } from '../database/database.module.js';
import { AuthConfig } from './auth.config.js';
import type { CreateUserDto, UpdateUserDto, RegisterDto, LoginDto, ListUsersQueryDto, ChangeUserRoleDto, ChangeUserStatusDto } from './auth.dto.js';
export interface Principal {
    id: string;
    sessionId: string;
    roles: string[];
}
export interface UserRow {
    id: string;
    email: string;
    display_name: string;
    password_hash: string | null;
    status: string;
}
export interface UserListRow {
    id: string;
    email: string;
    display_name: string;
    status: string;
    created_at: Date;
    update_at: Date;
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
    issue(trx: Knex.Transaction, userId: string): Promise<{
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
    profile(id: string, db?: Knex): Promise<{
        id: any;
        email: any;
        displayName: any;
        avatarUrl: string | null;
        roles: any[];
    }>;
    userDetail(id: string, db?: Knex): Promise<{
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
