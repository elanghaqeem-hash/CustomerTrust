import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { guardClass,privateError } from '@/lib/api';
export const runtime='nodejs';
export async function GET(_req:Request,{params}:{params:{classId:string}}) {
 const auth=await guardClass(params.classId);
 if(auth.response)return auth.response;
 const s=auth.session!;
 try{
  const rows=await transaction({classId:s.classId,
   participantId:s.kind==='participant'?s.participantId:undefined,
   staffId:s.kind==='staff'?s.staffId:undefined},
   async db=>(await db.query('SELECT * FROM trainlive.top_ten()')).rows);
  return NextResponse.json({classId:s.classId,top:rows},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return privateError(e)}
}
