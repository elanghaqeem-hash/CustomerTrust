import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {callbackUrl,discover,FLOW_COOKIE,randomURLSafe,sha256URLSafe,signLoginFlow,staffOIDCConfig} from '@/lib/staff-oidc';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(req:NextRequest){
 const config=staffOIDCConfig();
 if(!config)return NextResponse.json({error:'SSO staf belum dikonfigurasi'}, {status:503});
 if(req.nextUrl.origin!==config.origin)return NextResponse.json({error:'Host SSO tidak sesuai'}, {status:400});
 const classId=req.nextUrl.searchParams.get('classId')||'';
 if(!z.string().uuid().safeParse(classId).success)
  return NextResponse.json({error:'classId tidak valid'},{status:400});
 try{
  const provider=await discover(config),state=randomURLSafe(),nonce=randomURLSafe();
  const verifier=randomURLSafe(48);
  const authorization=new URL(provider.authorization_endpoint);
  authorization.searchParams.set('client_id',config.clientId);
  authorization.searchParams.set('response_type','code');
  authorization.searchParams.set('scope','openid email profile');
  authorization.searchParams.set('redirect_uri',callbackUrl(config));
  authorization.searchParams.set('state',state);
  authorization.searchParams.set('nonce',nonce);
  authorization.searchParams.set('code_challenge',sha256URLSafe(verifier));
  authorization.searchParams.set('code_challenge_method','S256');
  const res=NextResponse.redirect(authorization);
  res.cookies.set(FLOW_COOKIE,await signLoginFlow({
   state,nonce,verifier,classId,created:Date.now()
  }),{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:600});
  res.headers.set('Cache-Control','no-store');
  return res;
 }catch{
  return NextResponse.json({error:'SSO tidak dapat dihubungi'}, {status:503});
 }
}
