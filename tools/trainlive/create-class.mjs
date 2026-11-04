import pg from 'pg';
import { randomInt } from 'node:crypto';
if (!process.env.DATABASE_URL_ADMIN) throw new Error('DATABASE_URL_ADMIN required');
const [date,batch,name] = process.argv.slice(2);
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !batch) {
 throw new Error('Usage: node create-class.mjs YYYY-MM-DD BATCH-01 [name] (WITA)');
}
const start = new Date(date+'T09:00:00+08:00'), end = new Date(date+'T16:00:00+08:00');
if (Number.isNaN(start.getTime()) || start.toISOString().slice(0,10)!==date) throw new Error('Invalid date');
const db = new pg.Client({connectionString:process.env.DATABASE_URL_ADMIN});
await db.connect();
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code=()=>Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');
try {
 await db.query('BEGIN');
 const v=(await db.query(
  "SELECT p.id program_id,v.id version_id FROM trainlive.program p JOIN trainlive.content_version v ON v.program_id=p.id WHERE p.code='CTC-BPDSULTENG' AND v.version_no=1 AND v.status='published'"
 )).rows[0];
 if(!v) throw new Error('Seed must be published first');
 let row;
 for(let i=0;i<8;i++){
   await db.query('SAVEPOINT code_attempt');
   try {
     row=(await db.query(
       "INSERT INTO trainlive.class_session(program_id,content_version_id,name,batch_no,start_at,end_at,timezone,join_code,join_open_from,join_open_until,capacity) VALUES($1,$2,$3,$4,$5,$6,'Asia/Makassar',$7,$8,$9,25) RETURNING id,join_code",
       [v.program_id,v.version_id,name||'Customer Trust Challenge '+batch,batch,start,end,code(),
        new Date(start.getTime()-86400000),new Date(end.getTime()+86400000)]
     )).rows[0];
     await db.query('RELEASE SAVEPOINT code_attempt');
     break;
   } catch(e) {
     await db.query('ROLLBACK TO SAVEPOINT code_attempt');
     if(e.code!=='23505') throw e;
   }
 }
 if(!row) throw new Error('Could not generate unique join code');
 await db.query('COMMIT');
 console.info(JSON.stringify({class_id:row.id,join_code:row.join_code,batch,date,
  note:'Treat the join code as a credential; distribute only during the class join window.'},null,2));
} catch(e) { await db.query('ROLLBACK'); throw e; }
finally { await db.end(); }
