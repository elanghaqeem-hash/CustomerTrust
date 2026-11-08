import {NextResponse} from 'next/server';
import {z} from 'zod';
import {transaction} from '@/lib/db';
import {guardClass,privateError,requireSameOrigin} from '@/lib/api';
import {LMS_ENABLED} from '@/lib/lms-flags';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const setting=z.enum([
 'branding.primary_color','branding.logo_url','learning.default_passing_grade',
 'learning.default_sequential','learning.default_delivery_mode',
 'certificate.enabled','certificate.issuer_name'
]);
async function authorized(classId:string){
 const auth=await guardClass(classId,'staff');
 if(auth.response)return {response:auth.response};
 if(auth.session?.kind!=='staff')return {response:NextResponse.json({error:'forbidden'},{status:403})};
 return {staffId:auth.session.staffId};
}
export async function GET(req:Request,{params}:{params:Promise<{classId:string;tenantId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const {classId,tenantId}=await params;
 if(!z.string().uuid().safeParse(tenantId).success)
  return NextResponse.json({error:'invalid tenant id'},{status:400});
 const auth=await authorized(classId);if(auth.response)return auth.response;
 const key=setting.safeParse(new URL(req.url).searchParams.get('key'));
 if(!key.success)return NextResponse.json({error:'Kunci parameter tidak valid'},{status:400});
 try{
  const result=await transaction({classId,staffId:auth.staffId},async db=>
   (await db.query<{result:Record<string,unknown>}>(
    'SELECT trainlive.lms_admin_scoped_setting_history($1,$2::uuid,$3) AS result',
    [classId,tenantId,key.data])).rows[0]?.result);
  return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e);}
}
export async function POST(req:Request,{params}:{params:Promise<{classId:string;tenantId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {classId,tenantId}=await params;
 if(!z.string().uuid().safeParse(tenantId).success)
  return NextResponse.json({error:'invalid tenant id'},{status:400});
 const auth=await authorized(classId);if(auth.response)return auth.response;
 const input=z.object({action:z.literal('rollback'),key:setting,
  revision:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)}).strict()
  .safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Revisi pengaturan tidak valid'},{status:400});
 try{
  const result=await transaction({classId,staffId:auth.staffId},async db=>
   (await db.query<{result:Record<string,unknown>}>(
    'SELECT trainlive.lms_tenant_setting_request_rollback($1::uuid,$2,$3::bigint) AS result',
    [tenantId,input.data.key,input.data.revision])).rows[0]?.result);
  return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e);}
}
