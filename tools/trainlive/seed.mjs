import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import pg from 'pg';

// Publishes every seed/customer-trust-challenge.vN.json in version order.
// A published version is immutable: re-running only verifies it byte-for-byte.
// Content changes therefore always ship as a NEW vN file, never as an edit.
const here = dirname(fileURLToPath(import.meta.url));
const seedDir = resolve(here, '../../seed');
const versions = fs.readdirSync(seedDir)
  .map(f => ({ f, m: /^customer-trust-challenge\.v(\d+)\.json$/.exec(f) }))
  .filter(x => x.m)
  .map(x => ({ no: Number(x.m[1]), content: JSON.parse(fs.readFileSync(resolve(seedDir, x.f), 'utf8')) }))
  .sort((a, b) => a.no - b.no);
if (!versions.length) throw new Error('No seed versions found');
if (!process.env.DATABASE_URL_ADMIN) throw new Error('DATABASE_URL_ADMIN required');
const db = new pg.Client({connectionString:process.env.DATABASE_URL_ADMIN});
await db.connect();
try {
 for (const { no, content } of versions) {
  await db.query('BEGIN');
  try {
   const org = (await db.query(
     "INSERT INTO trainlive.organization(name,slug,branding_json) VALUES($1,'bank-sulteng',$2) ON CONFLICT(slug) DO UPDATE SET name=EXCLUDED.name RETURNING id",
     [content.program.organization,JSON.stringify({navy:'#0C1E33',gold:'#B0801F',teal:'#0D6E6D',background:'#FAF8F4'})]
   )).rows[0];
   const program = (await db.query(
     "INSERT INTO trainlive.program(organization_id,code,title) VALUES($1,$2,$3) ON CONFLICT(code) DO UPDATE SET title=EXCLUDED.title RETURNING id",
     [org.id,content.program.code,content.program.title]
   )).rows[0];
   const existing = (await db.query(
     'SELECT id,status,source_yaml FROM trainlive.content_version WHERE program_id=$1 AND version_no=$2 FOR UPDATE',
     [program.id,no]
   )).rows[0];
   const canonical = JSON.stringify(content);
   if (existing?.status === 'published' || existing?.status === 'archived') {
     if (existing.source_yaml!==canonical) throw new Error(`Published v${no} has different content; create v${no+1} rather than editing`);
     await db.query('COMMIT');
     console.info(`Existing published v${no} content verified. Version ID:`, existing.id);
     continue;
   }
   const version = existing ?? (await db.query(
     "INSERT INTO trainlive.content_version(program_id,version_no,status,source_yaml) VALUES($1,$2,'draft',$3) RETURNING id",
     [program.id,no,canonical]
   )).rows[0];
   if (existing) await db.query('UPDATE trainlive.content_version SET source_yaml=$2 WHERE id=$1',[version.id,canonical]);
   for (const [i,item] of content.items.entries()) {
     await db.query(
       "INSERT INTO trainlive.content_item(content_version_id,item_key,type,module_no,slide_ref,order_no,payload) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(content_version_id,item_key) DO UPDATE SET payload=EXCLUDED.payload,type=EXCLUDED.type,module_no=EXCLUDED.module_no,slide_ref=EXCLUDED.slide_ref,order_no=EXCLUDED.order_no",
       [version.id,item.key,item.type,item.module,item.slide??null,i+1,JSON.stringify(item)]
     );
   }
   for (const ws of content.worksheets) {
     await db.query(
       "INSERT INTO trainlive.worksheet_template(content_version_id,ws_key,title,module_no,slide_ref,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(content_version_id,ws_key) DO UPDATE SET title=EXCLUDED.title,module_no=EXCLUDED.module_no,slide_ref=EXCLUDED.slide_ref,payload=EXCLUDED.payload",
       [version.id,ws.key,ws.title,ws.module,ws.slide??null,JSON.stringify(ws)]
     );
   }
   await db.query("UPDATE trainlive.content_version SET status='published',published_at=now() WHERE id=$1",[version.id]);
   await db.query('COMMIT');
   console.info(`CTC v${no} published:`,version.id,'items:',content.items.length,'worksheets:',content.worksheets.length);
  } catch (e) { await db.query('ROLLBACK'); throw e; }
 }
} finally { await db.end(); }
