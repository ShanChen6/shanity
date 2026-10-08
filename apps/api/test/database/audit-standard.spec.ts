import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAppDataSource } from '../../src/database/typeorm.js';

/**
 * The schema audit standard, enforced from entity metadata so a new entity
 * cannot silently skip it. Every entity must have a UUID primary key and be
 * either audited (created_at + updated_at) or listed here with its reason.
 */
const EXEMPT: Record<string, string> = {
  // Append-only ledgers: rows are inserted once and never updated or deleted
  // (database triggers enforce it), so updated_at would always be a lie.
  OrderAuditLog: 'append-only ledger',
  QuizGradeAuditLogEntity: 'append-only ledger',
  CoursePriceLog: 'append-only ledger',
  WebhookLog: 'append-only provider event log',
  OrderItem: 'immutable order snapshot',
  // ORM-managed updated_at (@UpdateDateColumn) on money tables.
  Order: 'updated_at via @UpdateDateColumn',
  PaymentTransaction: 'updated_at via @UpdateDateColumn',
  // Mutable, but their own timestamp columns carry the meaning.
  Enrollment: 'enrolled_at is the creation time; updated_at present',
  AttemptAnswerEntity: 'saved_at is the last-write time; created_at present',
  // Auth/system tables: natural keys or ephemeral rows.
  Role: 'natural key (code)',
  UserRole: 'composite natural key',
  AuthSession: 'ephemeral; revoked_at/expires_at',
  AuthIdentity: 'immutable link',
  OAuthRequest: 'ephemeral, natural key',
  AuthRateLimit: 'ephemeral, natural key',
};

describe('schema audit standard', () => {
  const dataSource = createAppDataSource();
  beforeAll(async () => {
    await dataSource.initialize();
  });
  afterAll(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  const columns = (name: string) =>
    new Set(
      dataSource.getMetadata(name).columns.map((column) => column.databaseName),
    );

  it('keeps the exemption list free of unknown entities', () => {
    const names = new Set(dataSource.entityMetadatas.map((m) => m.name));
    for (const name of Object.keys(EXEMPT))
      expect(names.has(name), `stale exemption: ${name}`).toBe(true);
  });

  it('gives every entity a uuid primary key unless its key is natural', () => {
    for (const meta of dataSource.entityMetadatas) {
      if (
        ['Role', 'UserRole', 'OAuthRequest', 'AuthRateLimit'].includes(
          meta.name,
        )
      )
        continue;
      const [primary, ...rest] = meta.primaryColumns;
      expect(rest, meta.name).toHaveLength(0);
      expect(primary?.type, meta.name).toBe('uuid');
    }
  });

  it('audits every mutable entity with created_at and updated_at', () => {
    for (const meta of dataSource.entityMetadatas) {
      if (meta.name in EXEMPT) continue;
      const present = columns(meta.name);
      expect(present.has('created_at'), `${meta.name}.created_at`).toBe(true);
      expect(present.has('updated_at'), `${meta.name}.updated_at`).toBe(true);
    }
  });

  it('names tables and columns in snake_case', () => {
    const snake = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
    for (const meta of dataSource.entityMetadatas) {
      expect(meta.tableName, meta.name).toMatch(snake);
      for (const column of meta.columns)
        expect(
          column.databaseName,
          `${meta.name}.${column.propertyName}`,
        ).toMatch(snake);
    }
  });
});
