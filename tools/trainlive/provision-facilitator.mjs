// DEV/STAGING ONLY. Production staff identity must come from enterprise SSO/MFA.
import pg from 'pg';
import { createHmac } from 'node:crypto';
const [classId,email,displayName='Facilitator',flag] = process.argv.slice(2);
if(flag&&flag!=='--leave-scheduled')throw Error('Unknown flag');
if(!classId||!email)throw new Error('Usage: node provision-facilitator.mjs CLASS_UUID email [display-name]');
if(!process.env.DATABASE_URL_ADMIN||!process.env.TRAINLIVE_JWT_SECRET)throw new Error('Admin DB and JWT secret required');
if(Buffer.byteLength(process.env.TRAINLIVE_JWT_SECRET)<32)throw new Error('JWT secret must be at least 32 bytes');
const db=new pg.Client({connectionString:process.env.DATABASE_URL_ADMIN});await db.connect();
try{
 await db.query('BEGIN');
 const c=(await db.query('SELECT id,status FROM trainlive.class_session WHERE id=$1 FOR UPDATE',[classId])).rows[0];
 if(!c)throw Error('Unknown class');
 const u=(await db.query(
  'INSERT INTO trainlive.staff_user(email,display_name) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING id',
  [email,displayName])).rows[0];
 await db.query(
  "INSERT INTO trainlive.class_staff(class_id,user_id,role) VALUES($1,$2,'facilitator') ON CONFLICT(class_id,user_id) DO UPDATE SET role='facilitator'",
  [classId,u.id]);
 if(c.status==='scheduled'&&flag!=='--leave-scheduled')
  await db.query("UPDATE trainlive.class_session SET status='live' WHERE id=$1",[classId]);
 await db.query('COMMIT');
 const now=Math.floor(Date.now()/1000);
 const part=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const head=part({alg:'HS256',typ:'JWT'});
 const payload=part({kind:'staff',classId,staffId:u.id,iss:'trainlive',aud:'trainlive-web',iat:now,exp:now+8*3600});
 const signed=head+'.'+payload;
 const signature=createHmac('sha256',process.env.TRAINLIVE_JWT_SECRET).update(signed).digest('base64url');
 console.log('STAGING ONLY. Copy the following staff token into /host/'+classId+' (expires after 8 hours):');
 console.log(signed+'.'+signature);
}catch(e){await db.query('ROLLBACK');throw e}finally{await db.end()}
