import { NextResponse } from 'next/server';
import { guardClass,privateError } from '@/lib/api';
import { classReport } from '@/lib/report';
export const runtime='nodejs';
export async function GET(_req:Request,{params}:{params:{classId:string}}) {
 const auth=await guardClass(params.classId,'staff');
 if(auth.response)return auth.response;
 const s=auth.session!;
 if(s.kind!=='staff')return NextResponse.json({error:'forbidden'},{status:403});
 try{
  return NextResponse.json(await classReport(s),{headers:{'Cache-Control':'no-store'}});
 }catch(e){return privateError(e)}
}
