import { NextResponse } from 'next/server';
import { guardClass,privateError } from '@/lib/api';
import { classReport } from '@/lib/report';
import { transaction } from '@/lib/db';
export const runtime='nodejs';
function csvCell(value:unknown) {
 let s=String(value===null||value===undefined?'':value);
 if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
}
export async function GET(req:Request,{params}:{params:{classId:string}}) {
 const auth=await guardClass(params.classId,'staff');
 if(auth.response)return auth.response;
 const s=auth.session!;
 if(s.kind!=='staff')return NextResponse.json({error:'forbidden'},{status:403});
 const format=new URL(req.url).searchParams.get('format');
 if(format!=='csv')return NextResponse.json({error:'Supported format: csv'},{status:400});
 try {
  const report=await classReport(s);
  const header=['class_id','participant_id','nama_panggilan','unit','email','pre_test','post_test',
   'kenaikan','heartbeat_menit_estimasi','poin_kuis_dan_lembar_kerja'];
  const rows=report.participants.map(p=>[
   s.classId,p.participant_id,p.display_name,p.unit,p.email,p.pre_score,p.post_score,
   p.pre_score!==null&&p.post_score!==null?p.post_score-p.pre_score:null,
   p.heartbeat_count,p.quiz_points
  ]);
  const body=[header,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
  await transaction(s,async db=>{
   await db.query(
    "INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json) VALUES($1,'staff',$2,'export.csv',$3,$4)",
    [s.staffId,s.classId,'class-report',JSON.stringify({rows:rows.length})]);
  });
  return new NextResponse('\uFEFF'+body,{headers:{
   'Content-Type':'text/csv; charset=utf-8',
   'Content-Disposition':'attachment; filename="trainlive_'+s.classId+'_participants.csv"',
   'Cache-Control':'private, no-store','X-Class-Id':s.classId
  }});
 }catch(e){return privateError(e)}
}
