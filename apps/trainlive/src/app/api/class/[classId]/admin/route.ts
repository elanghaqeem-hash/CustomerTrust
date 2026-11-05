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
  date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
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
  const canCreate=await transaction({classId,staffId:auth.staffId!},async db=>
   (await db.query<{allowed:boolean}>('SELECT trainlive.can_create_class() AS allowed'))
    .rows[0]?.allowed===true);
  return NextResponse.json({classId,canCreate},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return privateError(e)}
}
export async function POST(req:Request,{params}:{params:Promise<{classId:string}>}){
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {classId}=await params,auth=await getStaff(classId);
 if(auth.response)return auth.response;
 const input=fields.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Data kelas tidak valid'},{status:400});
 const {name,batch,date}=input.data;
 const parsedDay=new Date(date+'T00:00:00.000Z');
 if(Number.isNaN(parsedDay.getTime())||parsedDay.toISOString().slice(0,10)!==date)
  return NextResponse.json({error:'Tanggal kelas tidak valid'},{status:400});
 try{
  for(let attempt=0;attempt<8;attempt++){
   try{
    const created=await transaction({classId,staffId:auth.staffId!},async db=>
     (await db.query<{result:Record<string,unknown>}>(
      'SELECT trainlive.admin_create_class($1,$2,$3,$4::date,$5) AS result',
      [classId,name,batch,date,joinCode()]
     )).rows[0]?.result);
    return NextResponse.json(created,{status:201,headers:{'Cache-Control':'no-store'}});
   }catch(e){
    if((e as {code?:string}).code==='23505'&&attempt<7)continue;
    throw e;
   }
  }
  return NextResponse.json({error:'Kode kelas gagal dibuat'},{status:503});
 }catch(e){return privateError(e)}
}
