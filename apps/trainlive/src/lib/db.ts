import { Pool, type PoolClient } from 'pg';
import { runtimePoolConfig } from './db-config';

type Claims = { classId?:string; tenantId?:string; participantId?:string; staffId?:string };
const globalForPg = globalThis as unknown as { trainlivePg?:Pool };
function getPool() {
 if (globalForPg.trainlivePg) return globalForPg.trainlivePg;
 const pool = new Pool(runtimePoolConfig());
 // An idle client dropped by the server/pooler must not crash the process.
 // Never log the error object: it can include connection details.
 pool.on('error', () => { console.error('trainlive: idle PostgreSQL client error'); });
 return globalForPg.trainlivePg = pool;
}
export async function transaction<T>(claims:Claims|null, fn:(c:PoolClient)=>Promise<T>):Promise<T> {
 const client=await getPool().connect();
 try {
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE trainlive_app');
  if (claims) {
   await client.query(
    'SELECT set_config($1,$2,true),set_config($3,$4,true),set_config($5,$6,true),set_config($7,$8,true)',
    ['trainlive.class_id',claims.classId||'','trainlive.participant_id',claims.participantId||'',
     'trainlive.staff_id',claims.staffId||'','trainlive.tenant_id',claims.tenantId||'']
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
