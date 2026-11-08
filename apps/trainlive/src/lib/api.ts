import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSession,readTenantSession,type Session } from './auth';

export const classParam=z.string().uuid();
export async function guardClass(classId:string,kind?:Session['kind']) {
 if(!classParam.safeParse(classId).success) return {response:NextResponse.json({error:'invalid class id'},{status:400})};
 const session=await readSession(classId);
 if(!session) return {response:NextResponse.json({error:'class token required or class mismatch'},{status:403})};
 if(kind && session.kind!==kind)
  return {response:NextResponse.json({error:'role not authorized'},{status:403})};
 return {session};
}
export async function guardTenant(tenantId:string){
 if(!classParam.safeParse(tenantId).success)
  return {response:NextResponse.json({error:'invalid tenant id'},{status:400})};
 const session=await readTenantSession(tenantId);
 if(!session)return {response:NextResponse.json({error:'tenant admin SSO session required'},{status:403})};
 return {session};
}
export function privateError(e:unknown) {
 const err=e as {code?:string};
 if (err?.code==='23505') return NextResponse.json({error:'already submitted or pending approval exists'},{status:409});
 if (err?.code==='23503'||err?.code==='42501') return NextResponse.json({error:'forbidden'},{status:403});
 if (err?.code==='22023') return NextResponse.json({error:'request rejected by class rules'},{status:422});
 // SQL driver messages can contain query parameters or participant details.
 // Log only a bounded SQLSTATE code; never emit raw database error text.
 const safeCode=typeof err?.code==='string'&&/^[A-Z0-9]{5}$/.test(err.code)
  ?err.code:'UNCLASSIFIED';
 console.error('trainlive request failed; code='+safeCode);
 return NextResponse.json({error:'request could not be completed'},{status:500});
}

/** Reject cross-origin browser writes even when SameSite cookies are present.
 * Non-browser CI/server callers without Origin/Fetch-Metadata are still subject
 * to signed tokens, class RLS and other endpoint authentication controls.
 */
export function requireSameOrigin(req:Request):NextResponse|null {
 const origin=req.headers.get('origin');
 const fetchSite=req.headers.get('sec-fetch-site');
 if(fetchSite && fetchSite!=='same-origin' && fetchSite!=='none')
  return NextResponse.json({error:'cross-origin request forbidden'},{status:403});
 if(origin){
  try{
   // A reverse proxy can expose the public HTTPS origin while Next.js sees
   // an internal http://app:3000 URL. Pin the known public origin when set.
   const expected=(process.env.TRAINLIVE_TRUST_PROXY==='caddy' && process.env.TRAINLIVE_APP_ORIGIN)
     || new URL(req.url).origin;
   if(new URL(origin).origin!==expected)
    return NextResponse.json({error:'cross-origin request forbidden'},{status:403});
  }catch{
   return NextResponse.json({error:'invalid origin'},{status:403});
  }
 }
 return null;
}
