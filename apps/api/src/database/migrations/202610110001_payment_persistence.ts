import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PAY3-PAY5: payment persistence, data snapshotting and audit ledger.
 *
 * - orders: multi-course header with subtotal / discount_total / final_total
 *   (replaces amount) and a REFUNDED status; course_id moves to order_items.
 * - order_items: course title + discount + final price snapshots.
 * - payment_transactions: provider, fee, currency, received_at, updated_at,
 *   refund statuses; (provider, provider_transaction_id) unique.
 * - Database-level guarantees for the persistence invariant: financial
 *   snapshots are immutable, totals must equal the items, the ledger is
 *   append-only once settled, and order status follows a fixed state machine.
 */
export class PaymentPersistence1791676800001 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`
      -- ---------------------------------------------------------------- enums
      ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
      ALTER TYPE "PaymentTransactionStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
      ALTER TYPE "PaymentTransactionStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
      CREATE TYPE "PaymentProvider" AS ENUM ('VIETQR','STRIPE','MOMO','VNPAY','MANUAL_BANK');

      -- ---------------------------------------------------------------- orders
      -- Every order must already carry an item (PAY2 backfilled one per order),
      -- otherwise dropping orders.course_id would destroy information.
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)) THEN
          RAISE EXCEPTION 'orders without order_items exist; refusing to drop orders.course_id';
        END IF;
      END $$;
      ALTER TABLE orders DROP CONSTRAINT orders_amount_check;
      ALTER TABLE orders RENAME COLUMN amount TO final_total;
      ALTER TABLE orders
        ALTER COLUMN code TYPE varchar(50),
        ALTER COLUMN currency TYPE varchar(10),
        ADD COLUMN subtotal bigint,
        ADD COLUMN discount_total bigint NOT NULL DEFAULT 0;
      -- Legacy orders had no discounts: the old amount was the list price.
      UPDATE orders SET subtotal = final_total;
      ALTER TABLE orders
        ALTER COLUMN subtotal SET NOT NULL,
        ALTER COLUMN discount_total DROP DEFAULT,
        ADD CONSTRAINT orders_subtotal_check CHECK (subtotal >= 0),
        ADD CONSTRAINT orders_discount_total_check CHECK (discount_total >= 0 AND discount_total <= subtotal),
        ADD CONSTRAINT orders_final_total_check CHECK (final_total = subtotal - discount_total),
        DROP COLUMN course_id;

      -- ----------------------------------------------------------- order_items
      ALTER TABLE order_items
        ADD COLUMN course_title_snapshot varchar(255),
        ADD COLUMN discount_snapshot bigint NOT NULL DEFAULT 0,
        ADD COLUMN final_price_snapshot bigint,
        ALTER COLUMN currency TYPE varchar(10);
      -- One-time best effort for pre-PAY3 orders: their title was never saved,
      -- so the current title is the closest record. Prices come from the order.
      UPDATE order_items i
         SET course_title_snapshot = left(c.title, 255),
             final_price_snapshot = i.unit_price_snapshot
        FROM courses c WHERE c.id = i.course_id;
      ALTER TABLE order_items
        ALTER COLUMN course_title_snapshot SET NOT NULL,
        ALTER COLUMN final_price_snapshot SET NOT NULL,
        ADD CONSTRAINT order_items_title_snapshot_check CHECK (length(course_title_snapshot) > 0),
        ADD CONSTRAINT order_items_discount_snapshot_check CHECK (discount_snapshot >= 0 AND discount_snapshot <= unit_price_snapshot),
        ADD CONSTRAINT order_items_final_price_snapshot_check CHECK (final_price_snapshot = unit_price_snapshot - discount_snapshot);

      -- ---------------------------------------------------- payment_transactions
      ALTER TABLE payment_transactions
        ADD COLUMN provider "PaymentProvider" NOT NULL DEFAULT 'VIETQR',
        ADD COLUMN fee_amount bigint NOT NULL DEFAULT 0,
        ADD COLUMN currency varchar(10),
        ADD COLUMN received_at timestamptz,
        ADD COLUMN updated_at timestamptz,
        ALTER COLUMN transfer_content DROP NOT NULL;
      UPDATE payment_transactions t
         SET currency = o.currency, received_at = t.created_at, updated_at = t.created_at
        FROM orders o WHERE o.id = t.order_id;
      -- Fails loudly (instead of truncating) if an id longer than 100 exists.
      ALTER TABLE payment_transactions
        ALTER COLUMN provider DROP DEFAULT,
        ALTER COLUMN currency SET NOT NULL,
        ALTER COLUMN received_at SET NOT NULL,
        ALTER COLUMN received_at SET DEFAULT now(),
        ALTER COLUMN updated_at SET NOT NULL,
        ALTER COLUMN updated_at SET DEFAULT now(),
        ALTER COLUMN provider_transaction_id TYPE varchar(100),
        ADD CONSTRAINT payment_transactions_fee_amount_check CHECK (fee_amount >= 0 AND fee_amount <= amount),
        ADD CONSTRAINT payment_transactions_currency_check CHECK (currency IN ('VND','USD'));
      DROP INDEX payment_transactions_provider_id_key;
      CREATE UNIQUE INDEX payment_transactions_provider_txn_key
        ON payment_transactions(provider, provider_transaction_id)
        WHERE provider_transaction_id IS NOT NULL;

      -- ------------------------------------------------- persistence invariants
      CREATE FUNCTION forbid_row_change() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        RAISE EXCEPTION '% rows are append-only (% rejected)', TG_TABLE_NAME, TG_OP
          USING ERRCODE = 'restrict_violation';
      END $fn$;
      CREATE TRIGGER order_items_append_only BEFORE UPDATE OR DELETE ON order_items
        FOR EACH ROW EXECUTE FUNCTION forbid_row_change();
      CREATE TRIGGER orders_no_delete BEFORE DELETE ON orders
        FOR EACH ROW EXECUTE FUNCTION forbid_row_change();

      CREATE FUNCTION orders_guard_update() RETURNS trigger LANGUAGE plpgsql AS $fn$
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
          OR (OLD.status = 'COMPLETED' AND NEW.status = 'REFUNDED')
        ) THEN
          RAISE EXCEPTION 'illegal order status transition % -> %', OLD.status, NEW.status
            USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
      END $fn$;
      CREATE TRIGGER orders_guard_update BEFORE UPDATE ON orders
        FOR EACH ROW EXECUTE FUNCTION orders_guard_update();

      -- Settled ledger rows never change; INITIATED rows may be completed once
      -- (amount/status/fee/payload) but keep their order, provider and currency.
      CREATE FUNCTION payment_transactions_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'payment_transactions rows are append-only (DELETE rejected)'
            USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status <> 'INITIATED' THEN
          RAISE EXCEPTION 'settled payment_transactions rows are immutable'
            USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.order_id IS DISTINCT FROM OLD.order_id
           OR NEW.provider IS DISTINCT FROM OLD.provider
           OR NEW.currency IS DISTINCT FROM OLD.currency
           OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
          RAISE EXCEPTION 'payment_transactions order, provider and currency are immutable'
            USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
      END $fn$;
      CREATE TRIGGER payment_transactions_guard BEFORE UPDATE OR DELETE ON payment_transactions
        FOR EACH ROW EXECUTE FUNCTION payment_transactions_guard();

      -- Deferred to COMMIT so the header and its items can be inserted in any
      -- order within one transaction. An order must have items that sum to it.
      CREATE FUNCTION assert_order_matches_items() RETURNS trigger LANGUAGE plpgsql AS $fn$
      DECLARE
        target uuid;
        header orders%ROWTYPE;
        totals RECORD;
      BEGIN
        -- IF, not CASE: plpgsql resolves NEW.<field> per statement, and
        -- NEW has no order_id when the trigger fires from orders.
        IF TG_TABLE_NAME = 'orders' THEN
          target := NEW.id;
        ELSE
          target := NEW.order_id;
        END IF;
        SELECT * INTO header FROM orders WHERE id = target;
        IF NOT FOUND THEN RETURN NULL; END IF;
        SELECT count(*) AS item_count,
               COALESCE(sum(unit_price_snapshot), 0) AS unit_sum,
               COALESCE(sum(discount_snapshot), 0) AS discount_sum,
               COALESCE(sum(final_price_snapshot), 0) AS final_sum,
               COALESCE(bool_and(currency = header.currency), false) AS same_currency
          INTO totals FROM order_items WHERE order_id = target;
        IF totals.item_count = 0
           OR totals.unit_sum <> header.subtotal
           OR totals.discount_sum <> header.discount_total
           OR totals.final_sum <> header.final_total
           OR NOT totals.same_currency THEN
          RAISE EXCEPTION 'order % totals do not match its items', header.code
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NULL;
      END $fn$;
      CREATE CONSTRAINT TRIGGER orders_totals_match_items
        AFTER INSERT ON orders DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION assert_order_matches_items();
      CREATE CONSTRAINT TRIGGER order_items_totals_match_order
        AFTER INSERT ON order_items DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION assert_order_matches_items();
    `);
  }

  // Rolling back refuses (rather than loses data) when the newer model is in
  // use: multi-item orders, refund rows or ids that no longer fit.
  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`
      -- Refuse before changing anything, with a message that names the cause.
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM order_items GROUP BY order_id HAVING count(*) > 1) THEN
          RAISE EXCEPTION 'multi-item orders exist; refusing to collapse them to one course_id';
        END IF;
        IF EXISTS (SELECT 1 FROM orders WHERE discount_total <> 0) THEN
          RAISE EXCEPTION 'discounted orders exist; refusing to drop discount_total';
        END IF;
        IF EXISTS (SELECT 1 FROM payment_transactions WHERE provider <> 'VIETQR') THEN
          RAISE EXCEPTION 'non-VietQR payment transactions exist; refusing to drop provider';
        END IF;
        IF EXISTS (SELECT 1 FROM payment_transactions WHERE status IN ('REFUNDED','PARTIALLY_REFUNDED'))
           OR EXISTS (SELECT 1 FROM orders WHERE status = 'REFUNDED') THEN
          RAISE EXCEPTION 'refund records exist; refusing to drop refund statuses';
        END IF;
      END $$;

      DROP TRIGGER order_items_totals_match_order ON order_items;
      DROP TRIGGER orders_totals_match_items ON orders;
      DROP FUNCTION assert_order_matches_items();
      DROP TRIGGER payment_transactions_guard ON payment_transactions;
      DROP FUNCTION payment_transactions_guard();
      DROP TRIGGER orders_guard_update ON orders;
      DROP FUNCTION orders_guard_update();
      DROP TRIGGER orders_no_delete ON orders;
      DROP TRIGGER order_items_append_only ON order_items;
      DROP FUNCTION forbid_row_change();

      -- payment_transactions
      DROP INDEX payment_transactions_provider_txn_key;
      UPDATE payment_transactions SET transfer_content = '' WHERE transfer_content IS NULL;
      ALTER TABLE payment_transactions
        DROP CONSTRAINT payment_transactions_currency_check,
        DROP CONSTRAINT payment_transactions_fee_amount_check,
        DROP COLUMN updated_at,
        DROP COLUMN received_at,
        DROP COLUMN currency,
        DROP COLUMN fee_amount,
        DROP COLUMN provider,
        ALTER COLUMN provider_transaction_id TYPE varchar(128),
        ALTER COLUMN transfer_content SET NOT NULL;
      CREATE UNIQUE INDEX payment_transactions_provider_id_key
        ON payment_transactions(provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;
      DROP TYPE "PaymentProvider";
      ALTER TYPE "PaymentTransactionStatus" RENAME TO "PaymentTransactionStatus_new";
      CREATE TYPE "PaymentTransactionStatus" AS ENUM ('INITIATED','SUCCESS','FAILED');
      ALTER TABLE payment_transactions
        ALTER COLUMN status TYPE "PaymentTransactionStatus" USING status::text::"PaymentTransactionStatus";
      DROP TYPE "PaymentTransactionStatus_new";

      -- order_items
      ALTER TABLE order_items
        DROP CONSTRAINT order_items_final_price_snapshot_check,
        DROP CONSTRAINT order_items_discount_snapshot_check,
        DROP CONSTRAINT order_items_title_snapshot_check,
        DROP COLUMN final_price_snapshot,
        DROP COLUMN discount_snapshot,
        DROP COLUMN course_title_snapshot,
        ALTER COLUMN currency TYPE varchar(3);

      -- orders
      ALTER TABLE orders ADD COLUMN course_id uuid;
      UPDATE orders o SET course_id = i.course_id FROM order_items i WHERE i.order_id = o.id;
      ALTER TABLE orders
        ALTER COLUMN course_id SET NOT NULL,
        ADD CONSTRAINT orders_course_id_fkey FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
        DROP CONSTRAINT orders_final_total_check,
        DROP CONSTRAINT orders_discount_total_check,
        DROP CONSTRAINT orders_subtotal_check,
        DROP COLUMN discount_total,
        DROP COLUMN subtotal;
      ALTER TABLE orders RENAME COLUMN final_total TO amount;
      ALTER TABLE orders
        ADD CONSTRAINT orders_amount_check CHECK (amount >= 0),
        ALTER COLUMN currency TYPE varchar(3),
        ALTER COLUMN code TYPE varchar(32);
      ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_new";
      CREATE TYPE "OrderStatus" AS ENUM ('PENDING','PROCESSING','COMPLETED','EXPIRED','CANCELLED');
      ALTER TABLE orders
        ALTER COLUMN status TYPE "OrderStatus" USING status::text::"OrderStatus";
      DROP TYPE "OrderStatus_new";
    `);
  }
}
