const fs=require('node:fs');
const dir='apps/api/database/migrations';
const legacy=fs.readdirSync(dir).filter(x=>x.endsWith('.mjs') && x<'202610020002').sort().map(name=>{
 const content=fs.readFileSync(dir+'/'+name,'utf8');
 if(name.includes('user_avatar'))return 'ALTER TABLE users ADD COLUMN avatar_key text;';
 return content.match(/await db.raw\(`([\s\S]*?)`\)/)[1];
}).join('\n');
fs.mkdirSync('apps/api/database/fixtures',{recursive:true});
fs.writeFileSync('apps/api/database/fixtures/legacy-schema.sql','-- Frozen schema from the six pre-TypeORM migrations; test fixture only.\n'+legacy);
const seed='apps/api/database/seeds/001_demo.mjs';
let text=fs.readFileSync(seed,'utf8');
text=text.replace(/await trx\('courses'\)[\s\S]*?\.ignore\(\);/, `await trx.query(\`INSERT INTO courses(id,slug,title) VALUES ($1,$2,$3) ON CONFLICT(id) DO NOTHING\`, ['00000000-0000-4000-8000-000000000001', 'shanity-demo', 'Khóa học mẫu Shanity']);`);
text=text.replace(/await trx\('course_sections'\)[\s\S]*?\.ignore\(\);/, `await trx.query(\`INSERT INTO course_sections(id,course_id,title,position) VALUES ($1,$2,$3,0) ON CONFLICT(id) DO NOTHING\`, ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Bắt đầu']);`);
text=text.replace(/await trx\('lessons'\)[\s\S]*?\.ignore\(\);/, `await trx.query(\`INSERT INTO lessons(id,course_id,section_id,title,body,position) VALUES ($1,$2,$3,$4,$5,0) ON CONFLICT(id) DO NOTHING\`, ['00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'Chào mừng', 'Chào mừng bạn đến với Shanity.']);`);
fs.writeFileSync(seed,text);
