'use client';
import {useParams} from 'next/navigation';
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

export default function Worksheets(){
 const id=useParams<{classId:string}>().classId;
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
   return <label key={key} className={'worksheet-option '+(value===true?'is-selected':'')}>
    <input type="checkbox" className="worksheet-option-checkbox" checked={value===true}
     onChange={e=>onChange(e.target.checked)} disabled={current?.status==='submitted'}/>
    <span className="worksheet-option-label">{f.label}</span></label>;
  return <div key={key} className="worksheet-field"><label htmlFor={key} className="field-label">
   {f.label}{f.required?<span className="ml-1 text-brick">*</span>:null}</label>
   {f.type==='textarea'?<textarea id={key} value={String(value??'')} maxLength={3000}
     onChange={e=>onChange(e.target.value)} disabled={current?.status==='submitted'}
     placeholder={f.hint||''} className="field-input field-area worksheet-input"/>:
    f.type==='select'?<select id={key} className="field-input worksheet-input" value={String(value??'')}
     onChange={e=>onChange(e.target.value)} disabled={current?.status==='submitted'}>
     <option value="">Pilih jawaban</option>
     {(f.options||[]).map(o=><option value={o} key={o}>{o}</option>)}</select>:
    f.type==='multiselect'?<fieldset id={key} className="worksheet-multi-options">
      <legend className="sr-only">{f.label}</legend>{(f.options||[]).map(o=>{
       const checked=Array.isArray(value)&&value.includes(o);
       return <label key={o} className={'worksheet-option '+(checked?'is-selected':'')}>
        <input type="checkbox" className="worksheet-option-checkbox"
         checked={checked} disabled={current?.status==='submitted'}
         onChange={e=>{
          const previous=Array.isArray(value)?value as string[]:[];
          onChange(e.target.checked?[...previous,o]:previous.filter(x=>x!==o));
         }}/>
        <span className="worksheet-option-label">{o}</span></label>;
      })}</fieldset>:
    <input id={key} className="field-input worksheet-input" type={f.type==='date'?'date':'text'}
     maxLength={3000} value={String(value??'')} disabled={current?.status==='submitted'}
     onChange={e=>onChange(e.target.value)} placeholder={f.hint||''}/>}
  </div>;
 }
 const data=current?drafts[current.id]||{}:{};
 const redflags=(data.red_flags||[]) as RedFlag[];
 const group=current?.payload.repeatable_group;
 const initiatives=Array.isArray(data.initiatives)?data.initiatives as Record<string,unknown>[]:[];
 return <main className="trainlive-worksheet min-h-screen pb-16">
  <header className="worksheet-topbar">
   <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
    <a href={'/class/'+id} className="participant-brand" aria-label="TrainLive — aktivitas kelas">
     <span className="participant-brand-mark" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13h4l3-8 4 14 3-6h2"/></svg></span>
     <span>Train<span className="participant-brand-accent">Live</span></span>
    </a>
    <span className="worksheet-topbar-label">RUANG PESERTA <span className="hidden sm:inline">· LEMBAR KERJA</span></span>
   </div>
  </header>
  <div className="mx-auto max-w-5xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
   <a href={'/class/'+id} className="worksheet-back-link">
    <span className="worksheet-back-icon" aria-hidden="true"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg></span>
    <span>Kembali ke aktivitas</span>
   </a>
   <section className="worksheet-hero" aria-label="Informasi lembar kerja">
    <span className="worksheet-eyebrow">✦ AKTIVITAS INDIVIDU</span>
    <h1>Lembar kerja <span>pribadi.</span></h1>
    <p>Refleksikan praktik layanan terbaik Anda. Jawaban disimpan otomatis sebagai draf dan akan terkunci setelah dikirim.</p>
    <div className="worksheet-hero-stats">
     <span><strong>+20</strong> poin per lembar</span>
     <span><strong>{list.filter(w=>w.status==='submitted').length}/{list.length}</strong> sudah dikirim</span>
    </div>
   </section>
   {error&&<div role="alert" className="worksheet-feedback is-error">{error}</div>}
   {message&&<div role="status" className="worksheet-feedback is-success">{message}</div>}
   {loading?<p className="worksheet-loading" role="status">Memuat lembar kerja…</p>:
   <div className="worksheet-grid">
    <nav aria-label="Pilihan lembar kerja" className="worksheet-tabs">
     {list.map(w=><button key={w.id} type="button" onClick={()=>{setActive(w.id);setError('');setMessage('');}}
      aria-current={w.id===active?'page':undefined}
      className={'worksheet-tab '+(active===w.id?'is-active':'')}>
      <strong>{w.ws_key}</strong>
      <small>{w.status==='submitted'?'✓ Sudah dikirim':'Belum dikirim'}</small>
     </button>)}
    </nav>
    {current&&<section className="worksheet-card">
     <div className="worksheet-card-meta">
      <span className="worksheet-module">MODUL {current.module_no} · SLIDE {current.slide_ref??'—'}</span>
      <span className={current.status==='submitted'?'worksheet-due is-submitted':'worksheet-due'}>
       {current.status==='submitted'?'✓ Terkirim':'Batas: '+new Date(current.due_at).toLocaleString('id-ID',{timeZone:'Asia/Makassar'})+' WITA'}</span>
     </div>
     <h2 className="worksheet-card-title">{current.title}</h2>
     {current.payload.note&&<p className="worksheet-note">{current.payload.note}</p>}
     {current.ws_key==='LK2'?
      <div className="worksheet-redflags">{redflags.length?
       redflags.map(r=><article key={r.key} className="worksheet-redflag">
        <h3 className="font-bold">{r.key} · {r.is_correct?'Benar':'Belum tepat'}</h3>
        <p className="mt-2 text-sm">{r.scenario}</p>
        <p className="mt-3 text-sm">Jawaban Anda: <strong>{r.participant_choice}</strong> · Kunci: <strong>{r.correct_option}</strong></p>
        <p className="mt-2 text-sm text-slate-600">{r.explanation}</p>
        <p className="mt-2 text-xs text-teal">{r.legal_basis}</p>
       </article>):<p className="worksheet-empty">
        Red Flag Sheet akan terbentuk otomatis setelah Anda menjawab RF1–RF4 dan seluruh jawabannya dibahas fasilitator.
       </p>}</div>:
     <>
      <p className="worksheet-warning"><span aria-hidden="true">ⓘ</span>{warning}</p>
      <div className="worksheet-fields">
       {group?
        <>{initiatives.map((initiative,i)=><fieldset key={i} className="worksheet-initiative">
         <legend className="px-2 font-bold">Inisiatif {i+1}</legend><div className="space-y-4">
          {group.fields.map(f=>renderField(f,initiative[f.id],v=>{
           const next=initiatives.map((row,j)=>i===j?{...row,[f.id]:v}:row);
           update(current.id,'initiatives',next);
          },current.ws_key+'-'+i))}</div>
         {current.status!=='submitted'&&initiatives.length>group.min&&
          <button type="button" className="worksheet-remove"
           onClick={()=>update(current.id,'initiatives',initiatives.filter((_,j)=>j!==i))}>Hapus inisiatif</button>}
        </fieldset>)}
        {current.status!=='submitted'&&initiatives.length<group.max&&
         <button type="button" className="worksheet-add"
          onClick={()=>update(current.id,'initiatives',[...initiatives,initialGroup()])}>+ Tambah inisiatif</button>}</>:
        (current.payload.fields||[]).map(f=>renderField(f,data[f.id],v=>update(current.id,f.id,v),current.ws_key))}
      </div>
      {current.payload.disclaimer&&<p className="worksheet-disclaimer">{current.payload.disclaimer}</p>}
      {current.status!=='submitted'&&<div className="worksheet-action-area">
       <p className="worksheet-save-caption"><span aria-hidden="true">✓</span> Perubahan tersimpan otomatis saat koneksi tersedia</p>
       <div className="worksheet-actions">
        <button type="button" className="worksheet-save-button"
         onClick={()=>void write(current,false)} disabled={busy}>
         <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h12l3 3v13H4V4h1zM8 4v6h8V4M8 20v-7h8v7"/></svg>
         Simpan draf
        </button>
        <button type="button" disabled={busy} className="worksheet-submit-button"
         onClick={()=>{
          if(window.confirm('Kirim lembar kerja? Setelah terkirim, isian tidak dapat diubah.'))void write(current,true);
         }}>
         {busy?'Mengirim…':'Kirim Lembar Kerja'}
         <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16m-6-6 6 6-6 6"/></svg>
        </button>
       </div>
      </div>}
     </>}
    </section>}
   </div>}
  </div>
 </main>;
}
