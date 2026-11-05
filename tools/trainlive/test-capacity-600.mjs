// 600 same-IP synthetic joins against 24 *disposable* classes.
// CI only, not a substitute for k6 against hosted staging with network latency.
import {readFileSync,appendFileSync} from 'node:fs';
const [base,codesPath]=process.argv.slice(2);
if(!base||!codesPath)throw Error('Usage: node test-capacity-600.mjs http://localhost:3338 /tmp/codes.json');
const codes=JSON.parse(readFileSync(codesPath,'utf8'));
if(!Array.isArray(codes)||codes.length!==24||
   new Set(codes).size!==24||
   codes.some(c=>typeof c!=='string'||!(/^[A-Z2-9]{6}$/.test(c))))
 throw Error('24 unique disposable class codes required.');
const startAll=performance.now();
const participants=codes.flatMap((code,classIndex)=>
 Array.from({length:25},(_,seat)=>({code,classIndex,seat})));
async function join({code,classIndex,seat}) {
 const started=performance.now();
 try {
  const response=await fetch(base+'/api/join',{
   method:'POST',
   headers:{'content-type':'application/json',
    'origin':base,'sec-fetch-site':'same-origin'},
   body:JSON.stringify({code,displayName:'SYNTHETIC-'+classIndex+'-'+seat,
    unit:'PERFORMANCE TEST',email:'',consent:true}),
   signal:AbortSignal.timeout(90000)
  });
  const payload=await response.json().catch(()=>({}));
  return {code,classIndex,status:response.status,classId:payload.classId||null,
   cookie:response.headers.get('set-cookie')?.split(';')[0]||null,
   ms:performance.now()-started};
 }catch(e){
  return {code,classIndex,status:0,classId:null,cookie:null,
   error:e instanceof Error?e.name:'network',ms:performance.now()-started};
 }
}
const results=await Promise.all(participants.map(join));
const successes=results.filter(x=>x.status===200&&x.classId);
const errorCounts=results.filter(x=>x.status!==200).reduce((a,x)=>{
 a[x.status]=(a[x.status]||0)+1;return a;
},{});
const sorted=results.map(x=>x.ms).sort((a,b)=>a-b);
const p95=sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)]||0;
const ids=codes.map((code,j)=>[...new Set(results.filter(x=>x.classIndex===j&&x.classId).map(x=>x.classId))]);
let verified=successes.length===600 && ids.every(x=>x.length===1)
 && new Set(ids.map(x=>x[0])).size===24;
const sample=successes[0];
if(sample){
 const other=ids.find(x=>x.length===1&&x[0]!==sample.classId)?.[0];
 const headers={cookie:sample.cookie||''};
 const self=await fetch(base+'/api/class/'+sample.classId+'/items',{headers});
 const cross=other?await fetch(base+'/api/class/'+other+'/items',{headers}):null;
 verified=verified&&self.status===200&&cross?.status===403;
}
if(ids[0]?.length===1){
 const overflow=await join({code:codes[0],classIndex:0,seat:26});
 verified=verified&&overflow.status===422;
}
const summary={
 scenario:'600 same-IP joins across 24 classes',pass:verified,
 accepted:successes.length,attempted:participants.length,classes:ids.filter(x=>x.length===1).length,
 p95_join_ms:Math.round(p95),elapsed_ms:Math.round(performance.now()-startAll),
 errors:errorCounts,
 note:'Disposable GitHub Actions Postgres/Next.js on one runner, not hosted staging k6 acceptance.'
};
console.log(JSON.stringify(summary,null,2));
if(process.env.GITHUB_STEP_SUMMARY){
 appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  '\n### Synthetic 600-user same-IP integration\n\n'+
  '\x60\x60\x60json\n'+JSON.stringify(summary,null,2)+'\n\x60\x60\x60\n');
}
if(!verified)process.exitCode=1;
