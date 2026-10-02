const ts = require('./apps/api/node_modules/typescript');
const fs = require('node:fs');
const paths = [
  'apps/api/src/auth/auth.service.ts', 'apps/api/src/auth/google.service.ts', 'apps/api/src/auth/auth.controller.ts',
  'apps/api/src/avatar/avatar.service.ts',
  'apps/api/database/verify.mjs',
  ...fs.readdirSync('apps/api/test').filter(x => x.endsWith('.ts')).map(x => 'apps/api/test/' + x),
];
for (const path of paths) {
 let text = fs.readFileSync(path,'utf8'); const sf = ts.createSourceFile(path,text,99,true); const edits=[];
 const s=n=>n.getText(sf); const lit=n=>{ if(!ts.isStringLiteral(n))throw Error('not literal '+s(n));return n.text; };
 const quote=x=>x.split('.').map(y=>y==='*'?'*':'"'+y.replaceAll('"','""')+'"').join('.');
 const table=x=>x.split(/ as /i).map(quote).join(' AS ');
 function chain(n) {
  if (!ts.isCallExpression(n)) return null;
  if (ts.isPropertyAccessExpression(n.expression)) {
   const prev=chain(n.expression.expression);
   if(prev){prev.steps.push([n.expression.name.text,[...n.arguments]]);return prev;}
  }
  const root=s(n.expression).replace(/\s/g,'');
  if(['db','trx','this.database.client','this.auth.database.client'].includes(root) && n.arguments.length===1 && ts.isStringLiteral(n.arguments[0]))
   return {root,table:lit(n.arguments[0]),steps:[],type:n.typeArguments?.[0] && s(n.typeArguments[0])};
  return null;
 }
 function compile(c) {
  const values=[],where=[],joins=[],orders=[];let columns='*',op='select',sets='',insert='',returning='',first=false,pluck=null,locked=false,limit='';
  const param=n=>{ if (/^(trx|db)\.fn\.now\(\)$/.test(s(n)))return 'now()';values.push(s(n));return '$'+values.length; };
  const obj=n=>{if(!ts.isObjectLiteralExpression(n))throw Error('non-object '+s(n));return n.properties.map(p=>{if(ts.isSpreadAssignment(p))throw Error('spread'); return [ts.isStringLiteral(p.name)?p.name.text:s(p.name),ts.isShorthandPropertyAssignment(p)?p.name:p.initializer];});};
  for(const [name,a] of c.steps){
   if(name==='where' || name==='whereNot') {
    if(a.length===1){for(const [key,val] of obj(a[0]))where.push(quote(key)+(s(val)==='null'?' IS NULL':' = '+param(val)));}
    else where.push(quote(lit(a[0]))+' '+(name==='whereNot'?'<>':a.length===3?lit(a[1]):'=')+' '+param(a.at(-1)));
   } else if(name==='whereNull')where.push(quote(lit(a[0]))+' IS NULL');
   else if(name==='whereIn')where.push(quote(lit(a[0]))+' = ANY('+param(a[1])+')');
   else if(name==='join')joins.push('JOIN '+table(lit(a[0]))+' ON '+quote(lit(a[1]))+' = '+quote(lit(a[2])));
   else if(name==='first'||name==='select'){if(a.length)columns=a.map(x=>quote(lit(x))).join(', ');if(name==='first'){first=true;limit=' LIMIT 1';}}
   else if(name==='pluck'){pluck=lit(a[0]);columns=quote(pluck);}
   else if(name==='count')columns='count(*) AS '+quote(lit(a[0]).split(' as ')[1]);
   else if(name==='forUpdate')locked=true;
   else if(name==='orderBy')orders.push(quote(lit(a[0]))+' '+(a[1]?lit(a[1]).toUpperCase():'ASC'));
   else if(name==='returning')returning=a.map(x=>quote(lit(x))).join(', ');
   else if(name==='delete')op='delete';
   else if(name==='update'){op='update';sets=obj(a[0]).map(([k,v])=>quote(k)+' = '+param(v)).join(', ');}
   else if(name==='insert'){
    op='insert';const rows=ts.isArrayLiteralExpression(a[0])?[...a[0].elements]:[a[0]];
    const entries=rows.map(obj), keys=entries[0].map(([k])=>k);
    if(entries.some(e=>e.map(([k])=>k).join()!==keys.join()))throw Error('different keys');
    insert=' ('+keys.map(quote).join(', ')+') VALUES '+entries.map(e=>'('+e.map(([,v])=>param(v)).join(', ')+')').join(', ');
   } else throw Error('unsupported '+name);
  }
  let sql=op==='select'?'SELECT '+columns+' FROM '+table(c.table):op==='insert'?'INSERT INTO '+table(c.table)+insert:op==='update'?'UPDATE '+table(c.table)+' SET '+sets:'DELETE FROM '+table(c.table);
  if(joins.length)sql+=' '+joins.join(' ');
  if(where.length)sql+=' WHERE '+where.join(' AND ');
  if(orders.length)sql+=' ORDER BY '+orders.join(', ');
  sql+=limit+(locked?' FOR UPDATE':'');
  if(returning)sql+=' RETURNING '+returning;
  const root=c.root.replace('.client','.dataSource.manager');
  let result=root+'.query'+(c.type && op==='select'?'<'+c.type+'[]>':'')+'('+JSON.stringify(sql)+(values.length?', ['+values.join(', ')+']':'')+')';
  if(op==='update'||op==='delete')result+=returning?'.then(([rows]) => rows)':'.then(([, count]) => count)';
  if(first)result+='.then(rows => rows[0])';
  if(pluck)result+='.then(rows => rows.map((row'+(path.endsWith('.ts')?': { '+pluck+': string }':'')+') => row.'+pluck+'))';
  return result;
 }
 function visit(n){const c=chain(n); if(c){try {edits.push([n.getStart(sf),n.end,compile(c)]);return;}catch(e){console.log(path+': '+e.message);return;}}ts.forEachChild(n,visit);}
 visit(sf);for(const [start,end,value] of edits.sort((a,b)=>b[0]-a[0]))text=text.slice(0,start)+value+text.slice(end);
 text=text.replaceAll('this.database.client.transaction','this.database.dataSource.transaction').replaceAll('this.auth.database.client.transaction','this.auth.database.dataSource.transaction');
 text=text.replaceAll("import type { Knex } from 'knex';","import type { EntityManager } from 'typeorm';").replaceAll('Knex.Transaction','EntityManager').replaceAll('db: Knex = this.database.client','db: EntityManager = this.database.dataSource.manager');
 text=text.replaceAll("DatabaseService['client']","DatabaseService['dataSource']['manager']").replaceAll('app.get(DatabaseService).client','app.get(DatabaseService).dataSource.manager');
 text=text.replaceAll('trx.raw(', 'trx.query(');
 fs.writeFileSync(path,text);
}
