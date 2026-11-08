import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { guardClass,privateError } from '@/lib/api';
export const runtime='nodejs';
type Row={id:string;item_key:string;type:string;module_no:number;slide_ref:number|null;order_no:number;
 payload:Record<string,unknown>;hidden:boolean;state:string;timer_sec:number;opened_at:string|null;closed_at:string|null};
function safePayload(row:Row,forStaff:boolean){
 if(!forStaff && row.state==='idle') return {title:row.payload.title||'Aktivitas berikutnya',tag:row.payload.tag};
 const p={...row.payload};
 if(row.state!=='revealed'){
  delete p.correct;delete p.explanation;delete p.legal_basis;
  if(Array.isArray(p.questions)) p.questions=p.questions.map((q:Record<string,unknown>)=>{
   const {correct:unused,...safe}=q;void unused;return safe;
  });
 }
 return p;
}
export async function GET(_req:Request,{params}:{params:Promise<{classId:string}>}) {
 const {classId}=await params;
 const auth=await guardClass(classId);
 if(auth.response) return auth.response;
 const session=auth.session!;
 try {
  const {rows,branding}=await transaction({classId:session.classId,
   participantId:session.kind==='participant'?session.participantId:undefined,
   staffId:session.kind==='staff'?session.staffId:undefined},async db=>{
    const rows=(await db.query<Row>(
     'SELECT id,item_key,type,module_no,slide_ref,order_no,payload,hidden,state,timer_sec,opened_at,closed_at FROM trainlive.class_item WHERE class_id=$1 ORDER BY order_no',
     [classId])).rows;
    const branding=(await db.query<{result:{clientName:string;trainingTitle:string;logoUrl:string|null;primaryColor:string|null}}>(
     session.kind==='participant'
      ?'SELECT trainlive.lms_learner_class_branding($1) AS result'
      :'SELECT trainlive.lms_staff_class_branding($1) AS result',
     [classId])).rows[0]?.result;
    return {rows,branding};
   });
  return NextResponse.json({classId,branding,items:rows.filter(r=>!r.hidden||session.kind==='staff').map(r=>({...r,payload:safePayload(r,session.kind==='staff')}))},
   {headers:{'Cache-Control':'no-store'}});
 }catch(err){return privateError(err)}
}
