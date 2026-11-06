import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {transaction} from '@/lib/db';
import {signStaff,sessionCookie} from '@/lib/auth';
import {
 discover,FLOW_COOKIE,matchesPublicOrigin,safeEqual,staffOIDCConfig,tokenRequest,verifiedIdentity,verifyLoginFlow,type LoginFlow
} from '@/lib/staff-oidc';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:NextRequest){
 const config=staffOIDCConfig();
 if(!config||!matchesPublicOrigin(req,config.origin))return NextResponse.json(
  {error:'SSO staf belum siap'}, {status:503});
 const cookie=req.cookies.get(FLOW_COOKIE)?.value||'';
 const code=req.nextUrl.searchParams.get('code')||'';
 const state=req.nextUrl.searchParams.get('state')||'';
 if(!cookie||cookie.length>4096||!code||code.length>4096||!state)
  return NextResponse.json({error:'Sesi login tidak lengkap'},{status:400});
 let flow:LoginFlow;
 try{
  flow=await verifyLoginFlow(cookie);
  if((flow.classId!=='admin'&&!z.string().uuid().safeParse(flow.classId).success)||
     typeof flow.verifier!=='string'||flow.verifier.length<40||
     typeof flow.nonce!=='string'||flow.nonce.length<20||
     typeof flow.state!=='string'||flow.state.length<20||
     !Number.isFinite(flow.created)||Date.now()-flow.created>600000||
     Date.now()<flow.created||!safeEqual(flow.state,state))throw Error('Invalid state');
 }catch{return NextResponse.json({error:'Sesi login kadaluarsa atau tidak sesuai'},{status:400})}
 try{
  const provider=await discover(config);
  const request=tokenRequest(config,code,flow.verifier);
  const tokens=await fetch(provider.token_endpoint,{
   method:'POST',headers:request.headers,
   body:request.body,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)
  });
  if(!tokens.ok)throw Error('OIDC code exchange rejected');
  const payload=await tokens.json() as {id_token?:unknown};
  if(typeof payload.id_token!=='string')throw Error('OIDC ID token missing');
  const identity=await verifiedIdentity(payload.id_token,config,flow.nonce,provider);
  // A standalone Super Admin login uses the same OIDC MFA verification but
  // resolves the approved facilitator's class without accepting a class ID
  // from a public query parameter or granting any new permissions.
  const resolved=await transaction(null,async db=>{
   if(flow.classId==='admin'){
    const r=await db.query<{staff_id:string;class_id:string}>(
     'SELECT * FROM trainlive.resolve_super_admin_oidc($1,$2,$3)',
     [identity.email,identity.issuer,identity.subject]);
    return r.rows[0]?{staffId:r.rows[0].staff_id,classId:r.rows[0].class_id}:null;
   }
   const r=await db.query<{staff_id:string|null}>(
    'SELECT trainlive.resolve_staff_oidc($1,$2,$3,$4) AS staff_id',
    [flow.classId,identity.email,identity.issuer,identity.subject]);
   return r.rows[0]?.staff_id?{staffId:r.rows[0].staff_id,classId:flow.classId}:null;
  });
  if(!resolved)throw Error('Staff not assigned or not approved as Super Admin');
  const token=await signStaff(resolved.classId,resolved.staffId);
  const res=NextResponse.redirect(new URL('/host/'+resolved.classId+
    (flow.classId==='admin'?'/admin':''),config.origin));
  res.cookies.set(FLOW_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
  res.cookies.set(sessionCookie(resolved.classId),token,{
   httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:8*3600
  });
  res.headers.set('Cache-Control','no-store');
  return res;
 }catch{
  const res=NextResponse.json(
   {error:'Login ditolak. Verifikasi akun, MFA, dan penugasan kelas Anda.'},{status:403});
  res.cookies.set(FLOW_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
  res.headers.set('Cache-Control','no-store');
  return res;
 }
}
