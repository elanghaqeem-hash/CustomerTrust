import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createHmac } from 'node:crypto';
import { transaction } from '@/lib/db';
import { guardClass,privateError,requireSameOrigin } from '@/lib/api';
export const runtime='nodejs';
const reqSchema=z.object({itemId:z.string().uuid(),answer:z.unknown(),confirmNoSensitiveData:z.boolean().optional()}).strict();
type Item={id:string;type:string;state:string;hidden:boolean;opened_at:string|null;timer_sec:number;payload:{
 tag?:string; options?:string[];multi_max?:number;anonymous?:boolean;questions?:unknown[];
}};
const letters=['A','B','C','D','E','F','G','H','I','J'];
function normalize(item:Item,answer:unknown,confirmed:boolean) {
 if(item.type==='single_choice'){
  if(typeof answer!=='string'||!letters.slice(0,item.payload.options?.length||0).includes(answer))throw new Error('bad_answer');
  return {choice:answer};
 }
 if(item.type==='multi_choice'){
  if(!Array.isArray(answer)||!answer.length||answer.length>(item.payload.multi_max||99)
   ||new Set(answer).size!==answer.length
   ||!answer.every(x=>typeof x==='string'&&letters.slice(0,item.payload.options?.length||0).includes(x)))
   throw new Error('bad_answer');
  return {choices:answer};
 }
 if(item.type==='test'){
  const q=item.payload.questions||[];
  if(!Array.isArray(answer)||answer.length!==q.length||!answer.every(x=>typeof x==='string'&&/^[A-D]$/.test(x)))
   throw new Error('bad_answer');
  return {answers:answer};
 }
 if(item.type==='open_text'){
  if(typeof answer!=='string'||!answer.trim()||answer.length>1500)throw new Error('bad_answer');
  if(/\b\d{10,16}\b/.test(answer)&&!confirmed)throw new Error('sensitive_confirmation');
  return {text:answer.trim()};
 }
 if(item.type==='survey') {
  if(!Array.isArray(answer)||answer.length!==(item.payload.questions?.length||0))throw new Error('bad_answer');
  return {answers:answer};
 }
 throw new Error('unsupported_type');
}
export async function POST(req:Request,{params}:{params:Promise<{classId:string}>}) {
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {classId}=await params;
 const auth=await guardClass(classId,'participant');
 if(auth.response) return auth.response;
 const session=auth.session!;
 if(session.kind!=='participant')return NextResponse.json({error:'forbidden'},{status:403});
 const input=reqSchema.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Invalid response payload'},{status:400});
 try {
  return await transaction({classId:session.classId,participantId:session.participantId},async db=>{
   const item=(await db.query<Item>(
    'SELECT id,type,state,hidden,opened_at,timer_sec,payload FROM trainlive.class_item WHERE class_id=$1 AND id=$2',
    [session.classId,input.data.itemId])).rows[0];
   if(!item||item.hidden||item.state!=='open')return NextResponse.json({error:'Item belum dibuka atau sudah ditutup'},{status:409});
   let answer;
   try{answer=normalize(item,input.data.answer,Boolean(input.data.confirmNoSensitiveData));}
   catch(e){
    return NextResponse.json({error:(e as Error).message==='sensitive_confirmation'
     ?'Jangan tuliskan nama nasabah, nomor rekening, NIK, atau data rahasia bank. Periksa dan konfirmasi terlebih dahulu.'
     :'Jawaban tidak sesuai format.'},{status:400});
   }
   const anonymous=item.payload.anonymous===true;
   const anonKey=anonymous?createHmac('sha256',process.env.TRAINLIVE_JWT_SECRET||'')
    .update(session.classId+':'+item.id+':'+session.participantId).digest('hex'):null;
   const result=await db.query<{id:string}>(
    "INSERT INTO trainlive.response(class_id,class_item_id,participant_id,anonymous_key,answer_json,latency_ms) SELECT $1,$2,$3,$4,$5,GREATEST(0,(EXTRACT(EPOCH FROM (now()-opened_at))*1000)::integer) FROM trainlive.class_item WHERE class_id=$1 AND id=$2 AND state='open' AND NOT hidden AND (timer_sec=0 OR now()<opened_at+make_interval(secs=>timer_sec)) RETURNING id",
    [session.classId,item.id,anonymous?null:session.participantId,anonKey,JSON.stringify(answer)]);
   if(!result.rowCount)return NextResponse.json({error:'Waktu jawaban sudah berakhir'},{status:409});
   if(item.payload.tag==='chat'&&'text' in answer){
    await db.query('INSERT INTO trainlive.chat_message(class_id,participant_id,body) VALUES($1,$2,$3)',
      [session.classId,session.participantId,answer.text]);
   }
   return NextResponse.json({saved:true,responseId:result.rows[0].id},{status:201});
  });
 }catch(e){return privateError(e)}
}
