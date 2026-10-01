var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ConflictException, Injectable, UnauthorizedException, } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { DatabaseService } from '../database/database.module.js';
import { AuthConfig } from './auth.config.js';
import { digest, hashPassword, randomToken, verifyPassword, } from './password.js';
export const uniqueViolation = (error) => error?.code === '23505';
let AuthService = class AuthService {
    database;
    config;
    constructor(database, config) {
        this.database = database;
        this.config = config;
    }
    async register(dto) {
        const passwordHash = await hashPassword(dto.password);
        try {
            return await this.database.client.transaction(async (trx) => {
                const [user] = await trx('users')
                    .insert({
                    email: dto.email,
                    display_name: dto.displayName,
                    password_hash: passwordHash,
                })
                    .returning('*');
                await trx('user_roles').insert({
                    user_id: user.id,
                    role_code: 'student',
                });
                return this.issue(trx, user.id);
            });
        }
        catch (error) {
            if (uniqueViolation(error))
                throw new ConflictException('Email unavailable');
            throw error;
        }
    }
    async login(dto) {
        const user = await this.database
            .client('users')
            .where({ email: dto.email })
            .first();
        const valid = await verifyPassword(dto.password, user?.password_hash ?? null);
        if (!user || !valid || user.status !== 'active')
            throw new UnauthorizedException('Invalid credentials');
        return this.database.client.transaction(async (trx) => {
            const current = await trx('users')
                .where({ id: user.id })
                .forUpdate()
                .first();
            if (current?.status !== 'active')
                throw new UnauthorizedException('Invalid credentials');
            return this.issue(trx, user.id);
        });
    }
    async issue(trx, userId) {
        const refresh = randomToken();
        const [session] = await trx('auth_sessions')
            .insert({
            user_id: userId,
            refresh_hash: digest(refresh),
            expires_at: new Date(Date.now() + this.config.refreshSeconds * 1000),
        })
            .returning('id');
        return { access: await this.access(userId, session.id), refresh };
    }
    access(userId, sessionId) {
        return new SignJWT({ sid: sessionId })
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(userId)
            .setIssuer('shanity')
            .setAudience('shanity-api')
            .setIssuedAt()
            .setExpirationTime(`${this.config.accessSeconds}s`)
            .sign(this.config.secret);
    }
    async refresh(token) {
        if (!token || !/^[\w-]{43}$/.test(token))
            throw new UnauthorizedException();
        return this.database.client.transaction(async (trx) => {
            const session = await trx('auth_sessions')
                .where({ refresh_hash: digest(token) })
                .forUpdate()
                .first();
            if (!session ||
                session.revoked_at ||
                new Date(session.expires_at) <= new Date())
                throw new UnauthorizedException();
            const user = await trx('users')
                .where({ id: session.user_id })
                .forUpdate()
                .first();
            if (user?.status !== 'active')
                throw new UnauthorizedException();
            const refresh = randomToken();
            await trx('auth_sessions')
                .where({ id: session.id })
                .update({ refresh_hash: digest(refresh) });
            return {
                access: await this.access(user.id, session.id),
                refresh,
            };
        });
    }
    async logout(token) {
        if (token && /^[\w-]{43}$/.test(token))
            await this.database
                .client('auth_sessions')
                .where({ refresh_hash: digest(token) })
                .update({ revoked_at: new Date() });
    }
    async authenticate(token) {
        if (!token)
            throw new UnauthorizedException();
        let payload;
        try {
            ({ payload } = await jwtVerify(token, this.config.secret, {
                algorithms: ['HS256'],
                issuer: 'shanity',
                audience: 'shanity-api',
            }));
        }
        catch {
            throw new UnauthorizedException();
        }
        if (typeof payload.sub !== 'string' ||
            typeof payload.sid !== 'string' ||
            !/^[0-9a-f-]{36}$/.test(payload.sub) ||
            !/^[0-9a-f-]{36}$/.test(payload.sid))
            throw new UnauthorizedException();
        const session = await this.database
            .client('auth_sessions as s')
            .join('users as u', 'u.id', 's.user_id')
            .where({ 's.id': payload.sid, 'u.id': payload.sub, 'u.status': 'active' })
            .whereNull('s.revoked_at')
            .where('s.expires_at', '>', new Date())
            .first('u.id');
        if (!session)
            throw new UnauthorizedException();
        const roles = (await this.database
            .client('user_roles')
            .where({ user_id: session.id })
            .pluck('role_code'));
        return { id: session.id, sessionId: payload.sid, roles };
    }
    async profile(id) {
        const user = await this.database
            .client('users')
            .where({ id })
            .first('id', 'email', 'display_name');
        return {
            id: user.id,
            email: user.email,
            displayName: user.display_name,
            roles: await this.database
                .client('user_roles')
                .where({ user_id: id })
                .pluck('role_code'),
        };
    }
    async listUsers(page, limit) {
        const [{ count }] = await this.database
            .client('users')
            .count({ count: '*' });
        const total = Number(count);
        const rows = await this.database
            .client('users')
            .select('id', 'email', 'display_name', 'status', 'created_at')
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
            .limit(limit)
            .offset((page - 1) * limit);
        const ids = rows.map((row) => row.id);
        const roleRows = ids.length
            ? (await this.database
                .client('user_roles')
                .whereIn('user_id', ids)
                .select('user_id', 'role_code'))
            : [];
        const rolesByUser = new Map();
        for (const row of roleRows)
            rolesByUser.set(row.user_id, [
                ...(rolesByUser.get(row.user_id) ?? []),
                row.role_code,
            ]);
        return {
            items: rows.map((row) => ({
                id: row.id,
                email: row.email,
                displayName: row.display_name,
                status: row.status,
                roles: rolesByUser.get(row.id) ?? [],
                createdAt: row.created_at,
            })),
            page,
            limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        };
    }
};
AuthService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DatabaseService,
        AuthConfig])
], AuthService);
export { AuthService };
//# sourceMappingURL=auth.service.js.map