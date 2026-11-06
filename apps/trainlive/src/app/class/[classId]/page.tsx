'use client';
import {useParams} from 'next/navigation';
import { useEffect,useRef,useState } from 'react';
type Payload={title?:string;prompt?:string;scenario?:string;tag?:string;options?:string[];multi_max?:number;
 questions?:Array<{q:string;options?:string[];scale?:number;type?:string}>;
 correct?:string;explanation?:string;legal_basis?:string;timer_sec?:number};
type Item={id:string;item_key:string;type:string;module_no:number;slide_ref:number|null;order_no:number;
 payload:Payload;state:'idle'|'open'|'closed'|'revealed';timer_sec:number;opened_at:string|null};
type Leader={participant_id:string;display_name:string;unit:string;points:number;rank_no:number};
const letters=['A','B','C','D','E','F','G','H','I','J'];
const kindLabel=(i:Item)=>i.payload.tag==='focus'?'FOKUS PENUH':i.payload.tag==='poll'?'POLLING':
 i.payload.tag==='chat'?'KETIK DI CHAT':i.type==='test'?'PRE / POST TEST':i.type==='survey'?'EVALUASI':'KUIS';
export default function ClassPage(){
 const id=useParams<{classId:string}>().classId;
 const [items,setItems]=useState<Item[]>([]),[leader,setLeader]=useState<Leader[]>([]);
 const [answers,setAnswers]=useState<Record<string,unknown>>({}),[submitted,setSubmitted]=useState<Record<string,boolean>>({});
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [now,setNow]=useState(Date.now()),[tab,setTab]=useState<'active'|'agenda'|'score'>('active');
 const [reloadKey,setReloadKey]=useState(0);
 const [alerts,setAlerts]=useState(false);
 const [audioReady,setAudioReady]=useState(false);
 const [notificationState,setNotificationState]=useState<'unknown'|'granted'|'denied'|'default'|'unsupported'>('unknown');
 const audioContext=useRef<AudioContext|null>(null),previousAlertItem=useRef<string|null>(null);
 const alertSession=useRef(0),alertsEnabled=useRef(false);
 useEffect(()=>()=>{ // Close audio on exit; discard delayed permission results.
  alertSession.current++;
  alertsEnabled.current=false;
  const context=audioContext.current;
  audioContext.current=null;
  if(context)void context.close().catch(()=>{});
 },[]);
 useEffect(()=>{
  const pulse=()=>{if(document.visibilityState==='visible')void fetch('/api/class/'+id+'/heartbeat',{method:'POST'}).catch(()=>{});};
  pulse();
  const interval=setInterval(pulse,60000);
  return()=>clearInterval(interval);
 },[id]);
 useEffect(()=>{
  let cancelled=false;
  const refresh=async()=>{
   try{
    const [a,b]=await Promise.all([fetch('/api/class/'+id+'/items',{cache:'no-store'}),
      fetch('/api/class/'+id+'/leaderboard',{cache:'no-store'})]);
    if(a.status===403)throw new Error('Sesi kelas tidak berlaku. Silakan bergabung kembali dengan kode kelas.');
    if(!a.ok)throw new Error('Belum dapat mengambil aktivitas kelas.');
    const x=await a.json(),y=b.ok?await b.json():{top:[]};
    if(!cancelled){setItems(x.items);setLeader(y.top||[]);setLoading(false);setError('');}
   }catch(e){if(!cancelled){setError(e instanceof Error?e.message:'Gagal memuat kelas');setLoading(false);}}
  };
  refresh();
  const update=setInterval(refresh,3000),tick=setInterval(()=>setNow(Date.now()),1000);
  return()=>{cancelled=true;clearInterval(update);clearInterval(tick)};
 },[id,reloadKey]);
 const opened=items.filter(x=>x.state==='open').sort((a,b)=>b.order_no-a.order_no)[0];

 const alertworthy=opened?.payload.tag==='focus'||opened?.payload.tag==='quiz';
 useEffect(()=>{
  if(!alerts||!opened||!alertworthy||previousAlertItem.current===opened.id)return;
  previousAlertItem.current=opened.id;
  try{
   const context=audioContext.current;
   if(context&&context.state==='running'){
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type='sine';oscillator.frequency.value=880;gain.gain.value=0.06;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();oscillator.stop(context.currentTime+0.18);
   }
   if('Notification' in window&&Notification.permission==='granted')
    new Notification('Kuis dibuka',{body:'Silakan kembali ke layar TrainLive.',tag:'trainlive-focus'});
  }catch { /* Browser permissions may block audio/notifications; the visible activity remains available. */ }
 },[opened?.id,alerts,alertworthy]);
 useEffect(()=>{
  if(!alerts||!opened||!alertworthy){
   document.title='TrainLive | Customer Trust Challenge';return;
  }
  let flashing=false;
  const timer=setInterval(()=>{
   flashing=!flashing;
   document.title=flashing?'● KUIS DIBUKA | TrainLive':'TrainLive | Customer Trust Challenge';
  },800);
  return()=>{clearInterval(timer);document.title='TrainLive | Customer Trust Challenge';};
 },[opened?.id,alerts,alertworthy]);
 function toggleAlerts(){
  // Show the new switch state immediately, before any browser permission awaits.
  const enabled=!alertsEnabled.current;
  alertsEnabled.current=enabled;
  const session=++alertSession.current;
  setAlerts(enabled);
  if(!enabled){
   const oldContext=audioContext.current;
   audioContext.current=null;
   setAudioReady(false);
   previousAlertItem.current=null;
   if(oldContext)void oldContext.close().catch(()=>{});
   return;
  }
  previousAlertItem.current=null;
  setAudioReady(false);
  setNotificationState('unknown');
  // Unlock sound in the originating tap gesture without blocking the UI.
  try{
   if(typeof window.AudioContext==='function'){
    const context=new window.AudioContext();
    audioContext.current=context;
    void context.resume().then(()=>{
     if(alertSession.current!==session)return;
     const ready=context.state==='running';
     setAudioReady(ready);
     if(ready){ // Short audio feedback to confirm sound is enabled.
      const oscillator=context.createOscillator(),gain=context.createGain();
      oscillator.type='sine';oscillator.frequency.value=740;
      gain.gain.setValueAtTime(0.0001,context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.045,context.currentTime+0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001,context.currentTime+0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();oscillator.stop(context.currentTime+0.17);
     }
    }).catch(()=>{if(alertSession.current===session)setAudioReady(false);});
   }
  }catch{/* Unsupported Web Audio: retain on-screen activity cues. */}
  if(!('Notification' in window)){
   setNotificationState('unsupported');
   return;
  }
  try{
   const permission=Notification.permission;
   setNotificationState(permission);
   if(permission==='default'){
    // Mobile in-app browsers may not support prompts; do not block the toggle.
    void Notification.requestPermission().then(result=>{
     if(alertSession.current===session)setNotificationState(result);
    }).catch(()=>{if(alertSession.current===session)setNotificationState('unsupported');});
   }
  }catch{if(alertSession.current===session)setNotificationState('unsupported');}
 }
 const alertDetail=!alerts?'Ketuk untuk mengaktifkan suara & notifikasi':
  audioReady&&notificationState==='granted'?'Suara siap · Notifikasi diizinkan':
  audioReady&&notificationState==='denied'?'Suara siap · Notifikasi diblokir browser':
  audioReady&&notificationState==='unsupported'?'Suara siap · Notifikasi tak didukung':
  audioReady?'Suara siap · Izin notifikasi mengikuti browser':
  notificationState==='granted'?'Notifikasi diizinkan · Suara tidak tersedia':
  notificationState==='denied'?'Pengingat layar aktif · Notifikasi diblokir':
  notificationState==='unsupported'?'Pengingat layar aktif · Browser membatasi notifikasi':
  'Pengingat layar aktif · Memeriksa izin suara & notifikasi';

 const revealed=items.filter(x=>x.state==='revealed').sort((a,b)=>b.order_no-a.order_no)[0];
 const current=opened||revealed;
 const deadline=current?.opened_at?new Date(current.opened_at).getTime()+current.timer_sec*1000:0;
 const remaining=current?.timer_sec===0?Infinity:Math.max(0,Math.ceil((deadline-now)/1000));
 const canAnswer=Boolean(current&&current.state==='open'&&!submitted[current.id]&&remaining>0);
 const selected=current?answers[current.id]:undefined;
 function updateAnswer(value:unknown){if(current)setAnswers(s=>({...s,[current.id]:value}));}
 async function send(){
  if(!current||!canAnswer)return;
  setBusy(true);setError('');
  const text=typeof selected==='string'?selected:'';
  const confirmNoSensitiveData=/\b\d{10,16}\b/.test(text)
   ?window.confirm('Terdeteksi deretan angka panjang. Pastikan ini bukan NIK, nomor rekening, atau data rahasia bank sebelum mengirim.'):false;
  if(/\b\d{10,16}\b/.test(text)&&!confirmNoSensitiveData){setBusy(false);return;}
  try{
   const res=await fetch('/api/class/'+id+'/respond',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({itemId:current.id,answer:selected,confirmNoSensitiveData})});
   const data=await res.json();
   if(!res.ok){
    if(res.status===409&&data.error==='already submitted'){
     setSubmitted(s=>({...s,[current.id]:true}));return;
    }
    throw Error(data.error||'Jawaban tidak dapat disimpan');
   }
   setSubmitted(s=>({...s,[current.id]:true}));
  }catch(e){setError(e instanceof Error?e.message:'Gagal mengirim');}
  finally{setBusy(false);}
 }
 const answerButtons=(opts:string[],value:unknown,multi=false,change:(x:unknown)=>void=updateAnswer)=>
  <div className="mt-5 space-y-3" role="group" aria-label="Pilihan jawaban">
   {opts.map((option,i)=>{
    const letter=letters[i],checked=multi?Array.isArray(value)&&value.includes(letter):value===letter;
    return <button type="button" key={letter} disabled={!canAnswer} aria-pressed={checked}
     className="select-btn" onClick={()=>{if(multi){
      const next=Array.isArray(value)?value as string[]:[];
      const max=current?.payload.multi_max??opts.length;
      change(checked?next.filter(x=>x!==letter):next.length<max?[...next,letter]:next);
     }else change(letter);}}>
     <span className="option-letter">{letter}</span><span>{option}</span>
    </button>;
   })}
  </div>;
 function renderAnswer(){
  if(!current)return null;
  const p=current.payload;
  if(current.type==='single_choice')return answerButtons(p.options||[],selected);
  if(current.type==='multi_choice')return <>{answerButtons(p.options||[],selected,true)}
   <p className="mt-3 text-sm text-slate-500">Pilih maksimal {p.multi_max??2} pilihan.</p></>;
  if(current.type==='open_text')return <div className="mt-5"><label htmlFor="open-answer" className="field-label">Jawaban Anda</label>
   <textarea id="open-answer" disabled={!canAnswer} maxLength={1500} value={typeof selected==='string'?selected:''}
    onChange={e=>updateAnswer(e.target.value)} className="field-input field-area" placeholder="Tulis satu kalimat tanpa data nasabah."/>
   <p className="mt-2 text-sm text-brick">Jangan menuliskan nama nasabah, nomor rekening, atau data rahasia bank.</p></div>;
  if(current.type==='test')return <div className="mt-5 space-y-5">{(p.questions||[]).map((q,i)=>{
   const all=Array.isArray(selected)?selected as string[]:[];
   return <fieldset key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <legend className="font-semibold"> {i+1}. {q.q}</legend>
    <div className="mt-3 grid gap-2">{(q.options||[]).map((opt,j)=><label key={j} className="flex cursor-pointer gap-3 py-2 text-sm">
      <input type="radio" name={'question-'+i} value={letters[j]} disabled={!canAnswer}
       checked={all[i]===letters[j]} onChange={()=>{const next=[...all];next[i]=letters[j];updateAnswer(next);}}/>
      <span>{letters[j]}. {opt}</span></label>)}</div>
   </fieldset>;
  })}</div>;
  if(current.type==='survey')return <div className="mt-5 space-y-5">{(p.questions||[]).map((q,i)=>{
   const all=Array.isArray(selected)?selected as (string|number)[]:[];
   return <div key={i}><label className="field-label">{i+1}. {q.q}</label>
    {q.scale?<select className="field-input" disabled={!canAnswer} value={all[i]||''}
      onChange={e=>{const next=[...all];next[i]=Number(e.target.value);updateAnswer(next);}}>
      <option value="">Pilih nilai</option>{[1,2,3,4,5].map(v=><option key={v} value={v}>{v}</option>)}</select>
     :<textarea className="field-input field-area" disabled={!canAnswer} value={String(all[i]||'')}
      onChange={e=>{const next=[...all];next[i]=e.target.value;updateAnswer(next);}}/>}</div>;
  })}</div>;
  return null;
 }
 const complete=()=>{if(!current)return false;
  if(current.type==='test'||current.type==='survey')
   return Array.isArray(selected)&&selected.length===(current.payload.questions?.length||0)&&selected.every(x=>x!==''&&x!==undefined);
  if(current.type==='multi_choice')return Array.isArray(selected)&&selected.length>0;
  return typeof selected==='string'&&selected.trim().length>0;
 };
 return <main className="trainlive-participant min-h-screen pb-16">
  <header className="participant-topbar sticky top-0 z-20">
   <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
    <a href="/" className="participant-brand" aria-label="TrainLive — beranda">
     <span className="participant-brand-mark" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13h4l3-8 4 14 3-6h2"/></svg></span>
     <span>Train<span className="participant-brand-accent">Live</span></span>
    </a>
    <span className="participant-topbar-label">CUSTOMER TRUST <span className="hidden sm:inline">CHALLENGE</span></span>
   </div>
  </header>
  <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 sm:pt-8">
   <section className="participant-hero" aria-label="Informasi kelas">
    <div className="participant-hero-content">
     <span className="participant-eyebrow"><span aria-hidden="true">✦</span> YOUR INTERACTIVE CLASSROOM</span>
     <h1>Customer Trust <span>Challenge.</span></h1>
     <p>Setiap pertanyaan adalah kesempatan belajar. Ikuti aktivitas, bagikan ide, dan raih poin terbaikmu.</p>
     <div className="participant-live-status" role="status">
      <span className={'participant-live-dot '+(opened?'is-live':'')} aria-hidden="true"></span>
      {loading?'Menghubungkan ke kelas…':opened?'Aktivitas sedang berlangsung':revealed?'Pembahasan tersedia':'Siap belajar · Menunggu fasilitator'}
     </div>
    </div>
    <div className="participant-hero-art" aria-hidden="true">
     <div className="participant-hero-ring participant-hero-ring-outer"></div>
     <div className="participant-hero-ring participant-hero-ring-inner"></div>
     <div className="participant-hero-center"><span>✦</span></div>
     <span className="participant-hero-star participant-hero-star-one">✳</span>
     <span className="participant-hero-star participant-hero-star-two">✦</span>
    </div>
   </section>
   <div className="participant-shortcuts">
    <button type="button" onClick={toggleAlerts}
     className={'participant-shortcut participant-alert '+(alerts?'is-enabled':'')}
     aria-pressed={alerts} aria-label={alerts?'Matikan pengingat kuis':'Aktifkan pengingat kuis'}>
     <span className="participant-shortcut-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></span>
     <span className="participant-shortcut-copy"><strong>Pengingat kuis {alerts&&<span className="participant-alert-enabled">AKTIF</span>}</strong><small aria-live="polite">{alertDetail}</small></span>
     <span className={'participant-shortcut-toggle '+(alerts?'is-on':'')} aria-hidden="true"><span></span></span>
    </button>
    <a href={'/class/'+id+'/worksheets'} className="participant-shortcut participant-worksheet">
     <span className="participant-shortcut-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8l4 4v14H4V3h4zM16 3v5h4M8 13h8M8 17h6"/></svg></span>
     <span className="participant-shortcut-copy"><strong>Lembar kerja</strong><small>Isi LK1–LK5 dan kumpulkan poin</small></span>
     <span className="participant-shortcut-arrow" aria-hidden="true">↗</span>
    </a>
   </div>
   <div className="participant-tabs" role="tablist" aria-label="Menu peserta">
    <button type="button" role="tab" aria-selected={tab==='active'} onClick={()=>setTab('active')}
     className={'participant-tab '+(tab==='active'?'is-active':'')}><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 17h7M17.5 14v7"/></svg>Aktivitas</button>
    <button type="button" role="tab" aria-selected={tab==='agenda'} onClick={()=>setTab('agenda')}
     className={'participant-tab '+(tab==='agenda'?'is-active':'')}><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 15h3M14 15h3"/></svg>Rundown</button>
    <button type="button" role="tab" aria-selected={tab==='score'} onClick={()=>setTab('score')}
     className={'participant-tab '+(tab==='score'?'is-active':'')}><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4H5a2 2 0 0 0-2 2c0 4 3 6 6 6M17 4h2a2 2 0 0 1 2 2c0 4-3 6-6 6M7 3h10v6a5 5 0 0 1-10 0z"/></svg>Skor</button>
   </div>
   {error&&<div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
    <p>{error}</p><button type="button" className="mt-3 rounded-lg border border-red-600 px-4 py-2 font-bold"
    onClick={()=>setReloadKey(n=>n+1)}>Coba muat ulang</button></div>}
   {loading?<p aria-live="polite" className="participant-panel py-12 text-center text-slate-600">Memuat kelas…</p>:tab==='score'?
    <section className="participant-panel p-5 sm:p-7">
     <span className="participant-kicker">PERINGKAT PESERTA</span>
     <h2 className="mb-2 mt-2 text-2xl font-extrabold">Papan Skor Kelas</h2>
     <p className="mb-6 text-sm text-slate-500">Poin kuis benar, kontribusi chat, dan lembar kerja lengkap.</p>
     <ol className="space-y-3">{leader.map(r=><li key={r.participant_id}
      className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-4"><span className="w-7 text-center font-extrabold text-teal">{r.rank_no}</span>
       <div className="font-bold">{r.display_name}<div className="text-sm font-normal text-slate-500">{r.unit}</div></div></div>
      <strong>{r.points} poin</strong></li>)}</ol>
     {!leader.length&&<p className="py-8 text-center text-slate-500">Belum ada poin dalam kelas.</p>}
    </section>:tab==='agenda'?<section className="participant-panel p-5 sm:p-7">
     <span className="participant-kicker">AGENDA TRAINING</span>
     <h2 className="mt-2 text-2xl font-extrabold">Rundown aktivitas</h2>
     <p className="mt-2 text-sm text-slate-600">Agenda ini diperbarui otomatis oleh fasilitator. Jawaban dan pembahasan hanya muncul saat diizinkan.</p>
     <ol className="mt-5 space-y-3">{items.map(item=><li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
      <div><p className="text-xs font-semibold text-teal">Modul {item.module_no} · Slide {item.slide_ref??'—'}</p>
       <p className="mt-1 font-semibold">{item.payload.title||item.item_key}</p></div>
      <span className="shrink-0 text-xs font-semibold text-slate-600">{item.state==='open'?'Dibuka':item.state==='revealed'?'Dibahas':item.state==='closed'?'Ditutup':'Menunggu'}</span>
     </li>)}</ol>
     {!items.length&&<p className="mt-6 text-slate-500">Rundown belum tersedia.</p>}
    </section>:
    current?<section className="participant-panel overflow-hidden">
     <div className="participant-activity-heading flex flex-wrap items-center justify-between gap-3 px-5 py-5 text-white sm:px-7">
      <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold tracking-wider">{kindLabel(current)}</span>
      <span className="text-sm">Modul {current.module_no} · Slide {current.slide_ref??'—'}</span>
     </div>
     <div className="p-5 md:p-8">
      <div className="mb-5 flex justify-between gap-3 text-sm font-semibold">
       <span className="text-teal">{current.state==='revealed'?'Pembahasan tersedia':'Pertanyaan dibuka'}</span>
       <span aria-live="off" className={'tabular-nums '+(remaining<=10?'text-brick':'text-slate-700')}>
        {current.state==='open'?(remaining===Infinity?'Tanpa batas waktu':'Sisa '+remaining+' detik'):'Selesai'}</span>
      </div>
      <h2 className="text-2xl font-extrabold">{current.payload.title||'Aktivitas Peserta'}</h2>
      {current.payload.scenario&&<p className="mt-4 rounded-xl border-l-4 border-gold bg-paper p-4 leading-relaxed">{current.payload.scenario}</p>}
      <p className="mt-5 text-lg font-semibold leading-relaxed">{current.payload.prompt}</p>
      {renderAnswer()}
      {current.state==='revealed'&&<div className="mt-6 rounded-xl border border-teal/25 bg-[#e8f5f1] p-4">
       <h2 className="text-lg font-bold text-teal">Pembahasan fasilitator</h2>
       {current.payload.correct&&<p className="mt-2 font-bold">Kunci: {current.payload.correct}</p>}
       {current.payload.explanation&&<p className="mt-2 leading-relaxed">{current.payload.explanation}</p>}
       {current.payload.legal_basis&&<p className="mt-2 text-sm">Dasar: {current.payload.legal_basis}</p>}
      </div>}
      {submitted[current.id]?<div role="status" className="mt-6 rounded-xl bg-[#e8f5f1] p-4 font-bold text-teal">
       Jawaban Anda telah tersimpan.</div>:current.state==='open'?
       <button onClick={send} disabled={busy||!canAnswer||!complete()}
        className="mt-7 w-full rounded-xl bg-teal px-5 py-3 font-extrabold text-white hover:bg-[#085d5c]">
        {busy?'Menyimpan…':'Kirim Jawaban'}</button>:null}
     </div>
    </section>:
    <section className="participant-panel participant-waiting text-center" aria-live="polite">
     <div className="participant-wait-illustration" aria-hidden="true">
      <div className="participant-wait-orbit participant-wait-orbit-one"></div>
      <div className="participant-wait-orbit participant-wait-orbit-two"></div>
      <div className="participant-wait-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a9 9 0 1 0 9 9M12 7v5l3 2"/><path d="M17 3h4v4M21 3l-6 6"/></svg></div>
      <span className="participant-wait-sparkle">✦</span>
     </div>
     <span className="participant-kicker">MENUNGGU AKTIVITAS</span>
     <h2>Siap untuk tantangan berikutnya?</h2>
     <p>Pertanyaan akan muncul otomatis saat fasilitator membukanya. Tetap di halaman ini sambil mengikuti training di Zoom atau Microsoft Teams.</p>
     <div className="participant-wait-footer"><span className="participant-live-dot" aria-hidden="true"></span> Terhubung ke kelas · Memeriksa aktivitas setiap 3 detik</div>
    </section>}
  </div>
 </main>;
}
