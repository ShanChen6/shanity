import { AuthSession, UserRole } from './auth.entities.js';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { User } from '../users/user.entity.js';
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
      return await this.database.dataSource.transaction(async (trx) => {
        const [user] = await trx
          .getRepository(User)
          .insert({
            email: dto.email,
            displayName: dto.displayName,
            passwordHash: passwordHash,
          })
          .then((result) => result.raw);
        await trx
          .getRepository(UserRole)
          .insert({ user_id: user!.id, role_code: 'student' })
          .then((result) => result.raw);
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
      return await this.database.dataSource.transaction(async (trx) => {
        await this.lockAdminMutation(trx, actor);
        const [user] = await trx
          .getRepository(User)
          .insert({
            email: dto.email,
            displayName: dto.displayName,
            passwordHash: passwordHash,
          })
          .then((result) => result.raw);
        await trx
          .getRepository(UserRole)
          .insert({ user_id: user!.id, role_code: dto.role.toLowerCase() })
          .then((result) => result.raw);
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
      return await this.database.dataSource.transaction(async (trx) => {
        await this.lockAdminMutation(trx, actor);
        const count = await trx
          .getRepository(User)
          .update({ id }, { email: dto.email, displayName: dto.displayName })
          .then((result) => result.affected);
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
    const user = await this.database.dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: dto.email })
      .getOne();
    const valid = await verifyPassword(
      dto.password,
      user?.passwordHash ?? null,
    );
    if (!user || !valid || user.status !== 'active')
      throw new UnauthorizedException('Invalid credentials');
    return this.database.dataSource.transaction(async (trx) => {
      const current = await trx.getRepository(User).findOne({
        where: { id: user.id },
        select: { id: true, status: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (current?.status !== 'active')
        throw new UnauthorizedException('Invalid credentials');
      return this.issue(trx, user.id);
    });
  }
  async changePassword(actor: Principal, dto: ChangePasswordDto) {
    await this.database.dataSource.transaction(async (trx) => {
      // Match refresh's session -> user lock order; revoke atomically with the write.
      const session = await trx.getRepository(AuthSession).findOne({
        where: { id: actor.sessionId, user_id: actor.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !session ||
        session.revoked_at ||
        new Date(session.expires_at) <= new Date()
      )
        throw new UnauthorizedException();
      const user = await trx.getRepository(User).findOne({
        where: { id: actor.id },
        select: { id: true, status: true, passwordHash: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.status !== 'active') throw new UnauthorizedException();
      if (!user.passwordHash)
        throw new BadRequestException(
          'Tài khoản này đăng nhập bằng Google và chưa có mật khẩu.',
        );
      if (!(await verifyPassword(dto.currentPassword, user.passwordHash)))
        throw new BadRequestException('Mật khẩu hiện tại không đúng.');
      if (dto.newPassword === dto.currentPassword)
        throw new BadRequestException(
          'Mật khẩu mới phải khác mật khẩu hiện tại.',
        );
      await trx
        .getRepository(User)
        .update(
          { id: actor.id },
          { passwordHash: await hashPassword(dto.newPassword) },
        )
        .then((result) => result.affected);
      await trx
        .getRepository(AuthSession)
        .update({ id: actor.sessionId }, { revoked_at: () => 'now()' })
        .then((result) => result.affected);
    });
  }
  async issue(trx: EntityManager, userId: string) {
    const refresh = randomToken();
    const [session] = await trx
      .getRepository(AuthSession)
      .insert({
        user_id: userId,
        refresh_hash: digest(refresh),
        expires_at: new Date(Date.now() + this.config.refreshSeconds * 1000),
      })
      .then((result) => result.raw);
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
    return this.database.dataSource.transaction(async (trx) => {
      const session = await trx.getRepository(AuthSession).findOne({
        where: { refresh_hash: digest(token) },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !session ||
        session.revoked_at ||
        new Date(session.expires_at) <= new Date()
      )
        throw new UnauthorizedException();
      const user = await trx.getRepository(User).findOne({
        where: { id: session.user_id },
        select: { id: true, status: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (user?.status !== 'active') throw new UnauthorizedException();
      const refresh = randomToken();
      await trx
        .getRepository(AuthSession)
        .update({ id: session.id }, { refresh_hash: digest(refresh) })
        .then((result) => result.affected);
      return {
        access: await this.access(user.id, session.id as string),
        refresh,
      };
    });
  }
  async logout(token?: string) {
    if (token && /^[\w-]{43}$/.test(token))
      await this.database.dataSource.manager
        .getRepository(AuthSession)
        .update({ refresh_hash: digest(token) }, { revoked_at: new Date() })
        .then((result) => result.affected);
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
    const session = await this.database.dataSource
      .getRepository(AuthSession)
      .createQueryBuilder('session')
      .innerJoin(User, 'user', 'user.id = session.user_id')
      .select('session.user_id', 'userId')
      .where('session.id = :sessionId', { sessionId: payload.sid })
      .andWhere('session.user_id = :userId', { userId: payload.sub })
      .andWhere('user.status = :status', { status: 'active' })
      .andWhere('session.revoked_at IS NULL')
      .andWhere('session.expires_at > :now', { now: new Date() })
      .getRawOne<{ userId: string }>();
    if (!session) throw new UnauthorizedException();
    const roles = await this.database.dataSource
      .getRepository(UserRole)
      .find({
        where: { user_id: session.userId },
        select: { role_code: true },
      })
      .then((rows) => rows.map((row) => row.role_code));
    return { id: session.userId, sessionId: payload.sid, roles };
  }
  async profile(
    id: string,
    db: EntityManager = this.database.dataSource.manager,
  ) {
    const user = await db.getRepository(User).findOne({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarKey: true,
        passwordHash: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      hasPassword: Boolean(user.passwordHash),
      avatarUrl: user.avatarKey ? `/avatars/${user.avatarKey}` : null,
      roles: await db
        .getRepository(UserRole)
        .find({ where: { user_id: id }, select: { role_code: true } })
        .then((rows) => rows.map((row) => row.role_code)),
    };
  }
  async userDetail(
    id: string,
    db: EntityManager = this.database.dataSource.manager,
  ) {
    const user = await db.getRepository(User).findOne({
      where: { id },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const roles = await db
      .getRepository(UserRole)
      .find({
        where: { user_id: id },
        select: { role_code: true },
        order: { role_code: 'ASC' },
      })
      .then((rows) => rows.map((row) => row.role_code));
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      roles,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
  private async lockAdminMutation(trx: EntityManager, actor: Principal) {
    // Admin mutations share this lock; recheck authority after waiting.
    await trx.query('SELECT pg_advisory_xact_lock(73104, 7)');
    const actorUser = await trx.getRepository(User).findOne({
      where: { id: actor.id, status: 'active' },
      select: { id: true },
      lock: { mode: 'pessimistic_write' },
    });
    const actorRole = await trx.getRepository(UserRole).findOne({
      where: { user_id: actor.id, role_code: 'admin' },
      select: { user_id: true },
    });
    if (!actorUser || !actorRole)
      throw new ForbiddenException('Bạn không còn quyền quản trị.');
  }
  async changeUserStatus(
    actor: Principal,
    id: string,
    status: ChangeUserStatusDto['status'],
  ) {
    return this.database.dataSource.transaction(async (trx) => {
      await this.lockAdminMutation(trx, actor);
      const target = await trx.getRepository(User).findOne({
        where: { id },
        select: { id: true, status: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!target) throw new NotFoundException('User not found');
      const nextStatus = status.toLowerCase();
      if (id === actor.id && nextStatus === 'disabled') {
        throw new ConflictException(
          'Không thể vô hiệu hóa tài khoản quản trị đang sử dụng.',
        );
      }
      if (nextStatus === 'disabled') {
        const targetAdmin = await trx.getRepository(UserRole).findOne({
          where: { user_id: id, role_code: 'admin' },
          select: { user_id: true },
        });
        if (targetAdmin) {
          const otherAdmin = await trx
            .getRepository(UserRole)
            .createQueryBuilder('userRole')
            .innerJoin(User, 'user', 'user.id = userRole.user_id')
            .select('user.id', 'id')
            .where('user.status = :status', { status: 'active' })
            .andWhere('userRole.role_code = :role', { role: 'admin' })
            .andWhere('user.id != :id', { id })
            .getRawOne();
          if (!otherAdmin)
            throw new ConflictException(
              'Phải giữ ít nhất một quản trị viên hoạt động.',
            );
        }
      }
      if (target.status !== nextStatus) {
        // The existing user trigger advances update_at. Roles and user data remain intact.
        await trx
          .getRepository(User)
          .update({ id }, { status: nextStatus })
          .then((result) => result.affected);
      }
      return this.userDetail(id, trx);
    });
  }
  async changeUserRole(
    actor: Principal,
    id: string,
    role: ChangeUserRoleDto['role'],
  ) {
    return this.database.dataSource.transaction(async (trx) => {
      await this.lockAdminMutation(trx, actor);
      const target = await trx.getRepository(User).findOne({
        where: { id },
        select: { id: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!target) throw new NotFoundException('User not found');
      const nextRole = role.toLowerCase();
      if (id === actor.id && nextRole !== 'admin') {
        throw new ConflictException(
          'Không thể tự hạ quyền tài khoản quản trị đang sử dụng.',
        );
      }
      const currentRoles = await trx
        .getRepository(UserRole)
        .find({ where: { user_id: id }, select: { role_code: true } })
        .then((rows) => rows.map((row) => row.role_code));
      if (currentRoles.includes('admin') && nextRole !== 'admin') {
        const otherAdmin = await trx
          .getRepository(UserRole)
          .createQueryBuilder('userRole')
          .innerJoin(User, 'user', 'user.id = userRole.user_id')
          .select('user.id', 'id')
          .where('user.status = :status', { status: 'active' })
          .andWhere('userRole.role_code = :role', { role: 'admin' })
          .andWhere('user.id != :id', { id })
          .getRawOne();
        if (!otherAdmin)
          throw new ConflictException(
            'Phải giữ ít nhất một quản trị viên hoạt động.',
          );
      }
      // Repeating the same single-role assignment is a no-op.
      if (currentRoles.length !== 1 || currentRoles[0] !== nextRole) {
        await trx.getRepository(UserRole).delete({ user_id: id });
        await trx
          .getRepository(UserRole)
          .insert({ user_id: id, role_code: nextRole })
          .then((result) => result.raw);
        await trx
          .getRepository(User)
          .update({ id }, { updatedAt: () => 'now()' })
          .then((result) => result.affected);
      }
      return this.userDetail(id, trx);
    });
  }
  async userStatistics() {
    // One statement gives a consistent snapshot. Aggregate each table separately
    // so users with several roles do not inflate total/active counts.
    const counts = await this.database.dataSource
      .createQueryBuilder()
      .select('(SELECT count(*) FROM "users")', 'total_users')
      .addSelect(
        '(SELECT count(*) FROM "users" WHERE "status" = \'active\')',
        'active_users',
      )
      .addSelect(
        '(SELECT count(*) FROM "user_roles" WHERE "role_code" = \'student\')',
        'students',
      )
      .addSelect(
        '(SELECT count(*) FROM "user_roles" WHERE "role_code" = \'instructor\')',
        'instructors',
      )
      .addSelect(
        '(SELECT count(*) FROM "user_roles" WHERE "role_code" = \'admin\')',
        'admins',
      )
      .getRawOne<{
        total_users: string;
        active_users: string;
        students: string;
        instructors: string;
        admins: string;
      }>();
    return {
      totalUsers: Number(counts?.total_users ?? 0),
      students: Number(counts?.students ?? 0),
      instructors: Number(counts?.instructors ?? 0),
      admins: Number(counts?.admins ?? 0),
      activeUsers: Number(counts?.active_users ?? 0),
    };
  }
  async listUsers({ page, limit, search, role, status }: ListUsersQueryDto) {
    const filtered = this.database.dataSource
      .getRepository(User)
      .createQueryBuilder('u');
    if (search) {
      const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
      filtered.andWhere(
        '(u.displayName ILIKE :pattern OR u.email ILIKE :pattern)',
        { pattern },
      );
    }
    if (status) filtered.andWhere('u.status = :status', { status });
    if (role)
      filtered.andWhere(
        'u.id IN (SELECT user_id FROM user_roles WHERE role_code = :role)',
        { role },
      );
    const total = await filtered.getCount();
    const rows = await filtered
      .orderBy('u.createdAt', 'DESC')
      .addOrderBy('u.id', 'DESC')
      .take(limit)
      .skip((page - 1) * limit)
      .getMany();
    // One extra query for all roles on this page instead of one per row.
    const ids = rows.map((row) => row.id);
    const roleRows = ids.length
      ? await this.database.dataSource
          .getRepository(UserRole)
          .find({
            where: { user_id: In(ids) },
            select: { user_id: true, role_code: true },
          })
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
        displayName: row.displayName,
        status: row.status,
        roles: rolesByUser.get(row.id) ?? [],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    };
  }
}
