import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';

export type Session =
 | { kind:'participant'; classId:string; participantId:string }
 | { kind:'staff'; classId:string; staffId:string };
// The only production-build bearer-token exception is the synthetic GitHub CI
// environment on a reserved, non-routable example.invalid origin. Hostinger
// and Vercel real production domains always require cookie-based SSO/MFA.
export function allowSyntheticStaffFixture():boolean {
 return process.env.CI==='true' &&
  process.env.TRAINLIVE_APP_ORIGIN==='https://trainlive.example.invalid' &&
  process.env.VERCEL_ENV!=='production' &&
  process.env.TRAINLIVE_TRUST_PROXY!=='caddy';
}
function key():Uint8Array {
 const secret=process.env.TRAINLIVE_JWT_SECRET;
 if (!secret || new TextEncoder().encode(secret).length<32)
  throw new Error('TRAINLIVE_JWT_SECRET must be configured (at least 32 bytes)');
 return new TextEncoder().encode(secret);
}
export function sessionCookie(classId:string):string {
 return 'tl_'+classId.replace(/-/g,'').toLowerCase();
}
export async function signStaff(classId:string,staffId:string) {
 return new SignJWT({kind:'staff',classId,staffId})
  .setProtectedHeader({alg:'HS256'}).setIssuer('trainlive')
  .setAudience('trainlive-web').setIssuedAt().setExpirationTime('8h').sign(key());
}
export async function signParticipant(classId:string,participantId:string) {
 return new SignJWT({kind:'participant',classId,participantId})
  .setProtectedHeader({alg:'HS256'}).setIssuer('trainlive')
  .setAudience('trainlive-web').setIssuedAt().setExpirationTime('72h').sign(key());
}
export async function readSession(requestedClassId:string):Promise<Session|null> {
 const bearer=(await headers()).get('authorization');
 const bearerToken=bearer?.startsWith('Bearer ')?bearer.slice(7):null;
 const token=bearerToken
  ??(await cookies()).get(sessionCookie(requestedClassId))?.value;
 if(!token) return null;
 try {
  const {payload}=await jwtVerify(token,key(),{issuer:'trainlive',audience:'trainlive-web',algorithms:['HS256']});
  if(payload.classId!==requestedClassId) return null;
  if(payload.kind==='participant' && typeof payload.participantId==='string')
   return {kind:'participant',classId:requestedClassId,participantId:payload.participantId};
  if(payload.kind==='staff' && typeof payload.staffId==='string') {
   // Production staff must use verified MFA-backed SSO cookies, never pasted bearer tokens.
   if(bearerToken && process.env.NODE_ENV==='production' && !allowSyntheticStaffFixture())return null;
   return {kind:'staff',classId:requestedClassId,staffId:payload.staffId};
  }
 }catch {}
 return null;
}
