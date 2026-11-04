import { NextResponse } from 'next/server';
import { guardClass,privateError } from '@/lib/api';
import { classReport } from '@/lib/report';
import { transaction } from '@/lib/db';
import type { ParticipantReport } from '@/lib/report';
export const runtime='nodejs';

type ExportFormat='csv'|'xlsx'|'pdf';
const columns=['class_id','participant_id','nama_panggilan','unit','email','pre_test','post_test',
  'kenaikan','heartbeat_menit_estimasi','poin_kuis_dan_lembar_kerja'];

function rowFor(classId:string,p:ParticipantReport) {
  return [classId,p.participant_id,p.display_name,p.unit,p.email,p.pre_score,p.post_score,
    p.pre_score!==null&&p.post_score!==null?p.post_score-p.pre_score:null,
    p.heartbeat_count,p.quiz_points];
}
function csvCell(value:unknown) {
  let s=String(value===null||value===undefined?'':value);
  // Never allow user-controlled cells to become Excel formulas.
  if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
function safeSpreadsheetText(value:unknown):string {
  return csvCell(value).slice(1,-1).replace(/""/g,'"');
}
function safePdfText(value:unknown):string {
  return String(value??'').replace(/[^\x20-\x7e]/g,'?').slice(0,95);
}
export async function GET(req:Request,{params}:{params:Promise<{classId:string}>}) {
 const {classId}=await params;
  const auth=await guardClass(classId,'staff');
  if(auth.response)return auth.response;
  const staff=auth.session!;
  if(staff.kind!=='staff')return NextResponse.json({error:'forbidden'},{status:403});
  const format=new URL(req.url).searchParams.get('format');
  if(!['csv','xlsx','pdf'].includes(format||''))return NextResponse.json(
    {error:'Supported formats: csv, xlsx, pdf'},{status:400});
  const exportFormat=format as ExportFormat;
  try {
    const report=await classReport(staff);
    const rows=report.participants.map(p=>rowFor(staff.classId,p));
    let body:Uint8Array|string;
    let contentType:string;
    if(exportFormat==='csv') {
      body='\uFEFF'+[columns,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n')+'\r\n';
      contentType='text/csv; charset=utf-8';
    } else if(exportFormat==='xlsx') {
      const ExcelJS=(await import('exceljs')).default;
      const workbook=new ExcelJS.Workbook();
      workbook.creator='TrainLive';
      const sheet=workbook.addWorksheet('Peserta');
      sheet.columns=columns.map(c=>({header:c,key:c,width:Math.min(36,Math.max(16,c.length+4))}));
      sheet.getRow(1).font={bold:true};
      for(const row of rows)sheet.addRow(row.map(safeSpreadsheetText));
      sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:columns.length}};
      const bytes=await workbook.xlsx.writeBuffer();
      body=new Uint8Array(bytes);
      contentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      const {PDFDocument,StandardFonts,rgb}=await import('pdf-lib');
      const pdf=await PDFDocument.create();
      pdf.setTitle('TrainLive - Laporan Peserta');
      const font=await pdf.embedFont(StandardFonts.Helvetica);
      const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
      let page=pdf.addPage([595,842]),y=800;
      const line=(s:string,size=9,b=false)=>{
        if(y<56){page=pdf.addPage([595,842]);y=800;}
        page.drawText(safePdfText(s),{x:38,y,size,font:b?bold:font,color:rgb(.12,.17,.27)});
        y-=16;
      };
      line('TrainLive - Ringkasan Evaluasi',15,true);y-=6;
      line('Kelas: '+staff.classId);line('Jumlah peserta: '+report.summary.participants);
      line('Rata-rata pre/post: '+(report.summary.pre_mean??'-')+' / '+(report.summary.post_mean??'-'));
      line('Rata-rata kenaikan berpasangan: '+(report.summary.paired_mean_gain??'-'));
      y-=12;line('PESERTA | UNIT | PRE | POST | POIN',10,true);
      for(const p of report.participants)line([
        p.display_name.slice(0,24),p.unit.slice(0,17),
        p.pre_score??'-',p.post_score??'-',p.quiz_points
      ].join(' | '));
      body=new Uint8Array(await pdf.save());
      contentType='application/pdf';
    }
    await transaction(staff,async db=>{
      await db.query(
        "INSERT INTO trainlive.audit_log(actor_id,actor_role,class_id,action,target,payload_json) VALUES($1,'staff',$2,$3,$4,$5)",
        [staff.staffId,staff.classId,'export.'+exportFormat,'class-report',JSON.stringify({rows:rows.length})]);
    });
    return new NextResponse(body instanceof Uint8Array?new Blob([Uint8Array.from(body).buffer]):body,{headers:{
      'Content-Type':contentType,
      'Content-Disposition':'attachment; filename="trainlive_'+staff.classId+'_participants.'+exportFormat+'"',
      'Cache-Control':'private, no-store','X-Class-Id':staff.classId,'X-Content-Type-Options':'nosniff'
    }});
  }catch(e){return privateError(e)}
}
