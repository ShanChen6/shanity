import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import type { Knex } from 'knex';
import { DatabaseService } from '../database/database.module.js';
import { AuthConfig } from './auth.config.js';
import {
  digest,
  hashPassword,
  randomToken,
  verifyPassword,
} from './password.js';
import type {
  ChangePasswordDto,
  CreateUserDto,
  UpdateUserDto,
  RegisterDto,
  LoginDto,
  ListUsersQueryDto,
  ChangeUserRoleDto,
  ChangeUserStatusDto,
} from './auth.dto.js';

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
export const uniqueViolation = (error: unknown) =>
  (error as { code?: string })?.code === '23505';

@Injectable()
export class AuthService {
  constructor(
    readonly database: DatabaseService,
    readonly config: AuthConfig,
  ) {}
  async register(dto: RegisterDto) {
    const passwordHash = await hashPassword(dto.password);
    try {
      return await this.database.client.transaction(async (trx) => {
        const [user] = await trx<UserRow>('users')
          .insert({
            email: dto.email,
            display_name: dto.displayName,
            password_hash: passwordHash,
          })
          .returning('*');
        await trx('user_roles').insert({
          user_id: user!.id,
          role_code: 'student',
        });
        return this.issue(trx, user!.id);
      });
    } catch (error) {
      if (uniqueViolation(error))
        throw new ConflictException('Email unavailable');
      throw error;
    }
  }
  async createUser(actor: Principal, dto: CreateUserDto) {
    const passwordHash = await hashPassword(dto.password);
    try {
      return await this.database.client.transaction(async (trx) => {
        await this.lockAdminMutation(trx, actor);
        const [user] = await trx<UserRow>('users')
          .insert({
            email: dto.email,
            display_name: dto.displayName,
            password_hash: passwordHash,
          })
          .returning('id');
        await trx('user_roles').insert({
          user_id: user!.id,
          role_code: dto.role.toLowerCase(),
        });
        return this.userDetail(user!.id, trx);
      });
    } catch (error) {
      if (uniqueViolation(error))
        throw new ConflictException('Email đã được sử dụng.');
      throw error;
    }
  }
  async updateUser(actor: Principal, id: string, dto: UpdateUserDto) {
    try {
      return await this.database.client.transaction(async (trx) => {
        await this.lockAdminMutation(trx, actor);
        const count = await trx('users').where({ id }).update({
          email: dto.email,
          display_name: dto.displayName,
        });
        if (!count) throw new NotFoundException('User not found');
        return this.userDetail(id, trx);
      });
    } catch (error) {
      if (uniqueViolation(error))
        throw new ConflictException('Email đã được sử dụng.');
      throw error;
    }
  }
  async login(dto: LoginDto) {
    const user = await this.database
      .client<UserRow>('users')
      .where({ email: dto.email })
      .first();
    const valid = await verifyPassword(
      dto.password,
      user?.password_hash ?? null,
    );
    if (!user || !valid || user.status !== 'active')
      throw new UnauthorizedException('Invalid credentials');
    return this.database.client.transaction(async (trx) => {
      const current = await trx<UserRow>('users')
        .where({ id: user.id })
        .forUpdate()
        .first();
      if (current?.status !== 'active')
        throw new UnauthorizedException('Invalid credentials');
      return this.issue(trx, user.id);
    });
  }
  async changePassword(actor: Principal, dto: ChangePasswordDto) {
    await this.database.client.transaction(async (trx) => {
      // Match refresh's session -> user lock order; revoke atomically with the write.
      const session = await trx('auth_sessions')
        .where({ id: actor.sessionId, user_id: actor.id })
        .forUpdate()
        .first();
      if (
        !session ||
        session.revoked_at ||
        new Date(session.expires_at) <= new Date()
      )
        throw new UnauthorizedException();
      const user = await trx<UserRow>('users')
        .where({ id: actor.id })
        .forUpdate()
        .first();
      if (!user || user.status !== 'active') throw new UnauthorizedException();
      if (!user.password_hash)
        throw new BadRequestException(
          'Tài khoản này đăng nhập bằng Google và chưa có mật khẩu.',
        );
      if (!(await verifyPassword(dto.currentPassword, user.password_hash)))
        throw new BadRequestException('Mật khẩu hiện tại không đúng.');
      if (dto.newPassword === dto.currentPassword)
        throw new BadRequestException(
          'Mật khẩu mới phải khác mật khẩu hiện tại.',
        );
      await trx('users')
        .where({ id: actor.id })
        .update({
          password_hash: await hashPassword(dto.newPassword),
        });
      await trx('auth_sessions')
        .where({ id: actor.sessionId })
        .update({ revoked_at: trx.fn.now() });
    });
  }
  async issue(trx: Knex.Transaction, userId: string) {
    const refresh = randomToken();
    const [session] = await trx('auth_sessions')
      .insert({
        user_id: userId,
        refresh_hash: digest(refresh),
        expires_at: new Date(Date.now() + this.config.refreshSeconds * 1000),
      })
      .returning('id');
    return { access: await this.access(userId, session.id as string), refresh };
  }
  private access(userId: string, sessionId: string) {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer('shanity')
      .setAudience('shanity-api')
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessSeconds}s`)
      .sign(this.config.secret);
  }
  async refresh(token?: string) {
    if (!token || !/^[\w-]{43}$/.test(token)) throw new UnauthorizedException();
    return this.database.client.transaction(async (trx) => {
      const session = await trx('auth_sessions')
        .where({ refresh_hash: digest(token) })
        .forUpdate()
        .first();
      if (
        !session ||
        session.revoked_at ||
        new Date(session.expires_at) <= new Date()
      )
        throw new UnauthorizedException();
      const user = await trx<UserRow>('users')
        .where({ id: session.user_id })
        .forUpdate()
        .first();
      if (user?.status !== 'active') throw new UnauthorizedException();
      const refresh = randomToken();
      await trx('auth_sessions')
        .where({ id: session.id })
        .update({ refresh_hash: digest(refresh) });
      return {
        access: await this.access(user.id, session.id as string),
        refresh,
      };
    });
  }
  async logout(token?: string) {
    if (token && /^[\w-]{43}$/.test(token))
      await this.database
        .client('auth_sessions')
        .where({ refresh_hash: digest(token) })
        .update({ revoked_at: new Date() });
  }
  async authenticate(token?: string): Promise<Principal> {
    if (!token) throw new UnauthorizedException();
    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.config.secret, {
        algorithms: ['HS256'],
        issuer: 'shanity',
        audience: 'shanity-api',
      }));
    } catch {
      throw new UnauthorizedException();
    }
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(payload.sub) ||
      !/^[0-9a-f-]{36}$/.test(payload.sid)
    )
      throw new UnauthorizedException();
    const session = await this.database
      .client('auth_sessions as s')
      .join('users as u', 'u.id', 's.user_id')
      .where({ 's.id': payload.sid, 'u.id': payload.sub, 'u.status': 'active' })
      .whereNull('s.revoked_at')
      .where('s.expires_at', '>', new Date())
      .first('u.id');
    if (!session) throw new UnauthorizedException();
    const roles = (await this.database
      .client('user_roles')
      .where({ user_id: session.id })
      .pluck('role_code')) as string[];
    return { id: session.id as string, sessionId: payload.sid, roles };
  }
  async profile(id: string, db: Knex = this.database.client) {
    const user = await db('users')
      .where({ id })
      .first('id', 'email', 'display_name', 'avatar_key', 'password_hash');
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      hasPassword: Boolean(user.password_hash),
      avatarUrl: user.avatar_key ? `/avatars/${user.avatar_key}` : null,
      roles: await db('user_roles').where({ user_id: id }).pluck('role_code'),
    };
  }
  async userDetail(id: string, db: Knex = this.database.client) {
    const user = await db<UserListRow>('users')
      .where({ id })
      .first(
        'id',
        'email',
        'display_name',
        'status',
        'created_at',
        'update_at',
      );
    if (!user) throw new NotFoundException('User not found');
    const roles = await db('user_roles')
      .where({ user_id: id })
      .orderBy('role_code')
      .pluck<string[]>('role_code');
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      status: user.status,
      roles,
      createdAt: user.created_at,
      updatedAt: user.update_at,
    };
  }
  private async lockAdminMutation(trx: Knex.Transaction, actor: Principal) {
    // Admin mutations share this lock; recheck authority after waiting.
    await trx.raw('SELECT pg_advisory_xact_lock(73104, 7)');
    const actorUser = await trx('users')
      .where({ id: actor.id, status: 'active' })
      .forUpdate()
      .first('id');
    const actorRole = await trx('user_roles')
      .where({ user_id: actor.id, role_code: 'admin' })
      .first('user_id');
    if (!actorUser || !actorRole)
      throw new ForbiddenException('Bạn không còn quyền quản trị.');
  }
  async changeUserStatus(
    actor: Principal,
    id: string,
    status: ChangeUserStatusDto['status'],
  ) {
    return this.database.client.transaction(async (trx) => {
      await this.lockAdminMutation(trx, actor);
      const target = await trx('users')
        .where({ id })
        .forUpdate()
        .first('id', 'status');
      if (!target) throw new NotFoundException('User not found');
      const nextStatus = status.toLowerCase();
      if (id === actor.id && nextStatus === 'disabled') {
        throw new ConflictException(
          'Không thể vô hiệu hóa tài khoản quản trị đang sử dụng.',
        );
      }
      if (nextStatus === 'disabled') {
        const targetAdmin = await trx('user_roles')
          .where({ user_id: id, role_code: 'admin' })
          .first('user_id');
        if (targetAdmin) {
          const otherAdmin = await trx('users as u')
            .join('user_roles as r', 'r.user_id', 'u.id')
            .where({ 'u.status': 'active', 'r.role_code': 'admin' })
            .whereNot('u.id', id)
            .first('u.id');
          if (!otherAdmin)
            throw new ConflictException(
              'Phải giữ ít nhất một quản trị viên hoạt động.',
            );
        }
      }
      if (target.status !== nextStatus) {
        // The existing user trigger advances update_at. Roles and user data remain intact.
        await trx('users').where({ id }).update({ status: nextStatus });
      }
      return this.userDetail(id, trx);
    });
  }
  async changeUserRole(
    actor: Principal,
    id: string,
    role: ChangeUserRoleDto['role'],
  ) {
    return this.database.client.transaction(async (trx) => {
      await this.lockAdminMutation(trx, actor);
      const target = await trx('users').where({ id }).forUpdate().first('id');
      if (!target) throw new NotFoundException('User not found');
      const nextRole = role.toLowerCase();
      if (id === actor.id && nextRole !== 'admin') {
        throw new ConflictException(
          'Không thể tự hạ quyền tài khoản quản trị đang sử dụng.',
        );
      }
      const currentRoles = await trx('user_roles')
        .where({ user_id: id })
        .pluck<string[]>('role_code');
      if (currentRoles.includes('admin') && nextRole !== 'admin') {
        const otherAdmin = await trx('users as u')
          .join('user_roles as r', 'r.user_id', 'u.id')
          .where({ 'u.status': 'active', 'r.role_code': 'admin' })
          .whereNot('u.id', id)
          .first('u.id');
        if (!otherAdmin)
          throw new ConflictException(
            'Phải giữ ít nhất một quản trị viên hoạt động.',
          );
      }
      // Repeating the same single-role assignment is a no-op.
      if (currentRoles.length !== 1 || currentRoles[0] !== nextRole) {
        await trx('user_roles').where({ user_id: id }).delete();
        await trx('user_roles').insert({ user_id: id, role_code: nextRole });
        await trx('users').where({ id }).update({ update_at: trx.fn.now() });
      }
      return this.userDetail(id, trx);
    });
  }
  async userStatistics() {
    // One statement gives a consistent snapshot. Aggregate each table separately
    // so users with several roles do not inflate total/active counts.
    const result = await this.database.client.raw<{
      rows: {
        total_users: string;
        students: string;
        instructors: string;
        admins: string;
        active_users: string;
      }[];
    }>(`
      SELECT u.total_users, u.active_users, r.students, r.instructors, r.admins
      FROM (
        SELECT count(*) AS total_users,
          count(*) FILTER (WHERE status = 'active') AS active_users
        FROM users
      ) u CROSS JOIN (
        SELECT count(*) FILTER (WHERE role_code = 'student') AS students,
          count(*) FILTER (WHERE role_code = 'instructor') AS instructors,
          count(*) FILTER (WHERE role_code = 'admin') AS admins
        FROM user_roles
      ) r
    `);
    const counts = result.rows[0]!;
    return {
      totalUsers: Number(counts.total_users),
      students: Number(counts.students),
      instructors: Number(counts.instructors),
      admins: Number(counts.admins),
      activeUsers: Number(counts.active_users),
    };
  }
  async listUsers({ page, limit, search, role, status }: ListUsersQueryDto) {
    const filtered = this.database.client<UserListRow>('users');
    if (search) {
      // Treat SQL LIKE metacharacters as literal search text.
      const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
      filtered.where((query) => {
        query
          .whereILike('display_name', pattern)
          .orWhereILike('email', pattern);
      });
    }
    if (status) filtered.where('status', status);
    if (role) {
      filtered.whereIn(
        'id',
        this.database
          .client('user_roles')
          .select('user_id')
          .where('role_code', role),
      );
    }
    const [{ count }] = await filtered
      .clone()
      .count<{ count: string }[]>({ count: '*' });
    const total = Number(count);
    const rows = await filtered
      .clone()
      .select(
        'id',
        'email',
        'display_name',
        'status',
        'created_at',
        'update_at',
      )
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .offset((page - 1) * limit);
    // One extra query for all roles on this page instead of one per row.
    const ids = rows.map((row) => row.id);
    const roleRows = ids.length
      ? ((await this.database
          .client('user_roles')
          .whereIn('user_id', ids)
          .select('user_id', 'role_code')) as {
          user_id: string;
          role_code: string;
        }[])
      : [];
    const rolesByUser = new Map<string, string[]>();
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
        updatedAt: row.update_at,
      })),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }
}
