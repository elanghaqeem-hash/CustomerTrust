import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';

export type Session =
 | { kind:'participant'; classId:string; participantId:string }
 | { kind:'staff'; classId:string; staffId:string };
function key():Uint8Array {
 const secret=process.env.TRAINLIVE_JWT_SECRET;
 if (!secret || new TextEncoder().encode(secret).length<32)
  throw new Error('TRAINLIVE_JWT_SECRET must be configured (at least 32 bytes)');
 return new TextEncoder().encode(secret);
}
export function sessionCookie(classId:string):string {
 return 'tl_'+classId.replace(/-/g,'').toLowerCase();
}
export async function signParticipant(classId:string,participantId:string) {
 return new SignJWT({kind:'participant',classId,participantId})
  .setProtectedHeader({alg:'HS256'}).setIssuer('trainlive')
  .setAudience('trainlive-web').setIssuedAt().setExpirationTime('72h').sign(key());
}
export async function readSession(requestedClassId:string):Promise<Session|null> {
 const bearer=headers().get('authorization');
 const token=(bearer?.startsWith('Bearer ')?bearer.slice(7):null)
  ??cookies().get(sessionCookie(requestedClassId))?.value;
 if(!token) return null;
 try {
  const {payload}=await jwtVerify(token,key(),{issuer:'trainlive',audience:'trainlive-web',algorithms:['HS256']});
  if(payload.classId!==requestedClassId) return null;
  if(payload.kind==='participant' && typeof payload.participantId==='string')
   return {kind:'participant',classId:requestedClassId,participantId:payload.participantId};
  if(payload.kind==='staff' && typeof payload.staffId==='string')
   return {kind:'staff',classId:requestedClassId,staffId:payload.staffId};
 }catch {}
 return null;
}
