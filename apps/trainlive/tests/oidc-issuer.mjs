// Regression: Auth0 commonly advertises a slash-terminated issuer.
// Discovery may ignore only the trailing slash, while ID-token signature,
// issuer, audience, verified email and MFA must still be enforced.
import assert from 'node:assert/strict';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {discover,verifiedIdentity,staffOIDCConfig} from '../src/lib/staff-oidc.ts';

// Auth0 confidential clients must not advertise a login before the token
// exchange secret exists. This is an isolated environment-only regression.
const envKeys=['TRAINLIVE_OIDC_ISSUER','TRAINLIVE_OIDC_CLIENT_ID',
 'TRAINLIVE_OIDC_CLIENT_SECRET','TRAINLIVE_APP_ORIGIN',
 'TRAINLIVE_OIDC_ALLOWED_EMAIL_DOMAINS'];
const previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
try{
 process.env.TRAINLIVE_OIDC_ISSUER='https://unit-test.auth0.com';
 process.env.TRAINLIVE_OIDC_CLIENT_ID='unit-client';
 process.env.TRAINLIVE_APP_ORIGIN='https://trainlive.example.invalid';
 process.env.TRAINLIVE_OIDC_ALLOWED_EMAIL_DOMAINS='gmail.com';
 delete process.env.TRAINLIVE_OIDC_CLIENT_SECRET;
 assert.equal(staffOIDCConfig(),null,'Auth0 login must remain disabled before client secret is set');
 process.env.TRAINLIVE_OIDC_CLIENT_SECRET='synthetic-ci-only-secret';
 assert.equal(staffOIDCConfig()?.clientId,'unit-client','Auth0 login enabled once client secret exists');
}finally{
 for(const key of envKeys){
  if(previous[key]===undefined)delete process.env[key];
  else process.env[key]=previous[key];
 }
}

const config={
 issuer:'https://login-trainlive.auth0.invalid',
 clientId:'test-client',
 clientSecret:'',
 origin:'https://trainlive.example.invalid',
 allowedDomains:['gmail.com'],
 acceptedAcr:[],
 requestAcrValues:'',
 requestAmrClaim:false,
 tokenAuth:'client_secret_post'
};
const metadata={
 issuer:'https://login-trainlive.auth0.invalid/',
 authorization_endpoint:'https://login-trainlive.auth0.invalid/authorize',
 token_endpoint:'https://login-trainlive.auth0.invalid/oauth/token',
 jwks_uri:'https://login-trainlive.auth0.invalid/.well-known/jwks.json'
};
const {publicKey,privateKey}=await generateKeyPair('RS256');
const jwk={...await exportJWK(publicKey),kid:'ci-test-key',alg:'RS256',use:'sig'};
const oldFetch=globalThis.fetch;
try {
 globalThis.fetch=async url=>{
  const path=String(url);
  if(path.endsWith('/.well-known/openid-configuration'))
   return Response.json(metadata);
  if(path.endsWith('/.well-known/jwks.json'))
   return Response.json({keys:[jwk]});
  throw new Error('Unexpected URL in isolated OIDC test');
 };
 const discovered=await discover(config);
 assert.equal(discovered.issuer,metadata.issuer);
 const nonce='nonce-for-ci';
 const sign=claims=>new SignJWT(claims)
  .setProtectedHeader({alg:'RS256',kid:'ci-test-key'})
  .setIssuer(metadata.issuer).setAudience(config.clientId)
  .setIssuedAt().setExpirationTime('5m').sign(privateKey);
 const good=await sign({
  email:'serayamg@gmail.com',email_verified:true,nonce,amr:['pwd','mfa'],
  sub:'auth0|example-user'
 });
 const identity=await verifiedIdentity(good,config,nonce,discovered,publicKey);
 assert.equal(identity.email,'serayamg@gmail.com');
 assert.equal(identity.issuer,metadata.issuer);
 assert.equal(identity.subject,'auth0|example-user');
 const wrongIssuer=await new SignJWT({
  email:'serayamg@gmail.com',email_verified:true,nonce,amr:['pwd','mfa']
 }).setProtectedHeader({alg:'RS256',kid:'ci-test-key'})
  .setSubject('auth0|other').setIssuer(config.issuer)
  .setAudience(config.clientId).setIssuedAt().setExpirationTime('5m').sign(privateKey);
 await assert.rejects(verifiedIdentity(wrongIssuer,config,nonce,discovered,publicKey));
 const noMfa=await sign({email:'serayamg@gmail.com',email_verified:true,nonce,amr:['pwd'],sub:'auth0|no-mfa'});
 await assert.rejects(verifiedIdentity(noMfa,config,nonce,discovered,publicKey),/MFA/);
 const unverified=await sign({email:'serayamg@gmail.com',email_verified:false,nonce,amr:['pwd','mfa'],sub:'auth0|unverified'});
 await assert.rejects(verifiedIdentity(unverified,config,nonce,discovered,publicKey),/Verified/);
 globalThis.fetch=async()=>Response.json({...metadata,issuer:'https://attacker.invalid/'});
 await assert.rejects(discover(config),/metadata invalid/);
 console.log('PASS: Auth0 issuer trailing slash, exact signature issuer, approved Gmail, MFA, email verification, and discovery mismatch');
} finally {
 globalThis.fetch=oldFetch;
}
