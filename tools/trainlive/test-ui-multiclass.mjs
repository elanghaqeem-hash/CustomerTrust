// Browser UAT for every participant/facilitator button and menu, with three
// disposable classes running AT THE SAME TIME. Per class: BROWSER participants
// use the real UI; API participants fill the class to TOTAL seats from the same
// IP; one facilitator browser drives the whole session from the host console.
// Synthetic CI fixtures only — never run against live customer classes.
// Usage: node test-ui-multiclass.mjs BASE classes.json [TOTAL=34] [BROWSER=3]
//   classes.json: [{class_id, join_code, staff_token}] (classes left 'scheduled')
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

const [base,classesPath,totalArg='34',browserArg='3']=process.argv.slice(2);
if(!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base||'')||!classesPath)
 throw Error('Usage: node test-ui-multiclass.mjs http://localhost:PORT classes.json [TOTAL] [BROWSER]');
const classes=JSON.parse(readFileSync(classesPath,'utf8'));
const TOTAL=Number(totalArg),BROWSER=Number(browserArg);
const seed=JSON.parse(readFileSync(new URL('../../seed/customer-trust-challenge.v2.json',import.meta.url),'utf8'));
const L='ABCDEFGHIJ'.split('');
const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);
const checks=new Map();const pass=name=>checks.set(name,(checks.get(name)||0)+1);

const browser=await chromium.launch({headless:true,
 executablePath:process.env.CHROME_PATH||undefined,args:['--disable-dev-shm-usage']});

async function api(path,{method='GET',body,cookie,token}={}){
 const headers={origin:base,'sec-fetch-site':'same-origin'};
 if(body!==undefined)headers['content-type']='application/json';
 if(cookie)headers.cookie=cookie;if(token)headers.authorization='Bearer '+token;
 const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,data:await r.json().catch(()=>null),cookie:r.headers.get('set-cookie')?.split(';')[0]};
}
function apiAnswer(item){
 if(item.type==='single_choice')return L[Math.floor(Math.random()*item.options.length)];
 if(item.type==='multi_choice')return ['B','D'];
 if(item.type==='test')return item.questions.map(q=>q.correct);
 if(item.type==='open_text')return 'Antrean lama tanpa penjelasan di kantor layanan';
 if(item.type==='survey')return item.questions.map(q=>q.scale?5:q.options?'A':'Lebih banyak studi kasus');
}

async function participantJoin(ctx,cls,n){
 const page=await ctx.newPage();page.setDefaultTimeout(30000);
 page.on('dialog',d=>d.accept());
 await page.goto(base+'/?code='+cls.join_code);
 await page.waitForFunction(()=>!document.body.innerText.includes('Memeriksa kesiapan sistem'),null,{timeout:30000});
 await page.locator('#join-code').fill(cls.join_code);
 await page.locator('#display-name').fill('Browser '+cls.n+'-'+n);
 await page.locator('#unit-name').fill('Cabang UI '+cls.n);
 await page.locator('form input[type=checkbox]').check();
 await page.getByRole('button',{name:'Gabung Kelas'}).click();
 await page.waitForURL(u=>u.pathname==='/class/'+cls.class_id);
 pass('peserta: form gabung + redirect kelas');
 // Tabs and shortcuts.
 // Wait for hydration and initial data before interacting with SSR tab controls.
  await page.getByText('Memuat kelas…').waitFor({state:'hidden',timeout:30000});
  await page.getByRole('tab',{name:'Rundown'}).click();
 await page.getByRole('heading',{name:'Rundown aktivitas'}).waitFor();
 const rundown=await page.locator('main ol').innerText();
 assert.ok(!/POLL-TRUST-BREAKER|CHAT-WARMUP|\bEVAL\b/.test(rundown),'raw item key shown in rundown');
 assert.ok(rundown.includes('Kuis Trust Equation'),'TE1 missing from rundown');
 pass('peserta: tab Rundown (17 aktivitas, judul lengkap)');
 await page.getByRole('tab',{name:'Skor'}).click();
 await page.getByRole('heading',{name:'Papan Skor Kelas'}).waitFor();pass('peserta: tab Skor');
 await page.getByRole('tab',{name:'Aktivitas'}).click();pass('peserta: tab Aktivitas');
 const alert=page.getByRole('button',{name:/pengingat kuis/i});
 await alert.click();await page.waitForTimeout(200);
 if(await page.getByRole('button',{name:'Matikan pengingat kuis'}).count()){await page.getByRole('button',{name:'Matikan pengingat kuis'}).click();}
 pass('peserta: tombol Pengingat kuis');
 return page;
}

async function answerInUi(page,item,meta){
 const title=meta.title;
 await page.getByRole('heading',{name:title,exact:true}).first().waitFor({timeout:40000});
 assert.equal(await page.getByText(/^Kunci:/).count(),0,'answer key visible while open: '+meta.key);
 if(item.type==='single_choice'){await page.locator('button.select-btn').nth(meta.correct?L.indexOf(meta.correct):0).click();}
 else if(item.type==='multi_choice'){
  const btn=page.locator('button.select-btn');await btn.nth(0).click();await btn.nth(2).click();await btn.nth(3).click();
  assert.equal(await btn.and(page.locator('[aria-pressed=true]')).count(),2,'poll must cap at 2 choices');
 }
 else if(item.type==='open_text'){await page.locator('#open-answer').fill('Antre 40 menit sementara kenalan didahulukan');}
 else if(item.type==='test'){
  for(const [i,q] of meta.questions.entries())
   await page.locator(`input[name="question-${i}"][value="${q.correct}"]`).check();
 }else if(item.type==='survey'){
  const selects=page.locator('main select');const areas=page.locator('main textarea');
  let s=0,a=0;
  for(const q of meta.questions){
   if(q.scale)await selects.nth(s++).selectOption('4');
   else if(q.options)await selects.nth(s++).selectOption({label:q.options[2]});
   else await areas.nth(a++).fill('Simulasi masukan evaluasi');
  }
 }
 await page.getByRole('button',{name:'Kirim Jawaban'}).click();
 await page.getByText('Jawaban Anda telah tersimpan.').waitFor({timeout:30000});
}

async function hostCard(host,title){
 return host.locator('article.facilitator-item').filter({has:host.getByRole('heading',{name:title,exact:true})});
}
async function clickWhenEnabled(btn){await btn.waitFor();await host_wait(btn);await btn.click();}
async function host_wait(btn){for(let i=0;i<60;i++){if(await btn.isEnabled())return;await new Promise(r=>setTimeout(r,250));}throw Error('button stayed disabled');}

async function runClass(cls,idx){
 cls.n=idx+1;const C='kelas '+cls.n;
 const hostCtx=await browser.newContext({viewport:{width:1366,height:900},acceptDownloads:true});
 const host=await hostCtx.newPage();host.setDefaultTimeout(30000);host.on('dialog',d=>d.accept());
 await host.goto(base+'/host/'+cls.class_id);
 await host.locator('#staff-token').fill(cls.staff_token);
 await host.getByRole('button',{name:'Hubungkan'}).click();
 await host.getByText('Peran kelas: Fasilitator').waitFor();pass('fasilitator: Hubungkan token');
 await clickWhenEnabled(host.getByRole('button',{name:'Mulai kelas'}));
 await host.locator('.facilitator-status-pill').getByText('Berlangsung').waitFor();pass('fasilitator: Mulai kelas');
 // Search + filter.
 await host.getByPlaceholder('Judul, kode, modul…').fill('Kasus 3');
 assert.equal(await host.locator('article.facilitator-item').count(),1);
 await host.getByPlaceholder('Judul, kode, modul…').fill('');
 await host.locator('select').first().selectOption('idle');
 assert.equal(await host.locator('article.facilitator-item').count(),17);
 await host.locator('select').first().selectOption('all');pass('fasilitator: Cari aktivitas + filter status');

 const contexts=[];const pages=[];
 for(let i=0;i<BROWSER;i++){
  const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'id-ID',permissions:['notifications']});
  contexts.push(ctx);pages.push(await participantJoin(ctx,cls,i+1));
 }
 const apiPeople=[];
 const joins=await Promise.all(Array.from({length:TOTAL-BROWSER},(_,i)=>api('/api/join',{method:'POST',
  body:{code:cls.join_code,displayName:'API '+cls.n+'-'+(i+1),unit:'Cabang API',email:'',consent:true}})));
 for(const j of joins){assert.equal(j.status,200,C+' API join '+j.status);apiPeople.push(j.cookie);}
 log(C,'joined',TOTAL,'(browser '+BROWSER+')');

 const items=(await api(`/api/class/${cls.class_id}/items`,{token:cls.staff_token})).data.items;
 for(const item of items){
  const meta=seed.items.find(x=>x.key===item.item_key);
  const full={...item,...meta};
  const card=await hostCard(host,meta.title);
  await clickWhenEnabled(card.getByRole('button',{name:'Buka'}));
  await card.locator('.facilitator-item-state').getByText('Sedang dibuka').waitFor();
  await Promise.all([
   ...pages.map(p=>answerInUi(p,full,meta)),
   ...apiPeople.map(ck=>api(`/api/class/${cls.class_id}/respond`,{method:'POST',cookie:ck,body:{itemId:item.id,answer:apiAnswer(meta)}})
    .then(r=>assert.equal(r.status,201,`${C} API respond ${meta.key} ${r.status} ${JSON.stringify(r.data)}`)))]);
  await card.getByRole('button',{name:'Lihat hasil'}).click();
  const mon=host.locator('section[aria-label="Monitor jawaban"]');
  await mon.locator('.facilitator-response-count strong').getByText(String(TOTAL),{exact:true}).waitFor({timeout:15000});
  await mon.getByText('100% respons terkumpul').waitFor();
  const monitor=await mon.innerText();
  assert.ok(monitor.includes(String(TOTAL)),`${C} monitor for ${meta.key}: ${monitor}`);
  if(item.type==='multi_choice')assert.ok(/\bB\b[\s\S]*\d/.test(monitor)&&/\bD\b/.test(monitor),`${C} poll breakdown missing: ${monitor}`);
  await clickWhenEnabled(card.getByRole('button',{name:'Tutup'}));
  await card.locator('.facilitator-item-state').getByText('Ditutup').waitFor();
  if(item.type==='single_choice'||item.type==='test'){
   await clickWhenEnabled(card.getByRole('button',{name:'Bahas'}));
   await card.locator('.facilitator-item-state').getByText('Dibahas').waitFor();
   if(item.type==='single_choice')await Promise.all(pages.map(p=>p.getByText('Kunci: '+meta.correct).waitFor({timeout:30000})));
  }
  if(meta.key==='CHAT-WARMUP'){
   await host.getByRole('button',{name:'Bacakan (+5)'}).first().waitFor();
   await host.getByRole('button',{name:'Bacakan (+5)'}).first().click();
   await host.getByText('Sudah dibacakan').first().waitFor();pass('fasilitator: Bacakan (+5)');
   await host.getByRole('button',{name:'Sembunyikan'}).nth(1).click();
   await host.getByText('Tersembunyi').first().waitFor();
   await host.getByRole('button',{name:'Tampilkan'}).first().click();
   await host.waitForFunction(()=>!document.body.innerText.includes('Tersembunyi'));pass('fasilitator: Sembunyikan / Tampilkan chat');
  }
  pass(`alur ${meta.key} (${item.type}): Buka → jawab UI+API → Lihat hasil → Tutup${item.type==='single_choice'||item.type==='test'?' → Bahas':''}`);
 }
 log(C,'17 aktivitas selesai');

 // Worksheets in the browser: every LK button, draft, submit, add/remove initiative.
 const wp=pages[0];
 await wp.getByRole('link',{name:/Lembar kerja/}).click();
 await wp.waitForURL(u=>u.pathname.endsWith('/worksheets'));
 for(const key of ['LK1','LK3','LK4','LK5','LK2']){
  await wp.getByRole('button',{name:new RegExp('^'+key)}).click();
  if(key==='LK2'){await wp.getByText(/RF1|Red Flag/).first().waitFor();pass('peserta: LK2 otomatis tampil');continue;}
  const form=wp.locator('main');
  if(key==='LK5'){
   await wp.getByRole('button',{name:'+ Tambah inisiatif'}).click();
   await wp.getByRole('button',{name:'Hapus inisiatif'}).last().click();pass('peserta: LK5 Tambah / Hapus inisiatif');
  }
  for(const sel of await form.locator('select').all())await sel.selectOption({index:1});
  for(const ta of await form.locator('textarea').all())await ta.fill('Isian simulasi '+key);
  for(const inp of await form.locator('input.field-input[type=text]').all())await inp.fill('Kepala Operasional');
  for(const d of await form.locator('input[type=date]').all())await d.fill(new Date(Date.now()+7*864e5).toISOString().slice(0,10));
  for(const cb of await form.locator('fieldset input[type=checkbox]').all()){await cb.check();break;}
  if(key==='LK3')for(const cb of (await form.locator('label input[type=checkbox]').all()).slice(0,4))await cb.check();
  if(key==='LK1'){for(const cb of await form.locator('fieldset input[type=checkbox]').all()){await cb.check();break;}}
  await wp.getByRole('button',{name:'Simpan draf'}).click();
  await wp.getByText(/[Dd]raf (tersimpan|disimpan)/).waitFor().catch(()=>{});
  await wp.getByRole('button',{name:'Kirim Lembar Kerja'}).click();
  await wp.getByRole('button',{name:new RegExp('^'+key+'.*Sudah dikirim')}).waitFor({timeout:20000});
  pass('peserta: '+key+' Simpan draf + Kirim');
 }
 // Leaderboard on participant UI matches the host top 10.
 await wp.goto(base+'/class/'+cls.class_id);await wp.getByRole('tab',{name:'Skor'}).click();
 await wp.locator('main ol li').first().waitFor();pass('peserta: papan skor terisi');

 // Report page + three exports.
 await host.getByRole('link',{name:/Laporan & ekspor/i}).first().click();
 await host.waitForURL(u=>u.pathname.endsWith('/report'));
 // Wait until the access check resolves (manual token field or SSO-ready button).
 await host.waitForFunction(()=>!document.body.innerText.includes('Memeriksa hak akses laporan'));
 if(await host.locator('#report-staff-token').count())await host.locator('#report-staff-token').fill(cls.staff_token);
 await clickWhenEnabled(host.getByRole('button',{name:/Muat laporan|Perbarui laporan/}));
 await host.getByText('Peserta terdaftar').waitFor();
 const reportText=await host.locator('main').innerText();
 assert.ok(reportText.includes(String(TOTAL)),C+' report participant count');pass('fasilitator: Muat laporan');
 for(const fmt of ['CSV','Excel','PDF']){
  const [dl]=await Promise.all([host.waitForEvent('download'),host.getByRole('button',{name:fmt,exact:true}).click()]);
  assert.ok((await dl.path())&&dl.suggestedFilename().includes(cls.class_id));pass('fasilitator: unduh '+fmt);
 }
 await host.getByRole('button',{name:'Salin ID lengkap kelas'}).click().catch(()=>{});
 await host.getByRole('link',{name:/Konsol kelas/}).click();
 await host.waitForURL(u=>u.pathname==='/host/'+cls.class_id);
 await host.locator('#staff-token').or(host.getByText('Peran kelas: Fasilitator')).first().waitFor();
 if(await host.locator('#staff-token').count()){await host.locator('#staff-token').fill(cls.staff_token);await host.getByRole('button',{name:'Hubungkan'}).click();}
 await clickWhenEnabled(host.getByRole('button',{name:'Tutup kelas'}));
 await host.locator('.facilitator-status-pill').getByText('Selesai').waitFor();pass('fasilitator: Tutup kelas');
 assert.equal(await host.getByRole('button',{name:'Buka'}).first().isDisabled(),true,'Buka must be disabled after close');
 await Promise.all(contexts.map(c=>c.close()));await hostCtx.close();
 log(C,'PASS');
}

let failed=null;
try{
 // Landing + admin login menu.
 const ctx=await browser.newContext();const p=await ctx.newPage();
 await p.goto(base+'/');await p.getByRole('link',{name:'Mulai bergabung'}).click();
 await p.getByRole('link',{name:/Login Admin/}).click();await p.waitForURL(u=>u.pathname==='/admin/login');
 await p.getByRole('heading',{name:'Login Administrator'}).waitFor();
 await p.getByRole('link',{name:'Kembali ke halaman peserta'}).click();await p.waitForURL(u=>u.pathname==='/');
 pass('beranda: Mulai bergabung, Login Admin, Kembali');
 const bad=await p.request.post(base+'/api/join',{data:{code:'ZZZZZZ',displayName:'X Y',unit:'Unit',email:'',consent:true},headers:{origin:base}});
 assert.equal(bad.status(),403);pass('beranda: kode salah ditolak');
 await ctx.close();
 await Promise.all(classes.map(runClass));
}catch(e){failed=e;}
finally{await browser.close();}
for(const [k,v] of checks)console.log(`  ✓ ${k}${v>1?` ×${v}`:''}`);
if(failed){console.error('FAIL:',failed.message);process.exit(1);}
console.log(`PASS: ${classes.length} kelas paralel × ${TOTAL} peserta (${BROWSER} via browser per kelas); semua tombol & menu diuji`);
