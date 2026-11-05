import {NextResponse} from 'next/server';
import {guardClass,privateError} from '@/lib/api';
import {transaction} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(_req:Request,{params}:{params:Promise<{classId:string}>}){
 const {classId}=await params;
 const auth=await guardClass(classId,'staff');
 if(auth.response)return auth.response;
 const staff=auth.session!;
 if(staff.kind!=='staff')return NextResponse.json({error:'forbidden'},{status:403});
 try{
  const role=await transaction({classId:staff.classId,staffId:staff.staffId},async db=>
   (await db.query<{role:'facilitator'|'cohost'|'observer'}>(
     'SELECT role FROM trainlive.class_staff WHERE class_id=$1 AND user_id=$2',
     [staff.classId,staff.staffId])).rows[0]?.role);
  if(!role)return NextResponse.json({error:'forbidden'},{status:403});
  return NextResponse.json({classId:staff.classId,role,canManage:role!=='observer',canReport:true},
   {headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e)}
}
