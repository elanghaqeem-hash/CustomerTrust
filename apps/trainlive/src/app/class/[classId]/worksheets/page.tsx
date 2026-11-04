'use client';
import {useEffect,useRef,useState} from 'react';

type Field={id:string;label:string;type:string;required?:boolean;options?:string[];hint?:string;validate?:string};
type WSPayload={
 fields?:Field[];completion_rule?:string;disclaimer?:string;note?:string;auto_generated_from?:string[];
 repeatable_group?:{min:number;max:number;label?:string;fields:Field[]}
};
type Worksheet={
 id:string;ws_key:string;title:string;module_no:number;slide_ref:number|null;
 payload:WSPayload;due_at:string;data_json:Record<string,unknown>|null;status:'draft'|'submitted'|null
};
type RedFlag={key:string;scenario:string;participant_choice:string;correct_option:string;
 is_correct:boolean;explanation?:string;legal_basis?:string};
const warning='Jangan menuliskan nama nasabah, nomor rekening, NIK, atau data rahasia bank.';
const initialGroup=()=>({masalah:'',tindakan:'',pic:'',indikator:'',target:'',bukti:''});
const initData=(w:Worksheet):Record<string,unknown>=>{
 if(w.data_json&&Object.keys(w.data_json).length)return w.data_json;
 if(w.payload.repeatable_group)return {initiatives:Array.from({length:w.payload.repeatable_group.min},initialGroup)};
 return {};
};

export default function Worksheets({params}:{params:{classId:string}}){
 const id=params.classId;
 const [list,setList]=useState<Worksheet[]>([]);
 const [drafts,setDrafts]=useState<Record<string,Record<string,unknown>>>({});
 const [dirty,setDirty]=useState<Record<string,boolean>>({});
 const revisions=useRef<Record<string,number>>({});
 const submitInProgress=useRef<Record<string,boolean>>({});
 const [active,setActive]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [message,setMessage]=useState('');
 const current=list.find(x=>x.id===active);
 async function load(){
  try{
   const res=await fetch('/api/class/'+id+'/worksheets',{cache:'no-store'});
   if(!res.ok)throw Error(res.status===403?'Sesi tidak berlaku untuk kelas ini.':'Lembar kerja tidak tersedia.');
   const x=await res.json() as {worksheets:Worksheet[]};
   setList(x.worksheets);
   setDrafts(prev=>{
    const next={...prev};
    for(const w of x.worksheets) if(!(w.id in next))next[w.id]=initData(w);
    return next;
   });
   setActive(prev=>prev||x.worksheets[0]?.id||'');
  }catch(e){setError(e instanceof Error?e.message:'Gagal memuat');}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[id]);
 function update(wsId:string,key:string,value:unknown){
  revisions.current[wsId]=(revisions.current[wsId]||0)+1;
  setDrafts(prev=>({...prev,[wsId]:{...(prev[wsId]||{}),[key]:value}}));
  setDirty(prev=>({...prev,[wsId]:true}));
 }
 async function write(ws:Worksheet,submit:boolean){
  const revision=revisions.current[ws.id]||0;
  if(submit)submitInProgress.current[ws.id]=true;
  if(submit)setBusy(true);
  setMessage('');setError('');
  try{
   const data=drafts[ws.id]||{};
   const serialized=JSON.stringify(data);
   const hasDigits=/\b\d{10,16}\b/.test(serialized);
   const confirmNoSensitiveData=hasDigits
    ?window.confirm('Ada rangkaian angka panjang pada lembar kerja. Pastikan bukan NIK, nomor rekening, atau data rahasia bank. Lanjutkan?'):false;
   if(hasDigits&&!confirmNoSensitiveData)return;
   const res=await fetch('/api/class/'+id+'/worksheets',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({worksheetId:ws.id,data,submit,confirmNoSensitiveData})
   });
   const x=await res.json();
   if(!res.ok)throw Error(x.error||'Gagal menyimpan lembar kerja.');
   if(revision===(revisions.current[ws.id]||0))setDirty(prev=>({...prev,[ws.id]:false}));
   if(submit){
    setList(prev=>prev.map(w=>w.id===ws.id?{...w,status:'submitted',data_json:data}:w));
    setMessage('Lembar kerja berhasil dikirim dan terkunci. +'+x.pointsAwarded+' poin.');
   }else setMessage('Draf tersimpan.');
  }catch(e){setError(e instanceof Error?e.message:'Gagal menyimpan');}
  finally{if(submit){submitInProgress.current[ws.id]=false;setBusy(false);}}
 }
 useEffect(()=>{
  if(!current||current.status==='submitted'||!dirty[current.id]||submitInProgress.current[current.id])return;
  const timer=setTimeout(()=>{void write(current,false);},1400);
  return()=>clearTimeout(timer);
 // Autosave only when current draft values change, not on each keypress of unrelated worksheets.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[drafts,active]);
 function renderField(f:Field,value:unknown,onChange:(v:unknown)=>void,prefix:string){
  const key=prefix+'-'+f.id;
  if(f.type==='checkbox')
   return <label key={key} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
    <input type="checkbox" className="mt-1 h-5 w-5 accent-[#0D6E6D]" checked={value===true}
     onChange={e=>onChange(e.target.checked)} disabled={current?.status==='submitted'}/>
    <span>{f.label}</span></label>;
  return <div key={key}><label htmlFor={key} className="field-label">
   {f.label}{f.required?<span className="ml-1 text-brick">*</span>:null}</label>
   {f.type==='textarea'?<textarea id={key} value={String(value??'')} maxLength={3000}
     onChange={e=>onChange(e.target.value)} disabled={current?.status==='submitted'}
     placeholder={f.hint||''} className="field-input field-area"/>:
    f.type==='select'?<select id={key} className="field-input" value={String(value??'')}
     onChange={e=>onChange(e.target.value)} disabled={current?.status==='submitted'}>
     <option value="">Pilih jawaban</option>
     {(f.options||[]).map(o=><option value={o} key={o}>{o}</option>)}</select>:
    f.type==='multiselect'?<fieldset id={key} className="space-y-2 rounded-xl border border-slate-200 p-3">
      <legend className="sr-only">{f.label}</legend>{(f.options||[]).map(o=><label key={o} className="flex items-start gap-3">
       <input type="checkbox" className="mt-1 h-5 w-5 accent-[#0D6E6D]"
        checked={Array.isArray(value)&&value.includes(o)} disabled={current?.status==='submitted'}
        onChange={e=>{
         const previous=Array.isArray(value)?value as string[]:[];
         onChange(e.target.checked?[...previous,o]:previous.filter(x=>x!==o));
        }}/>
       <span>{o}</span></label>)}</fieldset>:
    <input id={key} className="field-input" type={f.type==='date'?'date':'text'}
     maxLength={3000} value={String(value??'')} disabled={current?.status==='submitted'}
     onChange={e=>onChange(e.target.value)} placeholder={f.hint||''}/>}
  </div>;
 }
 const data=current?drafts[current.id]||{}:{};
 const redflags=(data.red_flags||[]) as RedFlag[];
 const group=current?.payload.repeatable_group;
 const initiatives=Array.isArray(data.initiatives)?data.initiatives as Record<string,unknown>[]:[];
 return <main className="min-h-screen bg-paper pb-20">
  <header className="bg-navy px-5 py-5 text-white"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
   <a className="text-xl font-extrabold" href={'/class/'+id}>Train<span className="text-[#55d3c2]">Live</span></a>
   <span className="text-sm text-slate-200">Lembar Kerja Peserta</span></div></header>
  <div className="mx-auto max-w-5xl px-5 py-8">
   <a href={'/class/'+id} className="text-sm font-semibold text-teal">← Kembali ke aktivitas</a>
   <h1 className="mt-4 text-3xl font-extrabold">Lembar kerja pribadi</h1>
   <p className="mt-2 max-w-2xl leading-relaxed text-slate-600">Draf tersimpan otomatis. Setelah dikirim, jawaban terkunci. Setiap lembar kerja lengkap bernilai 20 poin.</p>
   {error&&<div role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-800">{error}</div>}
   {message&&<div role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-teal">{message}</div>}
   {loading?<p className="mt-10">Memuat lembar kerja…</p>:
   <div className="mt-8 grid gap-5 md:grid-cols-[230px_1fr]">
    <nav aria-label="Pilihan lembar kerja" className="flex gap-2 overflow-x-auto pb-2 md:flex-col">
     {list.map(w=><button key={w.id} type="button" onClick={()=>{setActive(w.id);setError('');setMessage('');}}
      aria-current={w.id===active?'page':undefined}
      className={'min-w-32 rounded-xl border px-4 py-3 text-left font-semibold md:w-full '+
       (active===w.id?'border-teal bg-teal text-white':'border-slate-200 bg-white text-navy')}>
      <span>{w.ws_key}</span><span className="block text-xs opacity-80">{w.status==='submitted'?'Sudah dikirim':'Draf / belum diisi'}</span></button>)}
    </nav>
    {current&&<section className="shadow-card rounded-2xl border border-slate-200 bg-white p-5 md:p-8">
     <div className="mb-3 flex flex-wrap justify-between gap-3 text-sm">
      <span className="font-bold text-teal">MODUL {current.module_no} · SLIDE {current.slide_ref??'—'}</span>
      <span className={current.status==='submitted'?'font-semibold text-teal':'text-slate-500'}>
       {current.status==='submitted'?'Terkirim':'Batas: '+new Date(current.due_at).toLocaleString('id-ID',{timeZone:'Asia/Makassar'})+' WITA'}</span>
     </div>
     <h2 className="text-2xl font-extrabold">{current.title}</h2>
     {current.payload.note&&<p className="mt-3 rounded-lg bg-paper p-4 text-slate-600">{current.payload.note}</p>}
     {current.ws_key==='LK2'?
      <div className="mt-5 space-y-4">{redflags.length?
       redflags.map(r=><article key={r.key} className="rounded-xl border border-slate-200 p-4">
        <h3 className="font-bold">{r.key} · {r.is_correct?'Benar':'Belum tepat'}</h3>
        <p className="mt-2 text-sm">{r.scenario}</p>
        <p className="mt-3 text-sm">Jawaban Anda: <strong>{r.participant_choice}</strong> · Kunci: <strong>{r.correct_option}</strong></p>
        <p className="mt-2 text-sm text-slate-600">{r.explanation}</p>
        <p className="mt-2 text-xs text-teal">{r.legal_basis}</p>
       </article>):<p className="rounded-xl bg-paper p-5 text-slate-600">
        Red Flag Sheet akan terbentuk otomatis setelah Anda menjawab RF1–RF4 dan seluruh jawabannya dibahas fasilitator.
       </p>}</div>:
     <>
      <p className="mt-4 text-sm font-semibold text-brick">{warning}</p>
      <div className="mt-6 space-y-5">
       {group?
        <>{initiatives.map((initiative,i)=><fieldset key={i} className="rounded-xl border border-slate-200 bg-paper p-4">
         <legend className="px-2 font-bold">Inisiatif {i+1}</legend><div className="space-y-4">
          {group.fields.map(f=>renderField(f,initiative[f.id],v=>{
           const next=initiatives.map((row,j)=>i===j?{...row,[f.id]:v}:row);
           update(current.id,'initiatives',next);
          },current.ws_key+'-'+i))}</div>
         {current.status!=='submitted'&&initiatives.length>group.min&&
          <button type="button" className="mt-4 rounded-lg border border-brick px-4 text-sm font-bold text-brick"
           onClick={()=>update(current.id,'initiatives',initiatives.filter((_,j)=>j!==i))}>Hapus inisiatif</button>}
        </fieldset>)}
        {current.status!=='submitted'&&initiatives.length<group.max&&
         <button type="button" className="w-full rounded-xl border border-teal bg-white font-bold text-teal"
          onClick={()=>update(current.id,'initiatives',[...initiatives,initialGroup()])}>+ Tambah inisiatif</button>}</>:
        (current.payload.fields||[]).map(f=>renderField(f,data[f.id],v=>update(current.id,f.id,v),current.ws_key))}
      </div>
      {current.payload.disclaimer&&<p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{current.payload.disclaimer}</p>}
      {current.status!=='submitted'&&<div className="mt-7 flex flex-wrap gap-3">
       <button type="button" className="rounded-xl border border-teal bg-white px-5 font-bold text-teal"
        onClick={()=>void write(current,false)} disabled={busy}>Simpan draf</button>
       <button type="button" disabled={busy} className="rounded-xl bg-teal px-6 font-bold text-white"
        onClick={()=>{
         if(window.confirm('Kirim lembar kerja? Setelah terkirim, isian tidak dapat diubah.'))void write(current,true);
        }}>{busy?'Mengirim…':'Kirim Lembar Kerja'}</button>
      </div>}
     </>}
    </section>}
   </div>}
  </div>
 </main>;
}
