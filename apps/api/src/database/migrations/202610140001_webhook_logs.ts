import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PAY10-PAY13: raw webhook audit log + late-webhook fulfilment.
 *
 * - webhook_logs keeps every authenticated delivery (verbatim payload) with a
 *   processing status. Two partial unique indexes make "this provider event was
 *   processed" a database fact: at most one PROCESSED row per
 *   (provider, provider_transaction_id) and per (provider, event_id).
 * - Payload and identity of a log row are immutable; only status/outcome/error
 *   /processed_at move, and a PROCESSED row is final.
 * - An EXPIRED order may now become COMPLETED: money paid inside the order's
 *   window must fulfil it even when the webhook is delivered hours later.
 */
export class WebhookLogs1791936000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`
      CREATE TYPE "WebhookLogStatus" AS ENUM ('PENDING','PROCESSED','FAILED','DUPLICATE');
      CREATE TABLE webhook_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        provider "PaymentProvider" NOT NULL,
        event_id varchar(150),
        provider_transaction_id varchar(150),
        payload jsonb NOT NULL,
        status "WebhookLogStatus" NOT NULL DEFAULT 'PENDING',
        outcome varchar(40),
        error_message text,
        processed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX idx_webhook_unique_event
        ON webhook_logs(provider, provider_transaction_id) WHERE status = 'PROCESSED';
      CREATE UNIQUE INDEX idx_webhook_unique_event_id
        ON webhook_logs(provider, event_id) WHERE status = 'PROCESSED' AND event_id IS NOT NULL;
      CREATE INDEX webhook_logs_pending_idx ON webhook_logs(created_at) WHERE status IN ('PENDING','FAILED');
      CREATE INDEX webhook_logs_provider_txn_idx ON webhook_logs(provider, provider_transaction_id);

      CREATE FUNCTION webhook_logs_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'webhook_logs rows are append-only (DELETE rejected)'
            USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW.provider IS DISTINCT FROM OLD.provider
           OR NEW.event_id IS DISTINCT FROM OLD.event_id
           OR NEW.payload IS DISTINCT FROM OLD.payload
           OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
          RAISE EXCEPTION 'webhook_logs payload and identity are immutable'
            USING ERRCODE = 'restrict_violation';
        END IF;
        IF OLD.status = 'PROCESSED' AND NEW IS DISTINCT FROM OLD THEN
          RAISE EXCEPTION 'a PROCESSED webhook log is final'
            USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
      END $fn$;
      CREATE TRIGGER webhook_logs_guard BEFORE UPDATE OR DELETE ON webhook_logs
        FOR EACH ROW EXECUTE FUNCTION webhook_logs_guard();

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
    `);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM webhook_logs) THEN
          RAISE EXCEPTION 'webhook_logs holds audit data; refusing to drop it';
        END IF;
      END $$;
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
          OR (OLD.status = 'COMPLETED' AND NEW.status = 'REFUNDED')
        ) THEN
          RAISE EXCEPTION 'illegal order status transition % -> %', OLD.status, NEW.status
            USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
      END $fn$;
      DROP TRIGGER webhook_logs_guard ON webhook_logs;
      DROP FUNCTION webhook_logs_guard();
      DROP TABLE webhook_logs;
      DROP TYPE "WebhookLogStatus";
    `);
  }
}
