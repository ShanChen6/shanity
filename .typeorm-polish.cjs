const fs=require('node:fs');
for(const p of ['apps/api/src/auth/auth.service.ts','apps/api/src/auth/auth.controller.ts','apps/api/src/auth/google.service.ts','apps/api/src/avatar/avatar.service.ts']){
 let s=fs.readFileSync(p,'utf8').replace(/\.then\(\(result\) => \[\[\], result\.affected\]\)\s*\.then\(\(\[, count\]\) => count\)/g,'.then((result) => result.affected)').replaceAll('{ id: id }','{ id }');
 // findOne expresses the intent directly, retaining pessimistic transaction locks.
 s=s.replace(/\.find\(\{([\s\S]*?)\n\s*\}\)\s*\.then\(\(rows\) => rows\[0\]\)/g, (_m,body)=>'.findOne({'+body.replace(/\s*take: 1,/, '')+'\n})');
 fs.writeFileSync(p,s);
}
const replacements={
 'docs/course-schema.md':[
  [/C2 introduces TypeORM 1\.1[\s\S]*?See \[TypeORM DataSource options\]\(https:\/\/typeorm.io\/docs\/data-source\/data-source-options\/\)\./, 'The entire backend now uses TypeORM 1.1, including Course/User entities and\nmigrations. `DatabaseModule` exports the shared TypeORM `DataSource`. Schema\nsynchronization and automatic startup migrations are disabled. See\n[TypeORM migration and upgrade guide](typeorm.md) for configuration and deployment.'],
  ['`202610020002_course_schema.mjs`','`src/database/migrations/202610020002_course_schema.ts`'],
  ['both Knex and TypeORM updates','ORM and direct SQL updates'],
  [/Use the Knex CLI's named `migrate:down` for C2, not a batch\nrollback that would also attempt older migrations\./,'Use `pnpm --filter api db:revert` to revert the latest migration only.'],
  [/The schema test builds the API[\s\S]*$/,'The database tests build the API and use randomly named schemas. They exercise\nfresh TypeORM migrations and upgrading from a frozen legacy SQL fixture, preserving\nrecords in all five statuses. They cover Up/Down/Up, enum/timestamp definitions,\nindexes, required fields, uniqueness, instructor FK/deletion restrictions, timestamps\nand real TypeORM relation loading. Each test removes only its own schema.\n\nAPI `typecheck` now includes production source and e2e tests. The previous\nSupertest type diagnostics have been fixed during the full TypeORM conversion.\nNo CRUD or course endpoints are implemented.\n'],
 ],
 'docs/auth.md':[[ 'NestJS tiếp tục dùng Knex + pg.', 'NestJS dùng TypeORM + pg cho toàn bộ runtime và migration; xem [nâng cấp database](typeorm.md).'],['202609270004_auth.mjs','202609270004_auth.ts']],
 'docs/admin.md':[['NestJS + PostgreSQL qua Knex, schema bằng SQL migration; không có ORM User entity. `UserRow` nằm trong `auth.service.ts`.','NestJS + PostgreSQL qua TypeORM, có User entity và SQL migration; xem [TypeORM](typeorm.md).'],['202610010001_user_update_at.mjs','202610010001_user_update_at.ts']],
 'docs/admin-login.md':[['There is no separate JWT strategy/User entity/Role enum service: jose signs/verifies HS256 JWTs; Knex accesses users, user_roles and roles;', 'jose signs/verifies HS256 JWTs; TypeORM entities/repositories and parameterized SQL access users, user_roles and roles;']],
 'docs/avatar-management.md':[['apps/api/database/migrations/202610020001_user_avatar.mjs','apps/api/src/database/migrations/202610020001_user_avatar.ts']],
};
for(const [p,reps] of Object.entries(replacements)){let s=fs.readFileSync(p,'utf8');for(const [a,b] of reps)s=s.replace(a,b);fs.writeFileSync(p,s);}
