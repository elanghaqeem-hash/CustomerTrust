import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { guardClass,privateError } from '@/lib/api';
export const runtime='nodejs';
type Row={id:string;item_key:string;type:string;module_no:number;slide_ref:number|null;order_no:number;
 payload:Record<string,unknown>;hidden:boolean;state:string;timer_sec:number;opened_at:string|null;closed_at:string|null};
function safePayload(row:Row){
 const p={...row.payload};
 if(row.state!=='revealed'){
  delete p.correct;delete p.explanation;delete p.legal_basis;
  if(Array.isArray(p.questions)) p.questions=p.questions.map((q:Record<string,unknown>)=>{
   const {correct:unused,...safe}=q;void unused;return safe;
  });
 }
 return p;
}
export async function GET(_req:Request,{params}:{params:{classId:string}}) {
 const auth=await guardClass(params.classId);
 if(auth.response) return auth.response;
 const session=auth.session!;
 try {
  const rows=await transaction({classId:session.classId,
   participantId:session.kind==='participant'?session.participantId:undefined,
   staffId:session.kind==='staff'?session.staffId:undefined},async db=>
   (await db.query<Row>(
    'SELECT id,item_key,type,module_no,slide_ref,order_no,payload,hidden,state,timer_sec,opened_at,closed_at FROM trainlive.class_item WHERE class_id=$1 ORDER BY order_no',
    [params.classId])).rows
  );
  return NextResponse.json({classId:params.classId,items:rows.filter(r=>!r.hidden||session.kind==='staff').map(r=>({...r,payload:safePayload(r)}))},
   {headers:{'Cache-Control':'no-store'}});
 }catch(err){return privateError(err)}
}
