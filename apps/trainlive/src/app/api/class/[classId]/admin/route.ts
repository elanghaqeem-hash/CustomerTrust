import {NextResponse} from 'next/server';
import {randomInt} from 'node:crypto';
import {z} from 'zod';
import {transaction} from '@/lib/db';
import {guardClass,privateError,requireSameOrigin} from '@/lib/api';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const fields=z.object({
  name:z.string().trim().min(3).max(160),
  batch:z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clientName:z.string().trim().min(2).max(160).regex(/^[^\x00-\x1F\x7F<>]+$/).optional(),
  trainingTitle:z.string().trim().min(3).max(160).regex(/^[^\x00-\x1F\x7F<>]+$/).optional()
}).strict();
const brandingFields=z.object({
 clientName:z.string().trim().min(2).max(160).regex(/^[^\x00-\x1F\x7F<>]+$/),
 trainingTitle:z.string().trim().min(3).max(160).regex(/^[^\x00-\x1F\x7F<>]+$/)
}).strict();
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function joinCode(){
 return Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');
}
async function getStaff(classId:string){
 const auth=await guardClass(classId,'staff');
 if(auth.response)return {response:auth.response,staffId:null as string|null};
 const session=auth.session!;
 if(session.kind!=='staff')return {
  response:NextResponse.json({error:'forbidden'},{status:403}),staffId:null};
 return {response:null,staffId:session.staffId};
}
export async function GET(_req:Request,{params}:{params:Promise<{classId:string}>}){
 const {classId}=await params,auth=await getStaff(classId);
 if(auth.response)return auth.response;
 try{
  const data=await transaction({classId,staffId:auth.staffId!},async db=>{
   const canCreate=(await db.query<{allowed:boolean}>('SELECT trainlive.can_create_class() AS allowed')).rows[0]?.allowed===true;
   const branding=(await db.query<{clientName:string;trainingTitle:string}>(
    'SELECT client_name AS "clientName",training_title AS "trainingTitle" FROM trainlive.class_session WHERE id=$1',
    [classId])).rows[0];
   return {canCreate,branding};
  });
  return NextResponse.json({classId,...data},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e)}
}
export async function POST(req:Request,{params}:{params:Promise<{classId:string}>}){
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {classId}=await params,auth=await getStaff(classId);
 if(auth.response)return auth.response;
 const input=fields.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Data kelas tidak valid'},{status:400});
 const {name,batch,date}=input.data;
 const clientName=input.data.clientName;
 const trainingTitle=input.data.trainingTitle||name;
 const parsedDay=new Date(date+'T00:00:00.000Z');
 if(Number.isNaN(parsedDay.getTime())||parsedDay.toISOString().slice(0,10)!==date)
  return NextResponse.json({error:'Tanggal kelas tidak valid'},{status:400});
 try{
  for(let attempt=0;attempt<8;attempt++){
   try{
    const created=await transaction({classId,staffId:auth.staffId!},async db=>{
     const client=clientName||(await db.query<{client_name:string}>(
      'SELECT client_name FROM trainlive.class_session WHERE id=$1',[classId]
     )).rows[0]?.client_name;
     return (await db.query<{result:Record<string,unknown>}>(
      'SELECT trainlive.admin_create_branded_class($1,$2,$3,$4::date,$5,$6,$7) AS result',
      [classId,name,batch,date,joinCode(),client,trainingTitle]
     )).rows[0]?.result;
    });
    return NextResponse.json(created,{status:201,headers:{'Cache-Control':'no-store'}});
   }catch(e){
    if((e as {code?:string}).code==='23505'&&attempt<7)continue;
    throw e;
   }
  }
  return NextResponse.json({error:'Kode kelas gagal dibuat'},{status:503});
 }catch(e){return privateError(e)}
}

export async function PUT(req:Request,{params}:{params:Promise<{classId:string}>}){
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {classId}=await params,auth=await getStaff(classId);
 if(auth.response)return auth.response;
 const input=brandingFields.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Nama klien dan judul training harus valid'},{status:400});
 try{
  const updated=await transaction({classId,staffId:auth.staffId!},async db=>
   (await db.query<{result:Record<string,unknown>}>(
    'SELECT trainlive.admin_update_class_branding($1,$2,$3) AS result',
    [classId,input.data.clientName,input.data.trainingTitle]
   )).rows[0]?.result);
  return NextResponse.json(updated,{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e)}
}
