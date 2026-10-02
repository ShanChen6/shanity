const fs = require('node:fs');
const root='apps/api/src/database/migrations'; fs.mkdirSync(root,{recursive:true});
const files=fs.readdirSync('apps/api/database/migrations').filter(x=>x.endsWith('.mjs')).sort();
const names=['Foundation','Community','AccessFoundation','Auth','UserUpdateAt','UserAvatar','CourseSchema'];
const imports=[], mappings=[];
for(let i=0;i<files.length;i++){
 const file=files[i], original=fs.readFileSync('apps/api/database/migrations/'+file,'utf8');
 const stamp=Date.UTC(+file.slice(0,4),+file.slice(4,6)-1,+file.slice(6,8))+Number(file.slice(8,12));
 const name=names[i]+stamp;
 let body=original.replace('export async function up(db)', 'async up(queryRunner: QueryRunner): Promise<void>')
  .replace(/export async function down\([^)]*\)/,'async down(queryRunner: QueryRunner): Promise<void>')
  .replaceAll('db.raw(', 'queryRunner.query(');
 if(names[i]==='UserAvatar')body=body.replace(/await db.schema.alterTable\([\s\S]*?\n  \}\);/, "await queryRunner.query('ALTER TABLE users ADD COLUMN avatar_key text');");
 if(names[i]!=='CourseSchema')body=body.replace('async down(queryRunner: QueryRunner)', 'async down(_queryRunner: QueryRunner)');
 fs.writeFileSync(root+'/'+file.replace('.mjs','.ts'), "import type { MigrationInterface, QueryRunner } from 'typeorm';\n\nexport class "+name+" implements MigrationInterface {\n"+body+'\n}\n');
 imports.push(`import { ${name} } from './${file.replace('.mjs','.js')}';`);
 mappings.push(`  { legacy: '${file}', name: '${name}', timestamp: ${stamp}, migration: ${name} },`);
}
fs.writeFileSync(root+'/index.ts',imports.join('\n')+'\n\nexport const migrationHistory = [\n'+mappings.join('\n')+'\n];\nexport const migrations = migrationHistory.map(entry => entry.migration);\n');
let p='apps/api/src/auth/auth.service.ts',s=fs.readFileSync(p,'utf8');
s=s.replace("import type { EntityManager } from 'typeorm';", "import type { EntityManager } from 'typeorm';\nimport { User } from '../users/user.entity.js';");
s=s.replace(/this.database.client.raw<\{[\s\S]*?\}>\(`/,'this.database.dataSource.query(`').replace('result.rows[0]','result[0]');
const start=s.indexOf('    const filtered =',s.indexOf('async listUsers'));
const end=s.indexOf('    // One extra query',start);
s=s.slice(0,start)+`    const filtered = this.database.dataSource.getRepository(User).createQueryBuilder('u');
    if (search) {
      const pattern = '%' + search.replace(/[\\\\%_]/g, '\\\\$&') + '%';
      filtered.andWhere('(u.displayName ILIKE :pattern OR u.email ILIKE :pattern)', { pattern });
    }
    if (status) filtered.andWhere('u.status = :status', { status });
    if (role) filtered.andWhere('u.id IN (SELECT user_id FROM user_roles WHERE role_code = :role)', { role });
    const total = await filtered.getCount();
    const rows = await filtered.orderBy('u.createdAt', 'DESC').addOrderBy('u.id', 'DESC')
      .take(limit).skip((page - 1) * limit).getMany();
`+s.slice(end);
s=s.replaceAll('displayName: row.display_name','displayName: row.displayName').replaceAll('createdAt: row.created_at','createdAt: row.createdAt').replaceAll('updatedAt: row.update_at','updatedAt: row.updatedAt');
fs.writeFileSync(p,s);
