import type { Knex } from 'knex';
import { DatabaseService } from '../database/database.module.js';
import { AuthConfig } from './auth.config.js';
import type { RegisterDto, LoginDto } from './auth.dto.js';
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
    profile(id: string): Promise<{
        id: any;
        email: any;
        displayName: any;
        roles: any[];
    }>;
    listUsers(page: number, limit: number): Promise<{
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
}
