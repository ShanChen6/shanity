import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PAY17: immutable order audit trail + audited manual reconciliation.
 *
 * Database-level guarantees (they hold for every code path, not just the
 * admin API):
 *  - order_audit_logs is append-only: UPDATE, DELETE and TRUNCATE are rejected.
 *    Every row carries a reason, an actor (admin / student / system) and the
 *    before/after state; ADMIN rows must carry the caller's IP address.
 *  - Every order status change leaves an audit row written in the *same*
 *    database transaction. Workflows (reconcile, refund, settlement) write
 *    their own rich row first; if none exists the trigger writes a generic
 *    SYSTEM row, so a status change can never be silent.
 *  - An order can only become COMPLETED when SUCCESS payments cover its total,
 *    and REFUNDED when the refund rows cover what was paid. Setting a status
 *    "by hand" without money in the ledger is refused by PostgreSQL.
 *  - A MANUAL_RECONCILED payment (or any refund row) cannot be committed
 *    unless the matching audit row exists in the same transaction.
 *  - orders.completed_at is maintained by the trigger (set once, immutable).
 */
export class OrderAuditLogs1792022400001 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    // A value added here cannot be *used* in this transaction, so nothing below
    // compares a column to the literal; the guard functions use ::text.
    await queryRunner.query(`
      ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'MANUAL_RECONCILED';
    `);
    await queryRunner.query(`
      INSERT INTO roles(code, name) VALUES ('finance_officer', 'Nhân viên tài chính')
        ON CONFLICT (code) DO NOTHING;

      CREATE TYPE "OrderAuditAction" AS ENUM (
        'CREATED','STATUS_CHANGED','MANUAL_RECONCILED','REFUND_ISSUED',
        'ENROLLMENT_REVOKED','NOTE_ADDED','DETAIL_VIEWED','PROOF_UPLOADED');
      CREATE TYPE "OrderAuditActorType" AS ENUM ('ADMIN','STUDENT','SYSTEM');

      -- ADMIN = back-office staff (admin or finance_officer). actor_id has no
      -- foreign key on purpose: the trail must outlive the account.
      CREATE TABLE order_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL,
        actor_type "OrderAuditActorType" NOT NULL,
        actor_id uuid,
        actor_email varchar(255) NOT NULL,
        action "OrderAuditAction" NOT NULL,
        previous_state jsonb,
        new_state jsonb,
        reason text NOT NULL,
        ip_address varchar(45),
        user_agent text,
        db_transaction_id bigint NOT NULL DEFAULT txid_current(),
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        CONSTRAINT order_audit_logs_order_id_fkey
          FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
        CONSTRAINT order_audit_logs_reason_check CHECK (length(btrim(reason)) > 0),
        CONSTRAINT order_audit_logs_actor_check
          CHECK ((actor_type = 'SYSTEM') = (actor_id IS NULL)),
        CONSTRAINT order_audit_logs_admin_ip_check
          CHECK (actor_type <> 'ADMIN' OR ip_address IS NOT NULL)
      );
      CREATE INDEX order_audit_logs_order_idx ON order_audit_logs(order_id, created_at DESC, id);
      CREATE INDEX order_audit_logs_actor_idx ON order_audit_logs(actor_id, created_at DESC)
        WHERE actor_id IS NOT NULL;
      CREATE INDEX order_audit_logs_txn_idx ON order_audit_logs(order_id, db_transaction_id);

      CREATE TRIGGER order_audit_logs_append_only BEFORE UPDATE OR DELETE ON order_audit_logs
        FOR EACH ROW EXECUTE FUNCTION forbid_row_change();
      CREATE TRIGGER order_audit_logs_no_truncate BEFORE TRUNCATE ON order_audit_logs
        FOR EACH STATEMENT EXECUTE FUNCTION forbid_row_change();

      -- ------------------------------------------------------------ orders
      ALTER TABLE orders ADD COLUMN completed_at timestamptz;
      UPDATE orders o SET completed_at = COALESCE(
          (SELECT min(t.received_at) FROM payment_transactions t
            WHERE t.order_id = o.id AND t.status = 'SUCCESS'), o.updated_at)
        -- ::text: on a fresh database the enum values below were added by an
        -- earlier migration of this same transaction and are not yet usable.
        WHERE o.status::text IN ('COMPLETED','REFUNDED');
      CREATE INDEX orders_completed_at_idx ON orders(completed_at) WHERE completed_at IS NOT NULL;

      -- History for orders that predate the trail.
      INSERT INTO order_audit_logs(order_id, actor_type, actor_id, actor_email, action,
                                   previous_state, new_state, reason, created_at)
        SELECT o.id, 'SYSTEM', NULL, 'system', 'CREATED', NULL,
               jsonb_build_object('status', o.status, 'code', o.code, 'currency', o.currency,
                                  'finalTotal', o.final_total),
               'Backfilled when the audit trail was introduced', o.created_at
          FROM orders o;

      CREATE OR REPLACE FUNCTION orders_guard_update() RETURNS trigger LANGUAGE plpgsql AS $fn$
      DECLARE
        paid bigint;
        refunded bigint;
      BEGIN
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.code IS DISTINCT FROM OLD.code
           OR NEW.user_id IS DISTINCT FROM OLD.user_id
           OR NEW.currency IS DISTINCT FROM OLD.currency
           OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
           OR NEW.discount_total IS DISTINCT FROM OLD.discount_total
           OR NEW.final_total IS DISTINCT FROM OLD.final_total
           OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
          RAISE EXCEPTION 'orders financial snapshot is immutable'
            USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
             (OLD.status = 'PENDING' AND NEW.status IN ('PROCESSING','COMPLETED','EXPIRED','CANCELLED'))
          OR (OLD.status = 'PROCESSING' AND NEW.status IN ('COMPLETED','EXPIRED','CANCELLED'))
          OR (OLD.status = 'EXPIRED' AND NEW.status = 'COMPLETED')
          OR (OLD.status = 'COMPLETED' AND NEW.status = 'REFUNDED')
        ) THEN
          RAISE EXCEPTION 'illegal order status transition % -> %', OLD.status, NEW.status
            USING ERRCODE = 'restrict_violation';
        END IF;

        -- Money-backed transitions: a status alone is never evidence of payment.
        IF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
          SELECT COALESCE(sum(amount), 0) INTO paid
            FROM payment_transactions WHERE order_id = OLD.id AND status = 'SUCCESS';
          IF paid < NEW.final_total THEN
            RAISE EXCEPTION 'order % cannot be COMPLETED: settled payments (%) do not cover its total (%)',
              OLD.code, paid, NEW.final_total
              USING ERRCODE = 'restrict_violation';
          END IF;
          NEW.completed_at := now();
        ELSIF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
          RAISE EXCEPTION 'orders.completed_at is maintained by the database'
            USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.status = 'REFUNDED' AND OLD.status IS DISTINCT FROM 'REFUNDED' THEN
          SELECT COALESCE(sum(amount) FILTER (WHERE status = 'SUCCESS'), 0),
                 COALESCE(sum(amount) FILTER (WHERE status IN ('REFUNDED','PARTIALLY_REFUNDED')), 0)
            INTO paid, refunded
            FROM payment_transactions WHERE order_id = OLD.id;
          IF refunded < paid OR paid = 0 THEN
            RAISE EXCEPTION 'order % cannot be REFUNDED: refund rows (%) do not cover the amount paid (%)',
              OLD.code, refunded, paid
              USING ERRCODE = 'restrict_violation';
          END IF;
        END IF;
        RETURN NEW;
      END $fn$;

      -- Creation: recorded as the buyer's own action.
      CREATE FUNCTION orders_audit_created() RETURNS trigger LANGUAGE plpgsql AS $fn$
      DECLARE
        buyer_email text;
      BEGIN
        SELECT email INTO buyer_email FROM users WHERE id = NEW.user_id;
        INSERT INTO order_audit_logs(order_id, actor_type, actor_id, actor_email, action,
                                     previous_state, new_state, reason)
        VALUES (NEW.id, 'STUDENT', NEW.user_id, COALESCE(buyer_email, 'unknown'), 'CREATED', NULL,
                jsonb_build_object('status', NEW.status, 'code', NEW.code, 'currency', NEW.currency,
                                   'subtotal', NEW.subtotal, 'discountTotal', NEW.discount_total,
                                   'finalTotal', NEW.final_total, 'expiresAt', NEW.expires_at),
                'Order created at checkout');
        RETURN NULL;
      END $fn$;
      CREATE TRIGGER orders_audit_created AFTER INSERT ON orders
        FOR EACH ROW EXECUTE FUNCTION orders_audit_created();

      -- "No silent status change": workflows write their own row first (with the
      -- admin, IP and reason); anything else gets a SYSTEM row from here.
      CREATE FUNCTION orders_audit_status_change() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM order_audit_logs
           WHERE order_id = NEW.id AND db_transaction_id = txid_current()
             AND action IN ('STATUS_CHANGED','MANUAL_RECONCILED','REFUND_ISSUED')
             AND new_state ->> 'status' = NEW.status::text
        ) THEN
          RETURN NULL;
        END IF;
        INSERT INTO order_audit_logs(order_id, actor_type, actor_id, actor_email, action,
                                     previous_state, new_state, reason)
        VALUES (NEW.id, 'SYSTEM', NULL, 'system', 'STATUS_CHANGED',
                jsonb_build_object('status', OLD.status),
                jsonb_build_object('status', NEW.status),
                format('System status transition %s -> %s', OLD.status, NEW.status));
        RETURN NULL;
      END $fn$;
      CREATE TRIGGER orders_audit_status_change AFTER UPDATE OF status ON orders
        FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
        EXECUTE FUNCTION orders_audit_status_change();

      -- Deferred to COMMIT: the audit row may be written before or after the
      -- ledger row, but a manual payment / refund cannot exist without it.
      CREATE FUNCTION payment_transactions_require_audit() RETURNS trigger LANGUAGE plpgsql AS $fn$
      DECLARE
        needed text;
      BEGIN
        IF NEW.provider::text = 'MANUAL_RECONCILED' THEN
          needed := 'MANUAL_RECONCILED';
        ELSIF NEW.status IN ('REFUNDED','PARTIALLY_REFUNDED') THEN
          needed := 'REFUND_ISSUED';
        ELSE
          RETURN NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM order_audit_logs
           WHERE order_id = NEW.order_id AND db_transaction_id = txid_current()
             AND action::text = needed
        ) THEN
          RAISE EXCEPTION 'payment_transactions row % requires a % audit log in the same transaction',
            NEW.id, needed
            USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NULL;
      END $fn$;
      CREATE CONSTRAINT TRIGGER payment_transactions_require_audit
        AFTER INSERT ON payment_transactions DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION payment_transactions_require_audit();
    `);
  }

  async down(queryRunner: QueryRunner) {
    // The trail is evidence; rolling back must not destroy it silently.
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM order_audit_logs WHERE actor_type = 'ADMIN') THEN
          RAISE EXCEPTION 'order_audit_logs holds admin actions; refusing to drop it';
        END IF;
        IF EXISTS (SELECT 1 FROM payment_transactions WHERE provider::text = 'MANUAL_RECONCILED') THEN
          RAISE EXCEPTION 'manually reconciled payments exist; refusing to roll back';
        END IF;
      END $$;
      DROP TRIGGER payment_transactions_require_audit ON payment_transactions;
      DROP FUNCTION payment_transactions_require_audit();
      DROP TRIGGER orders_audit_status_change ON orders;
      DROP FUNCTION orders_audit_status_change();
      DROP TRIGGER orders_audit_created ON orders;
      DROP FUNCTION orders_audit_created();
      CREATE OR REPLACE FUNCTION orders_guard_update() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.code IS DISTINCT FROM OLD.code
           OR NEW.user_id IS DISTINCT FROM OLD.user_id
           OR NEW.currency IS DISTINCT FROM OLD.currency
           OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
           OR NEW.discount_total IS DISTINCT FROM OLD.discount_total
           OR NEW.final_total IS DISTINCT FROM OLD.final_total
           OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
          RAISE EXCEPTION 'orders financial snapshot is immutable'
            USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
             (OLD.status = 'PENDING' AND NEW.status IN ('PROCESSING','COMPLETED','EXPIRED','CANCELLED'))
          OR (OLD.status = 'PROCESSING' AND NEW.status IN ('COMPLETED','EXPIRED','CANCELLED'))
          OR (OLD.status = 'EXPIRED' AND NEW.status = 'COMPLETED')
          OR (OLD.status = 'COMPLETED' AND NEW.status = 'REFUNDED')
        ) THEN
          RAISE EXCEPTION 'illegal order status transition % -> %', OLD.status, NEW.status
            USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
      END $fn$;
      DROP INDEX orders_completed_at_idx;
      ALTER TABLE orders DROP COLUMN completed_at;
      -- Only system/student rows remain (backfill, creation, system transitions).
      DROP TABLE order_audit_logs;
      DROP TYPE "OrderAuditActorType";
      DROP TYPE "OrderAuditAction";
      DELETE FROM user_roles WHERE role_code = 'finance_officer';
      DELETE FROM roles WHERE code = 'finance_officer';
    `);
    // PostgreSQL cannot drop a single enum value; MANUAL_RECONCILED stays in
    // "PaymentProvider" (unused) after a rollback.
  }
}
