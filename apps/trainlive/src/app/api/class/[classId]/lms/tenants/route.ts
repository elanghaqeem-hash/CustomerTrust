import {NextResponse} from 'next/server';
import {z} from 'zod';
import {transaction} from '@/lib/db';
import {guardClass,privateError,requireSameOrigin} from '@/lib/api';
import {LMS_ENABLED} from '@/lib/lms-flags';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const name=z.string().trim().min(2).max(160).regex(/^[^\x00-\x1f\x7f<>]+$/);
const role=z.enum(['tenant_admin','learning_manager','course_author','viewer']);
const changes=z.discriminatedUnion('action',[
 z.object({action:z.literal('create_tenant'),name,slug:z.string().regex(/^[a-z][a-z0-9-]{2,62}$/)}).strict(),
 z.object({action:z.literal('update_tenant'),tenantId:z.string().uuid(),name,
  status:z.enum(['onboarding','active','suspended'])}).strict(),
 z.object({action:z.literal('assign_role'),tenantId:z.string().uuid(),
  email:z.string().trim().toLowerCase().email().max(254),role}).strict(),
 z.object({action:z.literal('revoke_role'),tenantId:z.string().uuid(),staffId:z.string().uuid()}).strict()
]);
async function authorized(classId:string){
 const auth=await guardClass(classId,'staff');
 if(auth.response)return {response:auth.response};
 if(auth.session?.kind!=='staff')return {response:NextResponse.json({error:'forbidden'},{status:403})};
 return {staffId:auth.session.staffId};
}
export async function GET(_req:Request,{params}:{params:Promise<{classId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const {classId}=await params;
 const auth=await authorized(classId);if(auth.response)return auth.response;
 try{
  const result=await transaction({classId,staffId:auth.staffId},async db=>
   (await db.query<{result:Record<string,unknown>}>(
    'SELECT trainlive.lms_admin_tenants($1) AS result',[classId]
   )).rows[0]?.result);
  return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e);}
}
export async function POST(req:Request,{params}:{params:Promise<{classId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {classId}=await params;
 const auth=await authorized(classId);if(auth.response)return auth.response;
 const parsed=changes.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({error:'Permintaan tenant tidak valid'},{status:400});
 const data=parsed.data;
 try{
  const result=await transaction({classId,staffId:auth.staffId},async db=>{
   if(data.action==='create_tenant')
    return (await db.query<{result:Record<string,unknown>}>(
     'SELECT trainlive.lms_admin_create_tenant($1,$2,$3) AS result',
     [classId,data.name,data.slug])).rows[0]?.result;
   if(data.action==='update_tenant')
    return (await db.query<{result:Record<string,unknown>}>(
     'SELECT trainlive.lms_admin_update_tenant($1,$2::uuid,$3,$4) AS result',
     [classId,data.tenantId,data.name,data.status])).rows[0]?.result;
   if(data.action==='assign_role')
    return (await db.query<{result:Record<string,unknown>}>(
     'SELECT trainlive.lms_admin_assign_tenant_role($1,$2::uuid,$3,$4) AS result',
     [classId,data.tenantId,data.email,data.role])).rows[0]?.result;
   return (await db.query<{result:Record<string,unknown>}>(
    'SELECT trainlive.lms_admin_revoke_tenant_role($1,$2::uuid,$3::uuid) AS result',
    [classId,data.tenantId,data.staffId])).rows[0]?.result;
  });
  return NextResponse.json(result,{status:data.action==='create_tenant'?201:200,
   headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e);}
}
