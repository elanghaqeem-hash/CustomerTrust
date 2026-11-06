// Real HTTP concurrency test against a disposable class, not mock handlers.
// SEATS must equal the class capacity (create-class default: 40).
const [base,code,seatsArg='40']=process.argv.slice(2);
const seats=Number(seatsArg);
if(!base||!code)throw Error('Usage: node test-capacity.mjs http://localhost:3337 JOINCODE');
async function join(n){
  const response=await fetch(base+'/api/join',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({code,displayName:'Load Tester '+n,unit:'SYNTHETIC',email:'',consent:true})
  });
  return {status:response.status,body:await response.text()};
}
const results=await Promise.all(Array.from({length:seats},(_,i)=>join(i+1)));
const accepted=results.filter(x=>x.status===200);
if(accepted.length!==seats)throw Error('Expected '+seats+' accepted joins, received '+JSON.stringify(results.map(x=>x.status)));
const denied=await join(seats+1);
if(denied.status!==422)throw Error('Capacity overflow expected HTTP 422, received '+denied.status+': '+denied.body);
console.log(`PASS: ${seats} concurrent joins and seat ${seats+1} rejected by class capacity`);
