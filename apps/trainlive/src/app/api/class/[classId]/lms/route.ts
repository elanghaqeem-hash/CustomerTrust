import {NextResponse} from 'next/server';
import {z} from 'zod';
import {transaction} from '@/lib/db';
import {guardClass,privateError,requireSameOrigin} from '@/lib/api';
import {LMS_ENABLED} from '@/lib/lms-flags';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const title=z.string().trim().min(3).max(160).regex(/^[^\x00-\x1F\x7F<>]+$/);
const courseSettings={
 title,
 description:z.string().max(2000),
 deliveryMode:z.enum(['live','self_paced','blended']),
 passingGrade:z.number().int().min(0).max(100),
 sequentialModules:z.boolean()
};
const mutations=z.discriminatedUnion('action',[
 z.object({
  action:z.literal('create_course'),
  code:z.string().regex(/^[A-Z][A-Z0-9_-]{2,31}$/),
  ...courseSettings
 }).strict(),
 z.object({
  action:z.literal('update_course'),
  courseId:z.string().uuid(),
  ...courseSettings
 }).strict(),
 z.object({
  action:z.literal('create_module'),
  courseId:z.string().uuid(),
  moduleKey:z.string().regex(/^[A-Z][A-Z0-9_-]{1,31}$/),
  title,
  kind:z.enum(['lesson','assessment','live_session']),
  estimatedMinutes:z.number().int().min(1).max(10080)
 }).strict()
]);

export async function GET(_req:Request,{params}:{params:Promise<{classId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const {classId}=await params;
 const auth=await guardClass(classId,'staff');
 if(auth.response)return auth.response;
 if(auth.session?.kind!=='staff')return NextResponse.json({error:'forbidden'},{status:403});
 try{
  const data=await transaction({classId,staffId:auth.session.staffId},async db=>
   (await db.query<{catalog:Record<string,unknown>}>(
    'SELECT trainlive.lms_admin_catalog($1) AS catalog',[classId]
   )).rows[0]?.catalog);
  return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e)}
}

export async function POST(req:Request,{params}:{params:Promise<{classId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {classId}=await params;
 const auth=await guardClass(classId,'staff');
 if(auth.response)return auth.response;
 if(auth.session?.kind!=='staff')return NextResponse.json({error:'forbidden'},{status:403});
 const input=mutations.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Parameter LMS tidak valid'},{status:400});
 const data=input.data;
 try{
  const result=await transaction({classId,staffId:auth.session.staffId},async db=>{
   if(data.action==='create_course'){
    return (await db.query<{result:Record<string,unknown>}>(
     'SELECT trainlive.lms_admin_create_course($1,$2,$3,$4,$5,$6,$7) AS result',
     [classId,data.code,data.title,data.description,data.deliveryMode,data.passingGrade,data.sequentialModules]
    )).rows[0]?.result;
   }
   if(data.action==='update_course'){
    return (await db.query<{result:Record<string,unknown>}>(
     'SELECT trainlive.lms_admin_update_course($1,$2::uuid,$3,$4,$5,$6,$7) AS result',
     [classId,data.courseId,data.title,data.description,data.deliveryMode,data.passingGrade,data.sequentialModules]
    )).rows[0]?.result;
   }
   return (await db.query<{result:Record<string,unknown>}>(
    'SELECT trainlive.lms_admin_create_module($1,$2::uuid,$3,$4,$5,$6) AS result',
    [classId,data.courseId,data.moduleKey,data.title,data.kind,data.estimatedMinutes]
   )).rows[0]?.result;
  });
  return NextResponse.json(result,{status:data.action==='update_course'?200:201,
   headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e)}
}
