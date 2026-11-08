import {NextResponse} from 'next/server';
import {z} from 'zod';
import {transaction} from '@/lib/db';
import {guardClass,privateError,requireSameOrigin} from '@/lib/api';
import {LMS_ENABLED} from '@/lib/lms-flags';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const definitions=z.discriminatedUnion('key',[
 z.object({key:z.literal('branding.primary_color'),value:z.string().regex(/^#[0-9a-fA-F]{6}$/)}).strict(),
 z.object({key:z.literal('branding.logo_url'),value:z.string().max(512).refine(v=>{
  if(v==='')return true;
  try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash;}catch{return false;}
 })}).strict(),
 z.object({key:z.literal('learning.default_passing_grade'),value:z.number().int().min(0).max(100)}).strict(),
 z.object({key:z.literal('learning.default_sequential'),value:z.boolean()}).strict(),
 z.object({key:z.literal('learning.default_delivery_mode'),value:z.enum(['live','self_paced','blended'])}).strict(),
 z.object({key:z.literal('certificate.enabled'),value:z.literal(false)}).strict(),
 z.object({key:z.literal('certificate.issuer_name'),value:z.string().trim().min(2).max(160).regex(/^[^\x00-\x1F\x7F<>]+$/)}).strict()
]);
const defaults:Record<string,string|number|boolean>={
 'branding.primary_color':'#0F766E',
 'branding.logo_url':'',
 'learning.default_passing_grade':70,
 'learning.default_sequential':true,
 'learning.default_delivery_mode':'blended',
 'certificate.enabled':false,
 'certificate.issuer_name':'TrainLive'
};
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
  const data=await transaction({classId,staffId:auth.staffId},async db=>
   (await db.query<{result:{organizationId:string;settings:Record<string,unknown>;revisions:Record<string,number>}}>(
    'SELECT trainlive.lms_admin_get_tenant_settings($1) AS result',[classId]
   )).rows[0]?.result);
  if(!data)return NextResponse.json({error:'not_found'},{status:404});
  const effective=Object.fromEntries(Object.entries(defaults).map(([key,value])=>[
   key,{value:data.settings[key]??value,source:Object.hasOwn(data.settings,key)?'tenant':'global'}
  ]));
  return NextResponse.json({...data,effective},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e);}
}
export async function POST(req:Request,{params}:{params:Promise<{classId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {classId}=await params;
 const auth=await authorized(classId);if(auth.response)return auth.response;
 const input=definitions.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Parameter tenant tidak valid'},{status:400});
 try{
  const data=await transaction({classId,staffId:auth.staffId},async db=>
   (await db.query<{result:Record<string,unknown>}>(
    'SELECT trainlive.lms_admin_get_tenant_settings($1) AS current',[classId]
   );
   const tenantId=current.rows[0]?.current?.organizationId;
   if(!tenantId)throw Object.assign(new Error('tenant not found'),{code:'42501'});
   return (await db.query<{result:Record<string,unknown>}> (
    'SELECT trainlive.lms_tenant_setting_propose($1::uuid,$2,$3::jsonb) AS result',
    [tenantId,input.data.key,JSON.stringify(input.data.value)]
   )).rows[0]?.result);
  return NextResponse.json(data,{status:data?.status==='no_change'?200:202,headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e);}
}
