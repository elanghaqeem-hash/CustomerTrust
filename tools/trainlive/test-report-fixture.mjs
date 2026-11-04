// Integration fixture ONLY; never run against non-disposable databases.
import pg from 'pg';
const classId=process.argv[2];
if(process.env.CI!=='true')throw new Error('This script is CI-only and must use a disposable database');
if(!process.env.DATABASE_URL_ADMIN||!classId)throw new Error('Usage: node test-report-fixture.mjs CLASS_ID');
const db=new pg.Client({connectionString:process.env.DATABASE_URL_ADMIN});
await db.connect();
try{
 await db.query('BEGIN');
 const row=(await db.query(
  'INSERT INTO trainlive.participant(class_id,display_name,unit,consent_at) VALUES($1,$2,$3,now()) RETURNING id',
  [classId,'Participant Assessment Fixture','Unit Test']
 )).rows[0];
 for(const key of ['PRE','POST']){
  const item=(await db.query(
   'SELECT id,payload FROM trainlive.class_item WHERE class_id=$1 AND item_key=$2',
   [classId,key])).rows[0];
  if(!item||item.payload.questions?.length!==10)throw new Error('Expected 10 test questions for '+key);
  const answers=item.payload.questions.map((q,i)=>{
   if((key==='PRE'&&i<3)||(key==='POST'&&i<1))return q.correct==='A'?'B':'A';
   return q.correct;
  });
  await db.query(
   'INSERT INTO trainlive.response(class_id,class_item_id,participant_id,answer_json) VALUES($1,$2,$3,$4)',
   [classId,item.id,row.id,JSON.stringify({answers})]);
 }
 await db.query('COMMIT');
 console.info('Created disposable fixture with PRE=70 and POST=90');
}catch(e){await db.query('ROLLBACK');throw e}
finally{await db.end()}
