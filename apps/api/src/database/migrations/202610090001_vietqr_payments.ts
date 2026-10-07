import type { MigrationInterface, QueryRunner } from 'typeorm';

export class VietQrPayments1791504000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`
      CREATE TYPE "OrderStatus" AS ENUM ('PENDING','PROCESSING','COMPLETED','EXPIRED','CANCELLED');
      CREATE TYPE "PaymentMethod" AS ENUM ('VIETQR','MANUAL_BANK');
      CREATE TYPE "PaymentTransactionStatus" AS ENUM ('INITIATED','SUCCESS','FAILED');
      CREATE TABLE orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(32) NOT NULL,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
        amount integer NOT NULL CHECK (amount >= 0), status "OrderStatus" NOT NULL,
        payment_method "PaymentMethod" NOT NULL, expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX orders_code_key ON orders(code);
      CREATE INDEX orders_user_id_idx ON orders(user_id);
      CREATE INDEX orders_pending_expiry_idx ON orders(status, expires_at);
      CREATE TABLE payment_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
        provider_transaction_id varchar(128), amount integer NOT NULL CHECK (amount > 0), transfer_content text NOT NULL,
        status "PaymentTransactionStatus" NOT NULL, raw_payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX payment_transactions_order_id_idx ON payment_transactions(order_id);
      CREATE UNIQUE INDEX payment_transactions_provider_id_key ON payment_transactions(provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;
      CREATE TABLE bank_webhook_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference_code varchar(128) NOT NULL,
        processed boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX bank_webhook_logs_reference_code_key ON bank_webhook_logs(reference_code);
    `);
  }
  async down(queryRunner: QueryRunner) {
    await queryRunner.query(
      `DROP TABLE bank_webhook_logs; DROP TABLE payment_transactions; DROP TABLE orders; DROP TYPE "PaymentTransactionStatus"; DROP TYPE "PaymentMethod"; DROP TYPE "OrderStatus";`,
    );
  }
}
