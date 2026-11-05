import { NextResponse } from 'next/server';
import { z } from 'zod';
import { transaction } from '@/lib/db';
import { guardClass,privateError,requireSameOrigin } from '@/lib/api';
export const runtime='nodejs';
const schema=z.object({itemId:z.string().uuid(),action:z.enum(['open','close','reveal'])}).strict();
export async function POST(req:Request,{params}:{params:Promise<{classId:string}>}) {
 const denied=requireSameOrigin(req);if(denied)return denied;
 const {classId}=await params;
 const auth=await guardClass(classId,'staff');
 if(auth.response)return auth.response;
 const s=auth.session!;
 if(s.kind!=='staff')return NextResponse.json({error:'forbidden'},{status:403});
 const input=schema.safeParse(await req.json().catch(()=>null));
 if(!input.success)return NextResponse.json({error:'Invalid action'},{status:400});
 try{
  const out=await transaction({classId:s.classId,staffId:s.staffId},async db=>
   (await db.query('SELECT trainlive.run_item($1,$2) result',
     [input.data.itemId,input.data.action])).rows[0].result);
  return NextResponse.json(out,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return privateError(e)}
}
