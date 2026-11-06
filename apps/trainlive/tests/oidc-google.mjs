// Regression: Google Workspace SSO path. Both Google `iss` spellings are valid,
// the `hd` hosted-domain claim must equal the approved email domain (blocks
// consumer accounts using a managed address), and MFA evidence is still required.
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT} from 'jose';
import {verifiedIdentity} from '../src/lib/staff-oidc.ts';

const config={
 issuer:'https://accounts.google.com',
 clientId:'test-client.apps.googleusercontent.com',
 clientSecret:'',
 origin:'https://trainlive.example.invalid',
 allowedDomains:['bank.example.invalid'],
 acceptedAcr:[],
 requestAcrValues:'',
 requestAmrClaim:true,
 tokenAuth:'client_secret_post'
};
const metadata={
 issuer:'https://accounts.google.com',
 authorization_endpoint:'https://accounts.google.com/o/oauth2/v2/auth',
 token_endpoint:'https://oauth2.googleapis.com/token',
 jwks_uri:'https://www.googleapis.com/oauth2/v3/certs'
};
const {publicKey,privateKey}=await generateKeyPair('RS256');
const nonce='nonce-for-ci-google';
const sign=(claims,iss='https://accounts.google.com')=>new SignJWT({
 email:'staff@bank.example.invalid',email_verified:true,hd:'bank.example.invalid',
 nonce,amr:['pwd','mfa'],...claims
}).setProtectedHeader({alg:'RS256',kid:'ci-google-key'})
 .setSubject('google-sub-1').setIssuer(iss).setAudience(config.clientId)
 .setIssuedAt().setExpirationTime('5m').sign(privateKey);
const check=token=>verifiedIdentity(token,config,nonce,metadata,publicKey);

for(const iss of ['https://accounts.google.com','accounts.google.com']){
 const id=await check(await sign({},iss));
 assert.equal(id.email,'staff@bank.example.invalid');
 assert.equal(id.subject,'google-sub-1');
 assert.equal(id.issuer,'https://accounts.google.com');
}
await assert.rejects(check(await sign({},'https://evil.example.invalid')));
await assert.rejects(check(await sign({hd:undefined})),/hosted domain/);
await assert.rejects(check(await sign({hd:'other.example.invalid'})),/hosted domain/);
await assert.rejects(check(await sign({amr:['pwd']})),/MFA/);
await assert.rejects(check(await sign({amr:undefined})),/MFA/);
await assert.rejects(check(await sign({email_verified:false})),/Verified/);
await assert.rejects(check(await sign({email:'staff@other.example.invalid'})),/domain/);
console.log('PASS: Google issuer forms, hd enforcement, MFA, verified email and approved domain');
