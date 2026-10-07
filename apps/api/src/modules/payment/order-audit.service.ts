import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { Principal } from '../../auth/auth.service.js';
import { DatabaseService } from '../../database/database.module.js';
import {
  OrderAuditAction,
  OrderAuditActorType,
} from './entities/order-audit-log.entity.js';

/** Who did something, and from where. IP/UA are what an investigation needs. */
export interface AuditActor {
  type: OrderAuditActorType;
  /** null <=> SYSTEM. */
  id: string | null;
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export const SYSTEM_ACTOR: AuditActor = {
  type: OrderAuditActorType.SYSTEM,
  id: null,
  email: 'system',
  ipAddress: null,
  userAgent: null,
};

/** The authenticated back-office caller plus what the request says about it. */
export interface AdminRequestContext {
  principal: Principal;
  ipAddress: string;
  userAgent: string | null;
}

export interface AuditEntry {
  orderId: string;
  actor: AuditActor;
  action: OrderAuditAction;
  /** Mandatory and non-blank for every action; also a database CHECK. */
  reason: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
}

export interface AuditLogView {
  id: string;
  action: OrderAuditAction;
  /** User id, or 'SYSTEM'. */
  actorId: string;
  actorType: OrderAuditActorType;
  actorEmail: string;
  reason: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

const IP_MAX = 45;
const USER_AGENT_MAX = 512;

/** Express hands out `::ffff:1.2.3.4` for mapped IPv4; keep it as reported. */
export const clientIp = (value: string | undefined | null) =>
  (value ?? '').trim().slice(0, IP_MAX) || 'unknown';

/**
 * Append-only writer/reader for `order_audit_logs`. There is intentionally no
 * update or delete method: the table rejects both, and so does this class.
 *
 * Every write takes the caller's EntityManager so the audit row commits (or
 * rolls back) atomically with the change it explains.
 */
@Injectable()
export class OrderAuditService {
  constructor(private readonly database: DatabaseService) {}

  /** Builds the ADMIN actor for a request, with the email as of now. */
  async adminActor(
    manager: EntityManager,
    context: AdminRequestContext,
  ): Promise<AuditActor> {
    const [row] = await manager.query<Array<{ email: string }>>(
      'SELECT email FROM users WHERE id = $1',
      [context.principal.id],
    );
    return {
      type: OrderAuditActorType.ADMIN,
      id: context.principal.id,
      email: (row?.email ?? 'unknown').slice(0, 255),
      ipAddress: clientIp(context.ipAddress),
      userAgent: context.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
    };
  }

  async append(manager: EntityManager, entry: AuditEntry): Promise<string> {
    const [row] = await manager.query<Array<{ id: string }>>(
      `INSERT INTO order_audit_logs
         (order_id, actor_type, actor_id, actor_email, action,
          previous_state, new_state, reason, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10)
       RETURNING id`,
      [
        entry.orderId,
        entry.actor.type,
        entry.actor.id,
        entry.actor.email,
        entry.action,
        entry.previousState ? JSON.stringify(entry.previousState) : null,
        entry.newState ? JSON.stringify(entry.newState) : null,
        entry.reason.trim(),
        entry.actor.ipAddress,
        entry.actor.userAgent,
      ],
    );
    return row!.id;
  }

  /** Newest first. The whole trail of one order is small (tens of rows). */
  async listForOrder(
    manager: EntityManager,
    orderId: string,
  ): Promise<AuditLogView[]> {
    const rows = await manager.query<
      Array<{
        id: string;
        action: OrderAuditAction;
        actor_id: string | null;
        actor_type: OrderAuditActorType;
        actor_email: string;
        reason: string;
        previous_state: Record<string, unknown> | null;
        new_state: Record<string, unknown> | null;
        ip_address: string | null;
        user_agent: string | null;
        created_at: Date;
      }>
    >(
      `SELECT id, action, actor_id, actor_type, actor_email, reason,
              previous_state, new_state, ip_address, user_agent, created_at
         FROM order_audit_logs WHERE order_id = $1
        ORDER BY created_at DESC, id DESC`,
      [orderId],
    );
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorId: row.actor_id ?? 'SYSTEM',
      actorType: row.actor_type,
      actorEmail: row.actor_email,
      reason: row.reason,
      previousState: row.previous_state,
      newState: row.new_state,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at,
    }));
  }

  /** Was `proofKey` uploaded to this very order? (The trail is the registry.) */
  async hasProofUpload(
    manager: EntityManager,
    orderId: string,
    proofKey: string,
  ): Promise<boolean> {
    const rows = await manager.query<unknown[]>(
      `SELECT 1 FROM order_audit_logs
        WHERE order_id = $1 AND action = 'PROOF_UPLOADED'
          AND new_state ->> 'proofKey' = $2 LIMIT 1`,
      [orderId, proofKey],
    );
    return rows.length > 0;
  }

  /** Audited read of an order by staff outside the admin controller. */
  async recordView(
    context: AdminRequestContext,
    orderId: string,
    reason: string,
    target: Record<string, unknown> = { target: 'order' },
  ) {
    return this.database.dataSource.transaction(async (manager) => {
      const actor = await this.adminActor(manager, context);
      return this.append(manager, {
        orderId,
        actor,
        action: OrderAuditAction.DETAIL_VIEWED,
        reason,
        newState: target,
      });
    });
  }
}

/** Roles allowed into back-office order management. */
export const BACK_OFFICE_ROLES = ['admin', 'finance_officer'] as const;

export const isBackOffice = (principal: Principal) =>
  principal.roles.some((role) =>
    (BACK_OFFICE_ROLES as readonly string[]).includes(role),
  );
