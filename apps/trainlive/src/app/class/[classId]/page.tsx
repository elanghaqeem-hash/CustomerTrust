'use client';
import { useEffect,useState } from 'react';
type Payload={title?:string;prompt?:string;scenario?:string;tag?:string;options?:string[];multi_max?:number;
 questions?:Array<{q:string;options?:string[];scale?:number;type?:string}>;
 correct?:string;explanation?:string;legal_basis?:string;timer_sec?:number};
type Item={id:string;item_key:string;type:string;module_no:number;slide_ref:number|null;order_no:number;
 payload:Payload;state:'idle'|'open'|'closed'|'revealed';timer_sec:number;opened_at:string|null};
type Leader={participant_id:string;display_name:string;unit:string;points:number;rank_no:number};
const letters=['A','B','C','D','E','F','G','H','I','J'];
const kindLabel=(i:Item)=>i.payload.tag==='focus'?'FOKUS PENUH':i.payload.tag==='poll'?'POLLING':
 i.payload.tag==='chat'?'KETIK DI CHAT':i.type==='test'?'PRE / POST TEST':i.type==='survey'?'EVALUASI':'KUIS';
export default function ClassPage({params}:{params:{classId:string}}){
 const id=params.classId;
 const [items,setItems]=useState<Item[]>([]),[leader,setLeader]=useState<Leader[]>([]);
 const [answers,setAnswers]=useState<Record<string,unknown>>({}),[submitted,setSubmitted]=useState<Record<string,boolean>>({});
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [now,setNow]=useState(Date.now()),[tab,setTab]=useState<'active'|'score'>('active');
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
 },[id]);
 const opened=items.filter(x=>x.state==='open').sort((a,b)=>b.order_no-a.order_no)[0];
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
   if(!res.ok)throw Error(data.error||'Jawaban tidak dapat disimpan');
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
 return <main className="min-h-screen pb-20">
  <header className="sticky top-0 z-10 bg-navy text-white shadow-lg">
   <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
    <div className="font-extrabold">Train<span className="text-[#55d3c2]">Live</span></div>
    <span className="text-right text-xs text-slate-200">CUSTOMER TRUST CHALLENGE</span>
   </div>
  </header>
  <div className="mx-auto max-w-3xl px-4 pt-7 md:px-5">
   <a href={'/class/'+id+'/worksheets'}
    className="mb-5 flex min-h-14 items-center justify-between rounded-xl border border-[#b5cfc8] bg-[#e8f5f1] px-5 py-3 font-bold text-teal">
    <span>Isi Lembar Kerja LK1–LK5</span><span aria-hidden="true">→</span>
   </a>
   <div className="mb-6 grid grid-cols-2 gap-2 rounded-xl bg-white p-1 shadow-sm" role="tablist" aria-label="Menu peserta">
    <button type="button" role="tab" aria-selected={tab==='active'} onClick={()=>setTab('active')}
     className={'rounded-lg px-4 py-3 font-bold '+(tab==='active'?'bg-teal text-white':'text-navy')}>Aktivitas</button>
    <button type="button" role="tab" aria-selected={tab==='score'} onClick={()=>setTab('score')}
     className={'rounded-lg px-4 py-3 font-bold '+(tab==='score'?'bg-teal text-white':'text-navy')}>Skor kelas</button>
   </div>
   {error&&<div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>}
   {loading?<p aria-live="polite" className="py-16 text-center text-slate-600">Memuat kelas…</p>:tab==='score'?
    <section className="shadow-card rounded-2xl bg-white p-6">
     <h1 className="mb-2 text-2xl font-extrabold">Papan Skor Kelas</h1>
     <p className="mb-6 text-sm text-slate-500">Poin kuis benar, kontribusi chat, dan lembar kerja lengkap.</p>
     <ol className="space-y-3">{leader.map(r=><li key={r.participant_id}
      className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-4"><span className="w-7 text-center font-extrabold text-teal">{r.rank_no}</span>
       <div className="font-bold">{r.display_name}<div className="text-sm font-normal text-slate-500">{r.unit}</div></div></div>
      <strong>{r.points} poin</strong></li>)}</ol>
     {!leader.length&&<p className="py-8 text-center text-slate-500">Belum ada poin dalam kelas.</p>}
    </section>:
    current?<section className="shadow-card overflow-hidden rounded-2xl border border-slate-200 bg-white">
     <div className="flex flex-wrap items-center justify-between gap-3 bg-navy px-6 py-5 text-white">
      <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold tracking-wider">{kindLabel(current)}</span>
      <span className="text-sm">Modul {current.module_no} · Slide {current.slide_ref??'—'}</span>
     </div>
     <div className="p-5 md:p-8">
      <div className="mb-5 flex justify-between gap-3 text-sm font-semibold">
       <span className="text-teal">{current.state==='revealed'?'Pembahasan tersedia':'Pertanyaan dibuka'}</span>
       <span aria-live="off" className={'tabular-nums '+(remaining<=10?'text-brick':'text-slate-700')}>
        {current.state==='open'?(remaining===Infinity?'Tanpa batas waktu':'Sisa '+remaining+' detik'):'Selesai'}</span>
      </div>
      <h1 className="text-2xl font-extrabold">{current.payload.title||'Aktivitas Peserta'}</h1>
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
    <section className="shadow-card rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
     <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-[#e8f5f1] text-3xl text-teal">◎</div>
     <h1 className="text-2xl font-extrabold">Menunggu fasilitator</h1>
     <p className="mx-auto mt-3 max-w-md leading-relaxed text-slate-600">Pertanyaan akan tampil otomatis saat dibuka. Tetap buka halaman ini sambil mengikuti training melalui Zoom atau Microsoft Teams.</p>
    </section>}
  </div>
 </main>;
}
