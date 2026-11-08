import {NextResponse} from 'next/server';
import {z} from 'zod';
import {transaction} from '@/lib/db';
import {guardTenant,privateError,requireSameOrigin} from '@/lib/api';
import {LMS_ENABLED} from '@/lib/lms-flags';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_req:Request,{params}:{params:Promise<{tenantId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const {tenantId}=await params;const auth=await guardTenant(tenantId);
 if(auth.response)return auth.response;
 try{
  const data=await transaction({tenantId,staffId:auth.session.staffId},async db=>
   (await db.query<{result:Record<string,unknown>}>(
    'SELECT trainlive.lms_tenant_setting_queue($1::uuid) AS result',[tenantId]
   )).rows[0]?.result);
  return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e);}
}
export async function POST(req:Request,{params}:{params:Promise<{tenantId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {tenantId}=await params;const auth=await guardTenant(tenantId);
 if(auth.response)return auth.response;
 const input=z.object({requestId:z.string().uuid(),decision:z.enum(['approve','reject']),
  note:z.string().max(500).default('')}).strict().safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Keputusan approval tidak valid'},{status:400});
 try{
  const data=await transaction({tenantId,staffId:auth.session.staffId},async db=>
   (await db.query<{result:Record<string,unknown>}>(
    'SELECT trainlive.lms_tenant_setting_review($1::uuid,$2::uuid,$3,$4) AS result',
    [tenantId,input.data.requestId,input.data.decision,input.data.note]
   )).rows[0]?.result);
  return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e);}
}
