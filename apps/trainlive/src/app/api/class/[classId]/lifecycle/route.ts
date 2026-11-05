import {NextResponse} from 'next/server';
import {z} from 'zod';
import {guardClass,privateError,requireSameOrigin} from '@/lib/api';
import {transaction} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const body=z.object({action:z.enum(['start','close'])}).strict();

export async function GET(_req:Request,{params}:{params:Promise<{classId:string}>}){
 const {classId}=await params;
 const auth=await guardClass(classId,'staff');if(auth.response)return auth.response;
 const staff=auth.session!;if(staff.kind!=='staff')return NextResponse.json({error:'forbidden'},{status:403});
 try{
  const result=await transaction({classId,staffId:staff.staffId},async db=>
   (await db.query<{status:'scheduled'|'live'|'closed'|'archived';start_at:string;end_at:string;timezone:string}>(
    'SELECT status,start_at,end_at,timezone FROM trainlive.class_session WHERE id=$1',[classId])).rows[0]);
  if(!result)return NextResponse.json({error:'class not found'},{status:404});
  return NextResponse.json({classId,...result},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e)}
}
export async function POST(req:Request,{params}:{params:Promise<{classId:string}>}){
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {classId}=await params;
 const auth=await guardClass(classId,'staff');if(auth.response)return auth.response;
 const staff=auth.session!;if(staff.kind!=='staff')return NextResponse.json({error:'forbidden'},{status:403});
 const input=body.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Aksi kelas tidak valid'},{status:400});
 try{
  const result=await transaction({classId,staffId:staff.staffId},async db=>
   (await db.query<{value:Record<string,string>}>(
     'SELECT trainlive.manage_class($1) AS value',[input.data.action])).rows[0]?.value);
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return privateError(e)}
}
