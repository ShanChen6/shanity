import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CoursePricing1791590400001 implements MigrationInterface {
  async up(queryRunner: QueryRunner) {
    await queryRunner.query(`
      CREATE TYPE "CourseAccessType" AS ENUM ('FREE','PAID');

      ALTER TABLE courses
        ADD COLUMN access_type "CourseAccessType" NOT NULL DEFAULT 'FREE',
        ADD COLUMN currency varchar(3) NOT NULL DEFAULT 'VND',
        ALTER COLUMN price TYPE bigint;
      -- Backfill without bumping updated_at on every paid course.
      ALTER TABLE courses DISABLE TRIGGER courses_updated_at;
      UPDATE courses SET access_type = 'PAID' WHERE price > 0;
      ALTER TABLE courses ENABLE TRIGGER courses_updated_at;
      ALTER TABLE courses
        ADD CONSTRAINT courses_currency_check CHECK (currency IN ('VND','USD')),
        ADD CONSTRAINT courses_access_type_price_check CHECK (
          (access_type = 'FREE' AND price = 0) OR (access_type = 'PAID' AND price > 0)
        );

      ALTER TABLE orders
        ALTER COLUMN amount TYPE bigint,
        ADD COLUMN currency varchar(3) NOT NULL DEFAULT 'VND',
        ADD CONSTRAINT orders_currency_check CHECK (currency IN ('VND','USD'));
      ALTER TABLE orders ALTER COLUMN currency DROP DEFAULT;
      ALTER TABLE payment_transactions ALTER COLUMN amount TYPE bigint;

      CREATE TABLE order_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL,
        course_id uuid NOT NULL,
        unit_price_snapshot bigint NOT NULL CHECK (unit_price_snapshot >= 0),
        currency varchar(3) NOT NULL CHECK (currency IN ('VND','USD')),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_order_items_order" FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
        CONSTRAINT "FK_order_items_course" FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT
      );
      CREATE UNIQUE INDEX order_items_order_course_key ON order_items(order_id, course_id);
      CREATE INDEX order_items_course_idx ON order_items(course_id);
      -- Existing orders already froze their price in orders.amount.
      INSERT INTO order_items(order_id, course_id, unit_price_snapshot, currency, created_at)
        SELECT id, course_id, amount, currency, created_at FROM orders;

      CREATE TABLE course_price_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id uuid NOT NULL,
        old_price bigint NOT NULL CHECK (old_price >= 0),
        new_price bigint NOT NULL CHECK (new_price >= 0),
        old_currency varchar(3) NOT NULL CHECK (old_currency IN ('VND','USD')),
        new_currency varchar(3) NOT NULL CHECK (new_currency IN ('VND','USD')),
        old_access_type "CourseAccessType" NOT NULL,
        new_access_type "CourseAccessType" NOT NULL,
        cancelled_pending_orders integer NOT NULL DEFAULT 0 CHECK (cancelled_pending_orders >= 0),
        changed_by_user_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_course_price_logs_course" FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
        CONSTRAINT "FK_course_price_logs_user" FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE INDEX course_price_logs_course_created_idx ON course_price_logs(course_id, created_at);
    `);
  }

  // Narrowing bigint back to integer fails if a price exceeds 2^31-1, which is
  // the correct outcome: the rollback must not silently truncate money.
  async down(queryRunner: QueryRunner) {
    await queryRunner.query(`
      DROP TABLE course_price_logs;
      DROP TABLE order_items;
      ALTER TABLE payment_transactions ALTER COLUMN amount TYPE integer;
      ALTER TABLE orders
        DROP CONSTRAINT orders_currency_check,
        DROP COLUMN currency,
        ALTER COLUMN amount TYPE integer;
      ALTER TABLE courses
        DROP CONSTRAINT courses_access_type_price_check,
        DROP CONSTRAINT courses_currency_check,
        DROP COLUMN currency,
        DROP COLUMN access_type,
        ALTER COLUMN price TYPE integer;
      DROP TYPE "CourseAccessType";
    `);
  }
}
