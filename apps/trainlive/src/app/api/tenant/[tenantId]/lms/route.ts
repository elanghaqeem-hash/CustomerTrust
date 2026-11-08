import {NextResponse} from 'next/server';
import {z} from 'zod';
import {transaction} from '@/lib/db';
import {guardTenant,privateError,requireSameOrigin} from '@/lib/api';
import {LMS_ENABLED} from '@/lib/lms-flags';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const program=z.object({
 action:z.literal('create_program'),
 code:z.string().regex(/^[A-Z][A-Z0-9_-]{2,31}$/),
 title:z.string().trim().min(3).max(160).regex(/^[^\x00-\x1f\x7f<>]+$/),
 description:z.string().max(2000)
}).strict();
export async function GET(_req:Request,{params}:{params:Promise<{tenantId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const {tenantId}=await params;const auth=await guardTenant(tenantId);
 if(auth.response)return auth.response;
 try{
  const data=await transaction({tenantId,staffId:auth.session.staffId},async db=>
   (await db.query<{result:Record<string,unknown>}>(
    'SELECT trainlive.lms_tenant_dashboard($1::uuid) AS result',[tenantId]
   )).rows[0]?.result);
  return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e);}
}
export async function POST(req:Request,{params}:{params:Promise<{tenantId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {tenantId}=await params;const auth=await guardTenant(tenantId);
 if(auth.response)return auth.response;
 const input=program.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Metadata program tidak valid'},{status:400});
 try{
  const result=await transaction({tenantId,staffId:auth.session.staffId},async db=>
   (await db.query<{result:Record<string,unknown>}>(
    'SELECT trainlive.lms_tenant_create_program($1::uuid,$2,$3,$4) AS result',
    [tenantId,input.data.code,input.data.title,input.data.description]
   )).rows[0]?.result);
  return NextResponse.json(result,{status:201,headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e);}
}
