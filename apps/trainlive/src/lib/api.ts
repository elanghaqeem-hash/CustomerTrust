import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSession, type Session } from './auth';

export const classParam=z.string().uuid();
export async function guardClass(classId:string,kind?:Session['kind']) {
 if(!classParam.safeParse(classId).success) return {response:NextResponse.json({error:'invalid class id'},{status:400})};
 const session=await readSession(classId);
 if(!session) return {response:NextResponse.json({error:'class token required or class mismatch'},{status:403})};
 if(kind && session.kind!==kind)
  return {response:NextResponse.json({error:'role not authorized'},{status:403})};
 return {session};
}
export function privateError(e:unknown) {
 const err=e as {code?:string};
 if (err?.code==='23505') return NextResponse.json({error:'already submitted'},{status:409});
 if (err?.code==='23503'||err?.code==='42501') return NextResponse.json({error:'forbidden'},{status:403});
 if (err?.code==='22023') return NextResponse.json({error:'request rejected by class rules'},{status:422});
 console.error('trainlive request failed:',e instanceof Error?e.message:String(e));
 return NextResponse.json({error:'request could not be completed'},{status:500});
}
