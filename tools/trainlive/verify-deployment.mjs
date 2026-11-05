// Read-only deployment smoke test. It intentionally exits non-zero while
// production infrastructure is not ready. No credential or bank data is read.
const raw=process.argv[2]||'https://ct-kohl.vercel.app';
let origin;
try{
 const url=new URL(raw);
 if(url.protocol!=='https:' || url.pathname!=='/' || url.search||url.hash)
  throw Error('Expected an HTTPS origin only');
 origin=url.origin;
}catch{throw Error('Usage: node verify-deployment.mjs https://ct-kohl.vercel.app');}
async function get(path){
 try{
  const res=await fetch(origin+path,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
  return {status:res.status,headers:res.headers,
   contentType:res.headers.get('content-type')||'',
   text:await res.text()};
 }catch(e){return {status:0,headers:new Headers(),contentType:'',
  text:'',error:e instanceof Error?e.name:'network_error'};}
}
const root=await get('/'),health=await get('/api/health');
let payload={};
try{payload=JSON.parse(health.text);}catch{}
const checks={
 frontend:root.status===200&&root.text.includes('TrainLive'),
 csp:!!root.headers.get('content-security-policy'),
 frameGuard:root.headers.get('x-frame-options')==='DENY',
 ready:health.status===200&&payload?.service==='trainlive'&&
  payload?.ready===true&&payload?.status==='ready',
 noCache:health.headers.get('cache-control')?.includes('no-store')===true
};
console.log(JSON.stringify({
 target:origin,frontendHttpStatus:root.status,healthHttpStatus:health.status,
 healthState:typeof payload.status==='string'?payload.status:'unknown',checks,
 decision:Object.values(checks).every(Boolean)?'GO_TO_AUTHORIZED_UAT':'NO_GO'
},null,2));
if(!Object.values(checks).every(Boolean))process.exitCode=1;
