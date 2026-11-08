import {NextResponse} from 'next/server';
import {z} from 'zod';
import {transaction} from '@/lib/db';
import {guardClass,privateError,requireSameOrigin} from '@/lib/api';
import {LMS_ENABLED} from '@/lib/lms-flags';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function authorized(classId:string){
 const auth=await guardClass(classId,'staff');
 if(auth.response)return {response:auth.response};
 if(auth.session?.kind!=='staff')return {response:NextResponse.json({error:'forbidden'},{status:403})};
 return {staffId:auth.session.staffId};
}
export async function GET(_req:Request,{params}:{params:Promise<{classId:string;tenantId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const {classId,tenantId}=await params;
 if(!z.string().uuid().safeParse(tenantId).success)return NextResponse.json({error:'invalid tenant id'},{status:400});
 const auth=await authorized(classId);if(auth.response)return auth.response;
 try{
  const data=await transaction({classId,staffId:auth.staffId},async db=>
   (await db.query<{result:Record<string,unknown>}>(
    'SELECT trainlive.lms_tenant_setting_queue($1::uuid) AS result',[tenantId]
   )).rows[0]?.result);
  return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e);}
}
export async function POST(req:Request,{params}:{params:Promise<{classId:string;tenantId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {classId,tenantId}=await params;
 if(!z.string().uuid().safeParse(tenantId).success)return NextResponse.json({error:'invalid tenant id'},{status:400});
 const auth=await authorized(classId);if(auth.response)return auth.response;
 const input=z.object({requestId:z.string().uuid(),decision:z.enum(['approve','reject']),
  note:z.string().max(500).default('')}).strict().safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Keputusan approval tidak valid'},{status:400});
 try{
  const data=await transaction({classId,staffId:auth.staffId},async db=>
   (await db.query<{result:Record<string,unknown>}>(
    'SELECT trainlive.lms_tenant_setting_review($1::uuid,$2::uuid,$3,$4) AS result',
    [tenantId,input.data.requestId,input.data.decision,input.data.note]
   )).rows[0]?.result);
  return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e);}
}
