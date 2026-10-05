const ts = require('./apps/api/node_modules/typescript');
const fs = require('node:fs');
const entities = {users:'User', user_roles:'UserRole',auth_sessions:'AuthSession',auth_identities:'AuthIdentity',oauth_requests:'OAuthRequest'};
const names={display_name:'displayName',password_hash:'passwordHash',avatar_key:'avatarKey',created_at:'createdAt',update_at:'updatedAt'};
for(const file of ['auth/auth.service.ts','auth/google.service.ts','auth/auth.controller.ts','avatar/avatar.service.ts']) {
 const path='apps/api/src/'+file;let text=fs.readFileSync(path,'utf8');const sf=ts.createSourceFile(path,text,99,true),edits=[],used=new Set();
 const s=n=>n.getText(sf);
 function visit(n){
  if(ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text==='query' && ts.isStringLiteral(n.arguments[0])){
   const sql=n.arguments[0].text,manager=s(n.expression.expression);
   if(!['trx','db','this.database.dataSource.manager','this.auth.database.dataSource.manager'].includes(manager))return;
   const params=n.arguments[1]&&ts.isArrayLiteralExpression(n.arguments[1])?[...n.arguments[1].elements].map(s):[];
   let m=sql.match(/^INSERT INTO "(\w+)" \(([^)]+)\) VALUES \(([^)]+)\)(?: RETURNING .+)?$/);
   if(m && entities[m[1]]){
    const table=m[1],entity=entities[table],keys=m[2].replaceAll('"','').split(', '),vals=m[3].split(', ').map(v=>params[Number(v.slice(1))-1]);
    if(vals.every(Boolean)){
     used.add(entity);edits.push([n.getStart(sf),n.end,`${manager}.getRepository(${entity}).insert({ ${keys.map((k,i)=>(table==='users'?names[k]||k:k)+': '+vals[i]).join(', ')} }).then(result => result.raw)`]);return;
    }
   }
   m=sql.match(/^UPDATE "(\w+)" SET (.+) WHERE (.+)$/);
   if(m && entities[m[1]]){
    const table=m[1],entity=entities[table],criteria=m[3].split(' AND ').map(x=>x.match(/^"(\w+)" = \$(\d+)$/)),sets=m[2].split(', ').map(x=>x.match(/^"(\w+)" = (\$\d+|now\(\))$/));
    if(criteria.every(Boolean)&&sets.every(Boolean)){
     const prop=k=>table==='users'?names[k]||k:k;
     used.add(entity);edits.push([n.getStart(sf),n.end,`${manager}.getRepository(${entity}).update({ ${criteria.map(x=>prop(x[1])+': '+params[+x[2]-1]).join(', ')} }, { ${sets.map(x=>prop(x[1])+': '+(x[2]==='now()'?"() => 'now()'":params[+x[2].slice(1)-1])).join(', ')} }).then(result => [[], result.affected])`]);return;
    }
   }
   m=sql.match(/^SELECT (.+) FROM "(\w+)" WHERE (.+) LIMIT 1( FOR UPDATE)?$/);
   if(m && entities[m[2]] && m[2]!=='users'){
    const entity=entities[m[2]],where=m[3].split(' AND ').map(clause=>clause.match(/^"(\w+)" = \$(\d+)$/));
    if(where.every(Boolean)){
     used.add(entity);const fields=m[1]==='*'?'':', select: { '+m[1].replaceAll('"','').split(', ').map(k=>k+': true').join(', ')+' }';
     edits.push([n.getStart(sf),n.end,`${manager}.getRepository(${entity}).find({ where: { ${where.map(x=>x[1]+': '+params[+x[2]-1]).join(', ')} }${fields}, take: 1${m[4]?", lock: { mode: 'pessimistic_write' }":''} })`]);return;
    }
   }
  }
  ts.forEachChild(n,visit);
 }
 visit(sf); for(const [start,end,value] of edits.sort((a,b)=>b[0]-a[0]))text=text.slice(0,start)+value+text.slice(end);
 if(used.has('User') && !text.includes("import { User }"))text="import { User } from '../users/user.entity.js';\n"+text;
 used.delete('User');const already=text.match(/import \{ ([^}]+) \} from '\.\/auth.entities.js';/);
 if(already){for(const x of already[1].split(', '))used.add(x);text=text.replace(already[0],'');}
 if(used.size)text=`import { ${[...used].join(', ')} } from '${file.startsWith('auth/')?'./auth.entities.js':'../auth/auth.entities.js'}';\n`+text;
 fs.writeFileSync(path,text);
}
