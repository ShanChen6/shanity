import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hardening found by review of PAY3-PAY9:
 * - order_items.position preserves the order the buyer chose (rows of one
 *   INSERT share created_at, so it could not be recovered before);
 * - orders.currency regains its DEFAULT 'VND' (entity/requirement say so);
 * - items can only be added while the order is still PENDING, so a COMPLETED
 *   or REFUNDED order can never gain extra lines.
 */
export class PaymentHardening1791849600001 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`
      ALTER TABLE orders ALTER COLUMN currency SET DEFAULT 'VND';
      -- Orders created before this migration keep position 0 (their order
      -- was never recorded); new orders number their items 0..n-1.
      ALTER TABLE order_items ADD COLUMN position smallint NOT NULL DEFAULT 0
        CHECK (position >= 0);
      ALTER TABLE order_items ALTER COLUMN position DROP DEFAULT;

      CREATE FUNCTION order_items_require_pending_order() RETURNS trigger LANGUAGE plpgsql AS $fn$
      BEGIN
        IF (SELECT status FROM orders WHERE id = NEW.order_id) IS DISTINCT FROM 'PENDING' THEN
          RAISE EXCEPTION 'items can only be added to a PENDING order'
            USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN NEW;
      END $fn$;
      CREATE TRIGGER order_items_require_pending_order BEFORE INSERT ON order_items
        FOR EACH ROW EXECUTE FUNCTION order_items_require_pending_order();
    `);
  }

  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`
      DROP TRIGGER order_items_require_pending_order ON order_items;
      DROP FUNCTION order_items_require_pending_order();
      ALTER TABLE order_items DROP COLUMN position;
      ALTER TABLE orders ALTER COLUMN currency DROP DEFAULT;
    `);
  }
}
