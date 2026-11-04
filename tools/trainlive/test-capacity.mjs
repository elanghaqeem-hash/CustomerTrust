// Real HTTP concurrency test against a disposable 25-seat class, not mock handlers.
const [base,code]=process.argv.slice(2);
if(!base||!code)throw Error('Usage: node test-capacity.mjs http://localhost:3337 JOINCODE');
async function join(n){
  const response=await fetch(base+'/api/join',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({code,displayName:'Load Tester '+n,unit:'SYNTHETIC',email:'',consent:true})
  });
  return {status:response.status,body:await response.text()};
}
const results=await Promise.all(Array.from({length:25},(_,i)=>join(i+1)));
const accepted=results.filter(x=>x.status===200);
if(accepted.length!==25)throw Error('Expected 25 accepted joins, received '+JSON.stringify(results.map(x=>x.status)));
const denied=await join(26);
if(denied.status!==422)throw Error('Capacity overflow expected HTTP 422, received '+denied.status+': '+denied.body);
console.log('PASS: 25 concurrent joins and 26th rejected by class capacity');
