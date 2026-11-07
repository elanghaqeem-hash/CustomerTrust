import {NextResponse} from 'next/server';
import {z} from 'zod';
import {transaction} from '@/lib/db';
import {guardClass,privateError,requireSameOrigin} from '@/lib/api';
import {LMS_ENABLED} from '@/lib/lms-flags';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const changes=z.discriminatedUnion('action',[
 z.object({action:z.literal('enroll'),courseId:z.string().uuid()}).strict(),
 z.object({action:z.literal('complete_lesson'),courseId:z.string().uuid(),
  lessonId:z.string().uuid()}).strict()
]);

export async function GET(_req:Request,{params}:{params:Promise<{classId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const {classId}=await params;
 const auth=await guardClass(classId,'participant');
 if(auth.response)return auth.response;
 if(auth.session?.kind!=='participant')return NextResponse.json({error:'forbidden'},{status:403});
 try{
  const data=await transaction({classId,participantId:auth.session.participantId},async db=>
   (await db.query<{catalog:Record<string,unknown>}>(
    'SELECT trainlive.lms_learner_catalog($1) AS catalog',[classId]
   )).rows[0]?.catalog);
  return NextResponse.json(data,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e);}
}

export async function POST(req:Request,{params}:{params:Promise<{classId:string}>}){
 if(!LMS_ENABLED)return NextResponse.json({error:'not_found'},{status:404});
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {classId}=await params;
 const auth=await guardClass(classId,'participant');
 if(auth.response)return auth.response;
 if(auth.session?.kind!=='participant')return NextResponse.json({error:'forbidden'},{status:403});
 const input=changes.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Aksi pembelajaran tidak valid'},{status:400});
 const data=input.data;
 try{
  const result=await transaction({classId,participantId:auth.session.participantId},async db=>{
   if(data.action==='enroll'){
    return (await db.query<{result:Record<string,unknown>}>(
     'SELECT trainlive.lms_learner_enroll($1,$2::uuid) AS result',
     [classId,data.courseId]
    )).rows[0]?.result;
   }
   return (await db.query<{result:Record<string,unknown>}>(
    'SELECT trainlive.lms_learner_complete_lesson($1,$2::uuid,$3::uuid) AS result',
    [classId,data.courseId,data.lessonId]
   )).rows[0]?.result;
  });
  return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e);}
}
