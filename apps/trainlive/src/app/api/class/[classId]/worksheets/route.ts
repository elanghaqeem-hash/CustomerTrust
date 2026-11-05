import { NextResponse } from 'next/server';
import { z } from 'zod';
import { transaction } from '@/lib/db';
import { guardClass,privateError,requireSameOrigin } from '@/lib/api';
export const runtime='nodejs';
const schema=z.object({
 worksheetId:z.string().uuid(),data:z.record(z.unknown()),submit:z.boolean(),
 confirmNoSensitiveData:z.boolean().optional()
}).strict();
type Field={id:string;type:string;required?:boolean;options?:string[]};
type Ws={id:string;ws_key:string;payload:{fields?:Field[];repeatable_group?:{min:number;max:number;fields:Field[]};completion_rule?:string};
 due_at:string};
function validField(f:Field,value:unknown):boolean{
 if(!f.required)return true;
 if(value===undefined||value===null)return false;
 if(Array.isArray(value))return value.length>0&&value.every(x=>typeof x==='string'&&(!f.options||f.options.includes(x)));
 if(typeof value==='string')return value.trim().length>0&&(!f.options||f.options.includes(value));
 return typeof value==='boolean' || (typeof value==='number'&&Number.isFinite(value));
}
function checkData(ws:Ws,data:Record<string,unknown>,maxTarget:string):string|null{
 const p=ws.payload;
 if(ws.ws_key==='LK2')return 'LK2 dibuat otomatis dari RF1–RF4.';
 if(p.repeatable_group){
  const g=p.repeatable_group,v=data.initiatives;
  if(!Array.isArray(v)||v.length<g.min||v.length>g.max)return 'Isi 3–5 inisiatif.';
  for(const [i,initiative] of v.entries()){
   if(typeof initiative!=='object'||!initiative||Array.isArray(initiative))return 'Inisiatif tidak valid.';
   for(const f of g.fields)if(!validField(f,(initiative as Record<string,unknown>)[f.id]))
    return 'Inisiatif '+(i+1)+': '+f.id+' wajib diisi.';
   const target=(initiative as Record<string,unknown>).target;
   if(typeof target!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(target)||target>maxTarget)
    return 'Target tanggal harus paling lambat '+maxTarget+'.';
  }
 } else {
  for(const f of p.fields||[])if(!validField(f,data[f.id]))return 'Kolom '+f.id+' wajib diisi.';
 }
 return null;
}
export async function GET(_req:Request,{params}:{params:Promise<{classId:string}>}){
 const {classId}=await params;
 const auth=await guardClass(classId,'participant');if(auth.response)return auth.response;
 const s=auth.session!;if(s.kind!=='participant')return NextResponse.json({error:'forbidden'},{status:403});
 try {
  const rows=await transaction({classId:s.classId,participantId:s.participantId},async db=>{
   // Key explanations cannot be issued until all RF1–RF4 have been revealed.
   await db.query('SELECT trainlive.regenerate_lk2()');
   return (await db.query(
    "SELECT w.id,w.ws_key,w.title,w.module_no,w.slide_ref,w.payload,w.due_at,s.data_json,s.status,s.submitted_at FROM trainlive.class_worksheet w LEFT JOIN trainlive.worksheet_submission s ON s.class_id=w.class_id AND s.class_worksheet_id=w.id AND s.participant_id=$2 WHERE w.class_id=$1 ORDER BY w.module_no,w.ws_key",
    [s.classId,s.participantId])).rows;
  });
  return NextResponse.json({worksheets:rows},{headers:{'Cache-Control':'no-store'}});
 } catch(e){return privateError(e)}
}
export async function POST(req:Request,{params}:{params:Promise<{classId:string}>}){
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {classId}=await params;
 const auth=await guardClass(classId,'participant');if(auth.response)return auth.response;
 const s=auth.session!;if(s.kind!=='participant')return NextResponse.json({error:'forbidden'},{status:403});
 const input=schema.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Data lembar kerja tidak valid.'},{status:400});
 const {worksheetId,data,submit,confirmNoSensitiveData}=input.data;
 const dataString=JSON.stringify(data);
 if(dataString.length>20000)return NextResponse.json({error:'Lembar kerja terlalu panjang.'},{status:413});
 if(/\b\d{10,16}\b/.test(dataString)&&!confirmNoSensitiveData)
  return NextResponse.json({error:'Periksa NIK, nomor rekening, dan data rahasia bank sebelum menyimpan.'},{status:400});
 try {
  return await transaction({classId:s.classId,participantId:s.participantId},async db=>{
   const ws=(await db.query<Ws>(
    'SELECT id,ws_key,payload,due_at FROM trainlive.class_worksheet WHERE class_id=$1 AND id=$2',
    [s.classId,worksheetId])).rows[0];
   if(!ws)return NextResponse.json({error:'Worksheet tidak ditemukan di kelas Anda.'},{status:403});
   if(ws.ws_key==='LK2')return NextResponse.json({error:'LK2 dihasilkan otomatis.'},{status:403});
   const time=(await db.query<{due:boolean;max_target:string}>(
    "SELECT now() <= $1::timestamptz AS due,((start_at AT TIME ZONE timezone)::date+30)::text AS max_target FROM trainlive.class_session WHERE id=$2",
    [ws.due_at,s.classId])).rows[0];
   if(!time?.due)return NextResponse.json({error:'Batas pengumpulan sudah berlalu.'},{status:409});
   if(submit){
    const reason=checkData(ws,data,time.max_target);
    if(reason)return NextResponse.json({error:reason},{status:400});
   }
   const saved=(await db.query(
    "INSERT INTO trainlive.worksheet_submission(class_id,class_worksheet_id,participant_id,data_json,status,submitted_at) VALUES($1,$2,$3,$4,$5,CASE WHEN $5='submitted' THEN now() ELSE NULL END) ON CONFLICT(class_id,class_worksheet_id,participant_id) DO UPDATE SET data_json=EXCLUDED.data_json,status=EXCLUDED.status,submitted_at=EXCLUDED.submitted_at WHERE trainlive.worksheet_submission.status='draft' RETURNING id,status",
    [s.classId,worksheetId,s.participantId,dataString,submit?'submitted':'draft'])).rows[0];
   if(!saved)return NextResponse.json({error:'Worksheet sudah disubmit dan terkunci.'},{status:409});
   const point=submit?(await db.query('SELECT trainlive.award_worksheet($1) awarded',[worksheetId])).rows[0].awarded:false;
   return NextResponse.json({saved:true,status:saved.status,pointsAwarded:point?20:0});
  });
 }catch(e){return privateError(e)}
}
