// Trusted operator only; DO NOT expose as a public API or run using the web role.
// A facilitator must already have an approved, MFA-backed SSO identity on a class.
// The promotion requires a DB migration-owner connection and is auditable.
import pg from 'pg';
const [classId,email,confirmation]=process.argv.slice(2);
if(!classId||!email||confirmation!=='APPROVE-TRAINLIVE-SUPER-ADMIN')
 throw Error('Usage: node promote-admin.mjs CLASS_UUID approved-email APPROVE-TRAINLIVE-SUPER-ADMIN');
if(!process.env.DATABASE_URL_ADMIN)throw Error('DATABASE_URL_ADMIN required');
const db=new pg.Client({connectionString:process.env.DATABASE_URL_ADMIN});
await db.connect();
try{
 await db.query('BEGIN');
 const result=await db.query(
  `UPDATE trainlive.staff_user u SET is_super_admin=true
   WHERE lower(u.email)=lower($1)
    AND EXISTS(SELECT 1 FROM trainlive.class_staff s
      WHERE s.user_id=u.id AND s.class_id=$2 AND s.role='facilitator')
   RETURNING u.id`,[email,classId]);
 if(result.rowCount!==1)throw Error('No facilitator assigned to this source class');
 await db.query(
  `INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json)
   VALUES($1,'operator',$2,'staff.promote_super_admin','staff_user',
          jsonb_build_object('approved_by','operator','purpose','class_provisioning'))`,
  [result.rows[0].id,classId]);
 await db.query('COMMIT');
 console.info('Admin role assigned to the approved, pre-assigned facilitator. No secret or token emitted.');
}catch(e){await db.query('ROLLBACK');throw e}
finally{await db.end()}
