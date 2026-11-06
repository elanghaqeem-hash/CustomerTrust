// Full-session simulation: N disposable classes run IN PARALLEL, each with M
// participants joining from one shared IP (bank-office NAT). Every participant
// and facilitator API is exercised in deck order and scores are reconciled.
// Usage: node test-multiclass-sim.mjs BASE /tmp/classes.json PARTICIPANTS_PER_CLASS
// classes.json: [{class_id, join_code, staff_token}]  (synthetic CI fixtures only)
import {readFileSync} from 'node:fs';
const [base,classesPath,perClassArg='30']=process.argv.slice(2);
if(!base||!classesPath)throw Error('Usage: node test-multiclass-sim.mjs BASE CLASSES.json [PER_CLASS]');
const classes=JSON.parse(readFileSync(classesPath,'utf8'));
const perClass=Number(perClassArg);
const letters='ABCDEFGHIJ'.split('');
// Answer keys are withheld from every API caller until reveal, so read them from the seed.
const seed=JSON.parse(readFileSync(new URL('../../seed/customer-trust-challenge.v2.json',import.meta.url),'utf8'));
const keyOf=k=>seed.items.find(i=>i.key===k);
const failures=[];const timings=[];
const fail=(c,msg)=>{failures.push(`[${c}] ${msg}`);};
const expect=(c,cond,msg)=>{if(!cond)fail(c,msg);};
const rnd=n=>Math.floor(Math.random()*n);

async function call(path,{method='GET',body,cookie,token}={}) {
 const t=performance.now();
 const headers={origin:base,'sec-fetch-site':'same-origin'};
 if(body!==undefined)headers['content-type']='application/json';
 if(cookie)headers.cookie=cookie;
 if(token)headers.authorization='Bearer '+token;
 const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
 timings.push(performance.now()-t);
 const ct=r.headers.get('content-type')||'';
 const data=ct.includes('json')?await r.json().catch(()=>null):Buffer.from(await r.arrayBuffer());
 return {status:r.status,data,headers:r.headers};
}

function fillField(f,startDate){
 if(f.type==='checkbox')return Math.random()<.7;
 if(f.type==='select')return f.options[rnd(f.options.length)];
 if(f.type==='multiselect')return [f.options[rnd(f.options.length)]];
 if(f.type==='date')return startDate;
 return 'Simulasi isian '+f.id;
}

async function runClass(cls,idx){
 const C='kelas '+(idx+1);
 const staff=cls.staff_token;
 const caps=await call(`/api/class/${cls.class_id}/capabilities`,{token:staff});
 expect(C,caps.status===200,'capabilities '+caps.status);
 const life=await call(`/api/class/${cls.class_id}/lifecycle`,{token:staff});
 expect(C,life.status===200&&life.data.status==='live','class not live: '+JSON.stringify(life.data));

 // 1. Join: all participants at once from the same IP.
 const joins=await Promise.all(Array.from({length:perClass},(_,i)=>call('/api/join',{method:'POST',body:{
  code:cls.join_code,displayName:`Peserta ${idx+1}-${i+1}`,unit:'Cabang Sim '+(idx+1),email:'',consent:true}})));
 const people=joins.map((j,i)=>({i,ok:j.status===200,status:j.status,
  cookie:j.headers.get('set-cookie')?.split(';')[0],pid:j.data?.participantId,name:`Peserta ${idx+1}-${i+1}`,expected:0,correct:0}));
 const rejected=people.filter(p=>!p.ok);
 expect(C,!rejected.length,`${rejected.length}/${perClass} join ditolak (HTTP ${[...new Set(rejected.map(p=>p.status))]})`);
 const P=people.filter(p=>p.ok);
 const ph=(path,opt={})=>call(path,opt);

 await Promise.all(P.map(p=>ph(`/api/class/${cls.class_id}/heartbeat`,{method:'POST',cookie:p.cookie,body:{}})
  .then(r=>expect(C,r.status<300,'heartbeat '+r.status))));

 // Participants must not see answers before reveal.
 const staffItems=(await call(`/api/class/${cls.class_id}/items`,{token:staff})).data.items;
 expect(C,staffItems.length===17,'expected 17 items, got '+staffItems.length);

 for(const item of staffItems){
  const open=await call(`/api/class/${cls.class_id}/action`,{method:'POST',token:staff,body:{itemId:item.id,action:'open'}});
  expect(C,open.status===200,`open ${item.item_key}: ${open.status} ${JSON.stringify(open.data)}`);
  await Promise.all(P.map(async p=>{
   const view=await ph(`/api/class/${cls.class_id}/items`,{cookie:p.cookie});
   const mine=view.data?.items?.find(x=>x.id===item.id);
   expect(C,mine&&mine.state==='open',`participant cannot see open ${item.item_key}`);
   if(mine&&('correct' in mine.payload||JSON.stringify(mine.payload).includes('"correct"')))
    fail(C,`answer key leaked before reveal for ${item.item_key}`);
   let answer;
   const pl=keyOf(item.item_key);
   if(item.type==='single_choice'){
    const right=Math.random()<.6;answer=right?pl.correct:letters.slice(0,pl.options.length).filter(l=>l!==pl.correct)[rnd(pl.options.length-1)];
    if(right){p.expected+=10;p.correct++;}
   }else if(item.type==='multi_choice')answer=['A','C'].slice(0,1+rnd(2));
   else if(item.type==='test')answer=pl.questions.map(q=>Math.random()<.7?q.correct:letters[rnd(4)]);
   else if(item.type==='open_text')answer='Saya pernah antre lama di kantor layanan '+p.i;
   else if(item.type==='survey')answer=pl.questions.map(q=>q.scale?1+rnd(q.scale):q.options?letters[rnd(q.options.length)]:'Masukan simulasi '+p.i);
   const r=await ph(`/api/class/${cls.class_id}/respond`,{method:'POST',cookie:p.cookie,body:{itemId:item.id,answer}});
   expect(C,r.status===201,`respond ${item.item_key} p${p.i}: ${r.status} ${JSON.stringify(r.data)}`);
   if(Math.random()<.1){ // double-submit (double tap) must be rejected, not double-counted
    const again=await ph(`/api/class/${cls.class_id}/respond`,{method:'POST',cookie:p.cookie,body:{itemId:item.id,answer}});
    expect(C,again.status===409,`double submit ${item.item_key} gave ${again.status}`);
   }
  }));
  const res=await call(`/api/class/${cls.class_id}/results?itemId=${item.id}`,{token:staff});
  expect(C,res.status===200,`results ${item.item_key}: ${res.status}`);
  expect(C,res.data?.answered===P.length,`results ${item.item_key}: answered ${res.data?.answered}/${P.length}`);
  if(item.type==='single_choice'||item.type==='multi_choice')
   expect(C,res.data.counts.length>0&&res.data.counts.every(c=>/^[A-J]$/.test(c.choice)),`results ${item.item_key} breakdown ${JSON.stringify(res.data.counts)}`);
  const close=await call(`/api/class/${cls.class_id}/action`,{method:'POST',token:staff,body:{itemId:item.id,action:'close'}});
  expect(C,close.status===200,`close ${item.item_key}: ${close.status}`);
  if(item.type==='single_choice'||item.type==='test'){
   const rev=await call(`/api/class/${cls.class_id}/action`,{method:'POST',token:staff,body:{itemId:item.id,action:'reveal'}});
   expect(C,rev.status===200,`reveal ${item.item_key}: ${rev.status}`);
   const rev2=await call(`/api/class/${cls.class_id}/action`,{method:'POST',token:staff,body:{itemId:item.id,action:'reveal'}});
   expect(C,rev2.status===200&&rev2.data.awards_inserted===0,`second reveal must not re-award ${item.item_key}: ${JSON.stringify(rev2.data)}`);
   const pv=(await ph(`/api/class/${cls.class_id}/items`,{cookie:P[0].cookie})).data.items.find(x=>x.id===item.id);
   if(item.type==='single_choice')expect(C,pv.payload.correct===keyOf(item.item_key).correct&&pv.payload.explanation,`reveal not visible to participant ${item.item_key}`);
  }
  // Late answer after close must be refused.
  if(item.item_key==='TE1'){
   const late=await ph(`/api/class/${cls.class_id}/respond`,{method:'POST',cookie:P[0].cookie,body:{itemId:item.id,answer:'A'}});
   expect(C,late.status===409,'late answer after close gave '+late.status);
  }
  if(item.item_key==='CHAT-WARMUP'){
   const chat=await call(`/api/class/${cls.class_id}/chat`,{token:staff});
   const msgs=chat.data?.messages||chat.data?.items||[];
   expect(C,chat.status===200&&msgs.length===P.length,`chat feed ${chat.status} count ${msgs.length}/${P.length}`);
   for(const m of msgs.slice(0,3)){
    const r=await call(`/api/class/${cls.class_id}/chat`,{method:'POST',token:staff,body:{messageId:m.id,action:'read_aloud'}});
    expect(C,r.status===200,'read_aloud '+r.status+' '+JSON.stringify(r.data));
    const again=await call(`/api/class/${cls.class_id}/chat`,{method:'POST',token:staff,body:{messageId:m.id,action:'read_aloud'}});
    expect(C,again.status<300,'repeat read_aloud '+again.status);
    const owner=P.find(p=>p.name===m.display_name);if(owner)owner.expected+=5;else fail(C,'chat author not found: '+m.display_name);
   }
   if(msgs[3]){
    const h=await call(`/api/class/${cls.class_id}/chat`,{method:'POST',token:staff,body:{messageId:msgs[3].id,action:'hide'}});
    const u=await call(`/api/class/${cls.class_id}/chat`,{method:'POST',token:staff,body:{messageId:msgs[3].id,action:'unhide'}});
    expect(C,h.status===200&&u.status===200,`hide/unhide ${h.status}/${u.status}`);
   }
  }
 }

 // Worksheets: LK1, LK3, LK4, LK5 (+20 each); LK2 auto.
 const start=(await call(`/api/class/${cls.class_id}/lifecycle`,{token:staff})).data.start_at.slice(0,10);
 await Promise.all(P.map(async p=>{
  const w=await ph(`/api/class/${cls.class_id}/worksheets`,{cookie:p.cookie});
  expect(C,w.status===200,'worksheets GET '+w.status);
  const list=w.data?.worksheets||[];
  expect(C,list.length===5,'worksheets count '+list.length);
  for(const ws of list){
   if(ws.ws_key==='LK2'){continue;}
   const pl=ws.payload;
   const data={};
   if(pl.repeatable_group)data.initiatives=Array.from({length:3},()=>Object.fromEntries(pl.repeatable_group.fields.map(f=>[f.id,fillField(f,start)])));
   else for(const f of pl.fields)data[f.id]=fillField(f,start);
   const draft=await ph(`/api/class/${cls.class_id}/worksheets`,{method:'POST',cookie:p.cookie,body:{worksheetId:ws.id,data,submit:false}});
   expect(C,draft.status===200,`${ws.ws_key} draft ${draft.status} ${JSON.stringify(draft.data)}`);
   const sub=await ph(`/api/class/${cls.class_id}/worksheets`,{method:'POST',cookie:p.cookie,body:{worksheetId:ws.id,data,submit:true}});
   expect(C,sub.status===200&&sub.data.pointsAwarded===20,`${ws.ws_key} submit ${sub.status} ${JSON.stringify(sub.data)}`);
   if(sub.data?.pointsAwarded===20)p.expected+=20;
   const relock=await ph(`/api/class/${cls.class_id}/worksheets`,{method:'POST',cookie:p.cookie,body:{worksheetId:ws.id,data,submit:true}});
   expect(C,relock.status===409,`${ws.ws_key} resubmit should be locked, got ${relock.status}`);
  }
  const lk2=(await ph(`/api/class/${cls.class_id}/worksheets`,{cookie:p.cookie})).data.worksheets.find(x=>x.ws_key==='LK2');
  expect(C,lk2&&lk2.status==='submitted'&&lk2.data_json,'LK2 not generated: '+JSON.stringify(lk2).slice(0,200));
  if(lk2?.status==='submitted')p.expected+=20; // LK2 is auto-completed from RF1-RF4 and scores like any worksheet
 }));

 // Scores: leaderboard top 10 must match the ledger we expect.
 const lb=await call(`/api/class/${cls.class_id}/leaderboard`,{token:staff});
 expect(C,lb.status===200,'leaderboard '+lb.status);
 const top=lb.data?.top||[];
 const expectedTop=[...P].sort((a,b)=>b.expected-a.expected).slice(0,10).map(p=>p.expected);
 const gotTop=top.map(r=>Number(r.points??r.total??r.score));
 expect(C,JSON.stringify(gotTop)===JSON.stringify(expectedTop),`leaderboard points ${gotTop} != expected ${expectedTop}`);
 const plb=await ph(`/api/class/${cls.class_id}/leaderboard`,{cookie:P[1].cookie});
 expect(C,plb.status===200,'participant leaderboard '+plb.status);
 expect(C,!JSON.stringify(plb.data).includes('@'),'participant leaderboard exposes email');

 // Report + exports.
 const rep=await call(`/api/class/${cls.class_id}/report`,{token:staff});
 expect(C,rep.status===200,'report '+rep.status);
 for(const fmt of ['csv','xlsx','pdf']){
  const ex=await call(`/api/class/${cls.class_id}/export?format=${fmt}`,{token:staff});
  expect(C,ex.status===200,`export ${fmt} ${ex.status}`);
 }
 // Close class; any later answer is refused.
 const closeClass=await call(`/api/class/${cls.class_id}/lifecycle`,{method:'POST',token:staff,body:{action:'close'}});
 expect(C,closeClass.status===200,'close class '+closeClass.status+' '+JSON.stringify(closeClass.data));
 return {C,participants:P.length,report:rep.data,expectedMax:Math.max(...P.map(p=>p.expected))};
}

const t0=performance.now();
const results=await Promise.all(classes.map(runClass));
// Isolation: a class-A participant/staff token must never read class B.
const a=classes[0],b=classes[1];
const crossStaff=await call(`/api/class/${b.class_id}/items`,{token:a.staff_token});
if(crossStaff.status!==403)fail('isolasi','staff A read class B: '+crossStaff.status);
const sorted=[...timings].sort((x,y)=>x-y);
const pct=q=>Math.round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*q)-1)]);
console.log(JSON.stringify({classes:results.map(r=>({kelas:r.C,peserta:r.participants,skor_tertinggi:r.expectedMax,
 report_keys:r.report?Object.keys(r.report).slice(0,8):null})),requests:timings.length,
 p50_ms:pct(.5),p95_ms:pct(.95),max_ms:Math.round(sorted.at(-1)),total_s:Math.round((performance.now()-t0)/1000)},null,1));
if(failures.length){console.log('FAILURES ('+failures.length+'):');const uniq=[...new Set(failures)];uniq.slice(0,60).forEach(f=>console.log(' - '+f));process.exit(1);}
console.log('PASS: semua kelas berjalan paralel tanpa error, skor cocok, isolasi terjaga');
