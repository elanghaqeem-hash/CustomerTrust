// Production-safe operator provisioning: assigns class staff WITHOUT generating JWTs.
// Actual login requires a verified OIDC issuer, MFA and a matching class assignment.
import pg from 'pg';
const [classId,rawEmail,role='facilitator',displayName='Facilitator'] = process.argv.slice(2);
const email=rawEmail?.trim().toLowerCase();
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(classId||'') ||
    !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254 ||
    !['facilitator','cohost','observer'].includes(role) ||
    displayName.length<2 || displayName.length>100) {
  throw Error('Usage: node assign-staff.mjs CLASS_UUID verified-staff-email [facilitator|cohost|observer] [display-name]');
}
if (!process.env.DATABASE_URL_ADMIN) throw Error('DATABASE_URL_ADMIN required');
const db=new pg.Client({connectionString:process.env.DATABASE_URL_ADMIN});
await db.connect();
try {
  await db.query('BEGIN');
  const exists=(await db.query('SELECT 1 FROM trainlive.class_session WHERE id=$1 FOR UPDATE',[classId])).rowCount;
  if (!exists) throw Error('Class does not exist');
  const user=(await db.query(
    'INSERT INTO trainlive.staff_user(email,display_name) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING id',
    [email,displayName])).rows[0];
  await db.query(
    'INSERT INTO trainlive.class_staff(class_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(class_id,user_id) DO UPDATE SET role=EXCLUDED.role',
    [classId,user.id,role]);
  await db.query(
    "INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json) VALUES($1,'operator',$2,'staff.assign','class_staff',jsonb_build_object('role',$3))",
    [user.id,classId,role]);
  await db.query('COMMIT');
  console.log('Staff assignment saved. Use the company SSO/MFA login; no bearer token was created.');
} catch (error) {
  await db.query('ROLLBACK');
  throw error;
} finally {
  await db.end();
}
