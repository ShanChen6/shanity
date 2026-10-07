import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PAY6-PAY9: the gateway is chosen at checkout, not at order creation.
 *
 * - orders.payment_method (VIETQR | MANUAL_BANK, NOT NULL) becomes
 *   orders.payment_provider, typed with the shared "PaymentProvider" enum and
 *   NULL until the buyer starts checkout.
 * - An INITIATED ledger row records what the gateway actually received, so its
 *   currency may be completed like its amount (previously frozen at creation,
 *   which made a wrong-currency payment impossible to book).
 * - Partial indexes keep the reconcilers' sweeps cheap.
 */
export class CheckoutProviders1791763200001 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`
      ALTER TABLE orders RENAME COLUMN payment_method TO payment_provider;
      ALTER TABLE orders
        ALTER COLUMN payment_provider DROP NOT NULL,
        ALTER COLUMN payment_provider TYPE "PaymentProvider"
          USING payment_provider::text::"PaymentProvider";
      DROP TYPE "PaymentMethod";

      CREATE OR REPLACE FUNCTION payment_transactions_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
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
           OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
          RAISE EXCEPTION 'payment_transactions order and provider are immutable'
            USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
      END $fn$;

      CREATE INDEX payment_transactions_initiated_idx
        ON payment_transactions(created_at) WHERE status = 'INITIATED';
      CREATE INDEX orders_completed_updated_idx
        ON orders(updated_at) WHERE status = 'COMPLETED';
    `);
  }

  // Refuses rather than rewriting history: a gateway the old enum cannot
  // express (e.g. STRIPE) would otherwise be silently relabelled.
  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM orders WHERE payment_provider NOT IN ('VIETQR','MANUAL_BANK')) THEN
          RAISE EXCEPTION 'orders paid through other gateways exist; refusing to relabel them';
        END IF;
      END $$;

      CREATE OR REPLACE FUNCTION payment_transactions_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
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

      DROP INDEX orders_completed_updated_idx;
      DROP INDEX payment_transactions_initiated_idx;

      CREATE TYPE "PaymentMethod" AS ENUM ('VIETQR','MANUAL_BANK');
      -- Orders created before checkout was chosen defaulted to VietQR.
      ALTER TABLE orders
        ALTER COLUMN payment_provider TYPE "PaymentMethod"
          USING COALESCE(payment_provider::text, 'VIETQR')::"PaymentMethod";
      ALTER TABLE orders
        ALTER COLUMN payment_provider SET NOT NULL;
      ALTER TABLE orders RENAME COLUMN payment_provider TO payment_method;
    `);
  }
}
