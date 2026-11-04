import { Pool, type PoolClient } from 'pg';

type Claims = { classId:string; participantId?:string; staffId?:string };
const globalForPg = globalThis as unknown as { trainlivePg?:Pool };
function getPool() {
 if (!process.env.DATABASE_URL_APP) throw new Error('DATABASE_URL_APP is not configured');
 return globalForPg.trainlivePg ??= new Pool({
  connectionString:process.env.DATABASE_URL_APP, max:10,
  idleTimeoutMillis:30000, statement_timeout:8000
 });
}
export async function transaction<T>(claims:Claims|null, fn:(c:PoolClient)=>Promise<T>):Promise<T> {
 const client=await getPool().connect();
 try {
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE trainlive_app');
  if (claims) {
   await client.query(
    'SELECT set_config($1,$2,true),set_config($3,$4,true),set_config($5,$6,true)',
    ['trainlive.class_id',claims.classId,'trainlive.participant_id',claims.participantId||'',
     'trainlive.staff_id',claims.staffId||'']
   );
  }
  const result=await fn(client);
  await client.query('COMMIT');
  return result;
 } catch(err) {
  await client.query('ROLLBACK').catch(()=>{});
  throw err;
 } finally {client.release();}
}
