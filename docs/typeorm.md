# TypeORM backend

The backend now uses **TypeORM 1.1 + pg** for all runtime database access,
transactions, migrations, seeds and database tests. Knex is removed from the API
dependencies. `DatabaseService.dataSource` and the exported Nest `DataSource`
provider share one pool, opened/closed with application lifecycle hooks.

Entities cover `User`, `Course`, `Role`, `UserRole`, `AuthSession`, `AuthIdentity`,
`OAuthRequest` and `AuthRateLimit`. Repositories and QueryBuilder handle account,
session and identity access, user listing/statistics, row locks, and atomic OAuth
request consumption. Parameterized SQL through TypeORM is retained for
PostgreSQL-specific advisory locks, the atomic rate-limit upsert, migration-history
validation and health checks. Unused content/community tables remain managed by
migrations; this change adds no endpoints for them.

Passwords, refresh-token rotation, admin authorization and avatar replacement
retain their transaction boundaries and lock ordering. Every query inside a
transaction uses that transaction's manager. No automatic schema synchronization,
migration-on-start, extension installation, or cascade account deletion is enabled.
See [TypeORM migration execution](https://typeorm.io/docs/migrations/executing/).

## New databases

Configure the existing PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE environment
variables (`.env` at repository root is also supported), then run:

```sh
pnpm install --frozen-lockfile
pnpm --filter api db:migrate
pnpm --filter api db:seed
pnpm --filter api db:verify
```

These scripts compile the API first. Docker already compiles at build time and
executes `node database/cli.mjs migrate` followed by `node database/cli.mjs seed`.
Fresh databases run all seven migrations. Repeating migration/seed commands is
safe; seed does not overwrite an existing administrator's password.

## Existing databases with Knex history

Do not run an old Knex migration container concurrently with the new version.
Back up the database and test the following upgrade on a restored copy first:

```sh
pnpm --filter api db:adopt-legacy
pnpm --filter api db:verify
```

For Compose, build the new migrate image, then run adoption before normal startup:

```sh
docker compose build migrate
docker compose run --rm migrate node database/cli.mjs adopt-legacy
docker compose up -d --build
```

Adoption requires a contiguous prefix of the seven known legacy migration names,
an unlocked legacy migration ledger, and the expected baseline tables/columns.
It copies only the recorded migration identities into `typeorm_migrations`, then
TypeORM runs remaining migrations. Data, UUIDs, passwords, sessions, roles and
business tables are preserved. Both a six-migration database and one with C2
already applied are supported. Unknown/partial histories or missing baseline
columns fail instead of being silently treated as a valid schema.

`knex_migrations` and `knex_migrations_lock` remain archival tables. They are not
modified or deleted. After adoption, normal deployments use `db:migrate`.
An absent migration history does not authorize adopting arbitrary existing tables;
their CREATE statements fail and pending DDL rolls back.

The command runner holds a PostgreSQL advisory lock for the database/schema on
the same connection used by `MigrationExecutor`. Pending migrations run in one
transaction. Importing validated legacy history is a separate transaction, so
after a pending migration fails, a normal retry can resume from the imported
baseline. History validation is not a full drift audit: unexpected constraints,
custom triggers or column type changes should be reviewed on the restored copy.

## Migration development and rollback

TypeScript migrations live in `apps/api/src/database/migrations`; their SQL keeps
the historical DDL semantics. Register new migrations in `migrationHistory` in
chronological order. The seven legacy mappings must remain stable.
`dist/database/data-source.js` is available for TypeORM metadata tooling, but
**run migrations through `database/cli.mjs`** to retain locking and history checks.
Entities cover active features only; review generated SQL carefully, since it
must not remove historical tables, constraints or triggers absent from metadata.

```sh
pnpm --filter api db:revert
```

Revert undoes only the latest migration. C2 Down preserves courses and dependent
records but removes the new C2 column values and converts NULL descriptions to
empty strings. Back up those values before rollback. Earlier migrations continue
rejecting destructive rollback; use a forward migration or a verified restore.
Database trigger-generated timestamps should be reloaded after ORM writes.

## Validation

`pnpm --filter api test:database` requires a PostgreSQL database with a name ending
in `_test`. Each database test creates/removes its own random schema. Tests cover
fresh and concurrent migration runners, legacy adoption/rejections, existing C2,
Course constraints and relations, Up/Down/Up, and idempotent seeds. A frozen SQL
fixture represents the pre-TypeORM schema independently of the new migrations.

```sh
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api test
pnpm --filter api test:database
pnpm --filter api test:e2e
pnpm --filter web typecheck
pnpm --filter web lint
pnpm build
```

API typecheck now includes the e2e files. Their Supertest type issues are fixed.
The conversion has only been applied to isolated test databases during development;
the application database has not been migrated or restarted.
