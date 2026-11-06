import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';

export type StaffOIDCConfig = {
 issuer: string; clientId: string; clientSecret: string; origin: string;
 allowedDomains: string[]; acceptedAcr: string[];
 // acr_values sent on the authorization request to ask the IdP for MFA step-up.
 requestAcrValues: string;
 // Ask for the amr claim explicitly via the OIDC `claims` request parameter
 // (required by Google, which omits amr unless requested).
 requestAmrClaim: boolean;
 // How the confidential client authenticates at the token endpoint.
 tokenAuth: 'client_secret_post'|'client_secret_basic';
};
type Metadata = {
 issuer:string; authorization_endpoint:string; token_endpoint:string; jwks_uri:string;
};
// Google signs ID tokens with iss "https://accounts.google.com" or the bare
// "accounts.google.com"; both identify the same issuer.
export const GOOGLE_ISSUER='https://accounts.google.com';
export const isGoogle=(config:StaffOIDCConfig)=>config.issuer===GOOGLE_ISSUER;
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
  acceptedAcr:(process.env.TRAINLIVE_OIDC_MFA_ACR||'').split(',').map(x=>x.trim()).filter(Boolean),
  requestAcrValues:(process.env.TRAINLIVE_OIDC_ACR_VALUES||'').split(/[\s,]+/).filter(Boolean).join(' '),
  requestAmrClaim:process.env.TRAINLIVE_OIDC_REQUEST_AMR==='true',
  tokenAuth:process.env.TRAINLIVE_OIDC_TOKEN_AUTH==='client_secret_basic'?'client_secret_basic':'client_secret_post'
 };
}
// Behind a private Caddy proxy, Next.js may see an internal request URL.
// Trust forwarding only in explicitly configured Caddy mode when all public
// origin headers agree (the app port is not published to the host).
export function matchesPublicOrigin(req:Request,expected:string):boolean {
  if(new URL(req.url).origin===expected)return true;
  if(process.env.TRAINLIVE_TRUST_PROXY!=='caddy')return false;
  try {
    const host=new URL(expected).host;
    return req.headers.get('host')===host &&
      req.headers.get('x-forwarded-host')===host &&
      req.headers.get('x-forwarded-proto')==='https';
  }catch{return false;}
}
export const callbackUrl=(config:StaffOIDCConfig)=>config.origin+'/api/auth/staff/callback';
// Token-endpoint request for the authorization-code + PKCE exchange.
export function tokenRequest(config:StaffOIDCConfig,code:string,verifier:string):
 {headers:Record<string,string>;body:string}{
 const form=new URLSearchParams({
  grant_type:'authorization_code',code,redirect_uri:callbackUrl(config),code_verifier:verifier
 });
 const headers:Record<string,string>={'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'};
 if(config.clientSecret&&config.tokenAuth==='client_secret_basic'){
  // RFC 6749 §2.3.1: form-urlencode id and secret before Base64.
  const enc=(v:string)=>encodeURIComponent(v).replace(/%20/g,'+');
  headers.Authorization='Basic '+Buffer.from(enc(config.clientId)+':'+enc(config.clientSecret)).toString('base64');
 }else{
  form.set('client_id',config.clientId);
  if(config.clientSecret)form.set('client_secret',config.clientSecret);
 }
 return {headers,body:form.toString()};
}
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
 // OIDC issuer identifiers commonly end with a slash (notably Auth0),
 // while the application config uses a slashless discovery base URL.
 // Accept only that syntactic trailing-slash difference, then verify the
 // signed ID token against the EXACT issuer advertised in metadata.
 if(typeof data.issuer!=='string'||data.issuer.replace(/\/$/,'')!==config.issuer||
  !httpsEndpoint(data.authorization_endpoint)||!httpsEndpoint(data.token_endpoint)||
  !httpsEndpoint(data.jwks_uri))throw Error('OIDC provider metadata invalid');
 return data as Metadata;
}
export async function verifiedIdentity(idToken:string,config:StaffOIDCConfig,nonce:string,
 metadata:Metadata):Promise<{email:string;issuer:string;subject:string}> {
 const jwks=createRemoteJWKSet(new URL(metadata.jwks_uri));
 const {payload}=await jwtVerify(idToken,jwks,{
  issuer:isGoogle(config)?[GOOGLE_ISSUER,'accounts.google.com']:metadata.issuer,
  audience:config.clientId,algorithms:['RS256','PS256','ES256']
 });
 if(typeof payload.nonce!=='string'||!safeEqual(payload.nonce,nonce))
  throw Error('OIDC nonce mismatch');
 const email=typeof payload.email==='string'?payload.email.trim().toLowerCase():'';
 if(!email||payload.email_verified!==true||email.length>254||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Verified staff email required');
 const domain=email.split('@')[1];
 if(!config.allowedDomains.includes(domain))throw Error('Staff email domain not approved');
 // Google: an address in the bank's domain can also exist as an unmanaged
 // consumer account. Only Workspace-managed accounts carry `hd`.
 if(isGoogle(config)){
  const hd=typeof payload.hd==='string'?payload.hd.toLowerCase():'';
  if(hd!==domain)throw Error('Google Workspace hosted domain required');
 }
 const details=payload as JWTPayload & {amr?:unknown;acr?:unknown};
 const amr=Array.isArray(details.amr)?details.amr:[];
 const factors=amr.filter((x):x is string=>typeof x==='string').map(x=>x.toLowerCase());
 const mfa=factors.includes('mfa')||
   (factors.includes('pwd')&&factors.some(x=>['otp','webauthn','fido','hwk'].includes(x)));
 const acr=typeof details.acr==='string'&&config.acceptedAcr.includes(details.acr);
 if(!mfa&&!acr)throw Error('Staff MFA claim missing or unapproved');
 if(!payload.sub||typeof payload.sub!=='string')throw Error('OIDC subject missing');
 return {email,issuer:metadata.issuer,subject:payload.sub};
}
