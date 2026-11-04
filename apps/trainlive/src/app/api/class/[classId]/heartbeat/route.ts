import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { guardClass,privateError } from '@/lib/api';
export const runtime='nodejs';
export async function POST(_req:Request,{params}:{params:Promise<{classId:string}>}){
 const {classId}=await params;
 const auth=await guardClass(classId,'participant');
 if(auth.response)return auth.response;
 const s=auth.session!;
 if(s.kind!=='participant')return NextResponse.json({error:'forbidden'},{status:403});
 try{
  await transaction({classId:s.classId,participantId:s.participantId},async db=>{
   const p=await db.query('UPDATE trainlive.participant SET last_seen_at=now() WHERE class_id=$1 AND id=$2 RETURNING id',
    [s.classId,s.participantId]);
   if(p.rowCount!==1)throw Object.assign(new Error('not member'),{code:'42501'});
   await db.query("INSERT INTO trainlive.attendance_log(class_id,participant_id,event) VALUES($1,$2,'heartbeat')",
    [s.classId,s.participantId]);
  });
  return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return privateError(e)}
}
