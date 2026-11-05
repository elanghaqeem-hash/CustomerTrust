import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';

export type StaffOIDCConfig = {
 issuer: string; clientId: string; clientSecret: string; origin: string;
 allowedDomains: string[]; acceptedAcr: string[];
};
type Metadata = {
 issuer:string; authorization_endpoint:string; token_endpoint:string; jwks_uri:string;
};
export const FLOW_COOKIE='__Host-trainlive-staff-flow';
export type LoginFlow = {
 state:string;nonce:string;verifier:string;classId:string;created:number
};
const FLOW_ISSUER='trainlive';
const FLOW_AUDIENCE='trainlive-staff-oidc-flow';
function flowSecret():Uint8Array{
 const key=process.env.TRAINLIVE_JWT_SECRET||'';
 if(new TextEncoder().encode(key).length<32)throw Error('OIDC flow signing secret missing');
 return new TextEncoder().encode(key);
}
export async function signLoginFlow(flow:LoginFlow):Promise<string>{
 return new SignJWT({...flow})
  .setProtectedHeader({alg:'HS256'}).setIssuer(FLOW_ISSUER)
  .setAudience(FLOW_AUDIENCE).setIssuedAt().setExpirationTime('10m')
  .sign(flowSecret());
}
export async function verifyLoginFlow(cookie:string):Promise<LoginFlow>{
 const {payload}=await jwtVerify(cookie,flowSecret(),{
  issuer:FLOW_ISSUER,audience:FLOW_AUDIENCE,algorithms:['HS256']
 });
 return payload as unknown as LoginFlow;
}


export function staffOIDCConfig():StaffOIDCConfig|null {
 const issuer=process.env.TRAINLIVE_OIDC_ISSUER?.replace(/\/$/,'')||'';
 const clientId=process.env.TRAINLIVE_OIDC_CLIENT_ID||'';
 const origin=process.env.TRAINLIVE_APP_ORIGIN?.replace(/\/$/,'')||'';
 const allowedDomains=(process.env.TRAINLIVE_OIDC_ALLOWED_EMAIL_DOMAINS||'')
  .split(',').map(x=>x.trim().toLowerCase()).filter(x=>/^[a-z0-9.-]+\.[a-z]{2,}$/.test(x));
 if(!issuer||!clientId||!origin||!allowedDomains.length)return null;
 try {
  const i=new URL(issuer),o=new URL(origin);
  if(i.protocol!=='https:'||o.protocol!=='https:'||o.pathname!=='/'||o.search||o.hash||
     i.username||i.password||o.username||o.password)return null;
 }catch{return null}
 return {
  issuer,clientId,origin,allowedDomains,
  clientSecret:process.env.TRAINLIVE_OIDC_CLIENT_SECRET||'',
  acceptedAcr:(process.env.TRAINLIVE_OIDC_MFA_ACR||'').split(',').map(x=>x.trim()).filter(Boolean)
 };
}
export const callbackUrl=(config:StaffOIDCConfig)=>config.origin+'/api/auth/staff/callback';
export function randomURLSafe(bytes=32):string{return randomBytes(bytes).toString('base64url')}
export function sha256URLSafe(value:string):string{
 return createHash('sha256').update(value).digest('base64url');
}
export function safeEqual(a:string,b:string):boolean{
 const aa=Buffer.from(a),bb=Buffer.from(b);
 return aa.length===bb.length&&timingSafeEqual(aa,bb);
}
function httpsEndpoint(value:unknown):value is string{
 if(typeof value!=='string')return false;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}
 catch{return false}
}
export async function discover(config:StaffOIDCConfig):Promise<Metadata>{
 const res=await fetch(config.issuer+'/.well-known/openid-configuration',{
  redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)
 });
 if(!res.ok)throw Error('OIDC discovery failed');
 const data=await res.json() as Partial<Metadata>;
 if(data.issuer!==config.issuer||
  !httpsEndpoint(data.authorization_endpoint)||!httpsEndpoint(data.token_endpoint)||
  !httpsEndpoint(data.jwks_uri))throw Error('OIDC provider metadata invalid');
 return data as Metadata;
}
export async function verifiedIdentity(idToken:string,config:StaffOIDCConfig,nonce:string,
 metadata:Metadata):Promise<{email:string;issuer:string;subject:string}> {
 const jwks=createRemoteJWKSet(new URL(metadata.jwks_uri));
 const {payload}=await jwtVerify(idToken,jwks,{
  issuer:config.issuer,audience:config.clientId,algorithms:['RS256','PS256','ES256']
 });
 if(typeof payload.nonce!=='string'||!safeEqual(payload.nonce,nonce))
  throw Error('OIDC nonce mismatch');
 const email=typeof payload.email==='string'?payload.email.trim().toLowerCase():'';
 if(!email||payload.email_verified!==true||email.length>254||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Verified staff email required');
 const domain=email.split('@')[1];
 if(!config.allowedDomains.includes(domain))throw Error('Staff email domain not approved');
 const details=payload as JWTPayload & {amr?:unknown;acr?:unknown};
 const amr=Array.isArray(details.amr)?details.amr:[];
 const factors=amr.filter((x):x is string=>typeof x==='string').map(x=>x.toLowerCase());
 const mfa=factors.includes('mfa')||
   (factors.includes('pwd')&&factors.some(x=>['otp','webauthn','fido','hwk'].includes(x)));
 const acr=typeof details.acr==='string'&&config.acceptedAcr.includes(details.acr);
 if(!mfa&&!acr)throw Error('Staff MFA claim missing or unapproved');
 if(!payload.sub||typeof payload.sub!=='string')throw Error('OIDC subject missing');
 return {email,issuer:config.issuer,subject:payload.sub};
}
