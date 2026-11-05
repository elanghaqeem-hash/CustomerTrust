// Disposable CI browser acceptance test: 25 separate browser sessions,
// real UI registration, class-scoped staff actions, revealed answers and negative class isolation.
// Never run against live customer classes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const [baseUrl,classId,joinCode,staffTokenPath,otherClassId]=process.argv.slice(2);
if(!/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(baseUrl||'')||
   !/^[0-9a-f-]{36}$/i.test(classId||'')||
   !/^[A-Z2-9]{6}$/.test(joinCode||'')||
   !staffTokenPath||!/^[0-9a-f-]{36}$/i.test(otherClassId||''))
 throw new Error('Usage: test-browser-uat.mjs http://localhost:PORT CLASS_ID JOIN_CODE TOKEN_FILE OTHER_CLASS_ID');
const staffToken=(await readFile(staffTokenPath,'utf8')).trim();
assert.ok(staffToken.length>40,'Synthetic staff JWT missing');
const staffApi=async(path,options={})=>{
 const response=await fetch(baseUrl+path,{
  ...options,headers:{Authorization:'Bearer '+staffToken,...options.headers}
 });
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw Error('Staff API HTTP '+response.status+' at '+path+': '+(body.error||'request failed'));
 return body;
};
async function requireAll(tasks){
 const settled=await Promise.allSettled(tasks);
 const errors=settled.filter(x=>x.status==='rejected').map(x=>x.reason);
 if(errors.length)throw Error(errors.slice(0,3).map(e=>e instanceof Error?e.message:String(e)).join('; '));
}
const browser=await chromium.launch({headless:true});
const contexts=[],pages=Array(25);
try{
 // UI registration is serialized to resemble human-paced enrollment and avoid
 // hydration races on a shared CI runner. The separate capacity suite still
 // validates 25 simultaneous API joins and 600 synthetic requests.
 for(let offset=0;offset<25;offset+=1){
  await requireAll(Array.from({length:1},async(_,j)=>{
   const i=offset+j;
   const context=await browser.newContext({viewport:{width:390,height:844},locale:'id-ID'});
   contexts.push(context);
   const page=await context.newPage();
   pages[i]=page;
   page.setDefaultTimeout(25000);
   await page.goto(baseUrl+'/?code='+joinCode,{waitUntil:'domcontentloaded'});
   await page.locator('#display-name').fill('Peserta Simulasi '+String(i+1).padStart(2,'0'));
   await page.locator('#unit-name').fill('UAT-SYNTHETIC');
   await page.locator('input[type=checkbox]').check();
   // Exercise the hydrated UI in EVERY browser, not an API shortcut.
   await page.waitForFunction(()=>{
    const submit=document.querySelector('button[type=submit]');
    return submit instanceof HTMLButtonElement && !submit.disabled;
   },null,{timeout:25000});
   // Refill AFTER hydration: uncontrolled fills during early React hydration
   // can be replaced by the first state render and silently prevent submit.
   await page.locator('#join-code').fill(joinCode);
   await page.locator('#display-name').fill('Peserta Simulasi '+String(i+1).padStart(2,'0'));
   await page.locator('#unit-name').fill('UAT-SYNTHETIC');
   await page.locator('input[type=checkbox]').check();
   assert.equal(await page.locator('form').evaluate(form=>form.checkValidity()),true,
    'The hydrated registration form must satisfy native HTML validation');
   await page.getByRole('button',{name:'Gabung Kelas'}).click({timeout:25000});
   try{
    await page.waitForURL(url=>url.pathname==='/class/'+classId,
     {waitUntil:'commit',timeout:30000});
   }catch(error){
    const alerts=await page.locator('[role=alert]').allTextContents().catch(()=>[]);
    const valid=await page.locator('form').evaluate(form=>form.checkValidity()).catch(()=>null);
    throw Error('Participant '+(i+1)+' browser join failed: '+
     'URL='+page.url()+' valid='+valid+' alerts='+JSON.stringify(alerts)+
     ' cause='+String(error));
   }
   assert.equal(new URL(page.url()).pathname,'/class/'+classId,
    'Real UI registration must navigate to the intended class');
   await page.getByRole('tab',{name:'Rundown'}).click();
   await page.getByRole('heading',{name:'Rundown aktivitas'}).waitFor();
   assert.equal(await page.getByText(/Kunci:/).count(),0,'Answer exposed before reveal');
   await page.getByRole('tab',{name:'Aktivitas'}).click();
  }));
 }
 console.log('Browser acceptance: 25 independent Chromium form submissions and redirects PASS');
 const hostContext=await browser.newContext({viewport:{width:1280,height:900}});
 contexts.push(hostContext);
 const hostPage=await hostContext.newPage();
 hostPage.setDefaultTimeout(25000);
 await hostPage.goto(baseUrl+'/host/'+classId);
 await hostPage.locator('#staff-token').fill(staffToken);
 await hostPage.getByRole('button',{name:'Hubungkan'}).click();
 await hostPage.getByText('Peran kelas: Fasilitator').waitFor({timeout:30000});
 await hostPage.getByRole('link',{name:'Laporan & Ekspor'}).waitFor();
 console.log('Browser acceptance: authenticated facilitator menu PASS');

 const view=await staffApi('/api/class/'+classId+'/items');
 const question=view.items.find(x=>x.item_key==='SC1');
 assert.ok(question,'Canonical SC1 question missing');
 assert.equal(question.state,'idle');
 await staffApi('/api/class/'+classId+'/action',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({itemId:question.id,action:'open'})
 });
 await requireAll(pages.map(async(page)=>{
  await page.getByRole('heading',{name:'Script Clinic 1 / 2'}).waitFor({timeout:35000});
  assert.equal(await page.getByText(/Kunci:/).count(),0,'Answer leaked while question open');
  await page.locator('button.select-btn').nth(1).click();
  await page.getByRole('button',{name:'Kirim Jawaban'}).click();
  await page.getByText('Jawaban Anda telah tersimpan.').waitFor({timeout:30000});
 }));
 const tally=await staffApi('/api/class/'+classId+'/results?itemId='+question.id);
 assert.equal(tally.joined,25,'Expected 25 participants');
 assert.equal(tally.answered,25,'Expected 25 independent answers');
 assert.ok(tally.counts.some(c=>c.choice==='B'&&c.count===25),'Expected 25 B answers');
 console.log('Browser acceptance: 25 interactive scenario submissions PASS');

 const cross=await pages[0].request.get(baseUrl+'/api/class/'+otherClassId+'/items');
 assert.equal(cross.status(),403,'Cross-class participant access must be denied');
 await staffApi('/api/class/'+classId+'/action',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({itemId:question.id,action:'reveal'})
 });
 await pages[0].getByText('Kunci: B').waitFor({timeout:35000});
 const score=await staffApi('/api/class/'+classId+'/leaderboard');
 assert.equal(score.top.length,10,'Expected top-ten leaderboard');
 assert.ok(score.top.every(p=>Number(p.points)>=10),'Correct answers must award points');
 await pages[0].goto(baseUrl+'/class/'+classId+'/worksheets');
 for(const key of ['LK1','LK2','LK3','LK4','LK5'])
  await pages[0].getByRole('button',{name:new RegExp(key)}).waitFor();
 console.log('Browser acceptance: scoped leaderboard, reveal, five worksheets and class isolation PASS');
 console.log('PASS: 25 synthetic browser participants; no real customer data used');
}catch(error){
 try{await pages[0]?.screenshot({path:'/tmp/trainlive-browser-uat-failure.png'});}catch{}
 console.error('FAIL: synthetic browser UAT:',error instanceof Error?error.message:String(error));
 process.exitCode=1;
}finally{
 await Promise.allSettled(contexts.map(c=>c.close()));
 await browser.close();
}
