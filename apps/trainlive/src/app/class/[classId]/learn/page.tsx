'use client';
import {notFound,useParams} from 'next/navigation';
import {LMS_ENABLED} from '@/lib/lms-flags';
import {useEffect,useState} from 'react';

type Lesson={id:string;title:string;contentType:'text'|'link'|'video'|'pdf';body:string;externalUrl:string|null;position:number;completed:boolean};
type Module={id:string;title:string;position:number;lessons:Lesson[]};
type Course={id:string;code:string;title:string;description:string;deliveryMode:string;sequentialModules:boolean;
 enrolled:boolean;totalLessons:number;completedLessons:number;modules:Module[]};
type Catalog={courses:Course[];branding?:{clientName:string;trainingTitle:string;logoUrl:string|null;primaryColor:string|null}};

export default function LearningPage(){
 const {classId}=useParams<{classId:string}>();
 const [courses,setCourses]=useState<Course[]>([]);
 const [branding,setBranding]=useState<Catalog['branding']>();
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const api='/api/class/'+classId+'/learn';
 async function refresh(){
  const r=await fetch(api,{cache:'no-store'});
  const data=await r.json();
  if(!r.ok)throw Error(r.status===403?'Sesi peserta tidak aktif. Bergabung kembali melalui kode kelas.':data.error||'Gagal memuat kursus');
  setCourses((data as Catalog).courses||[]);setBranding((data as Catalog).branding);
 }
 useEffect(()=>{
  let active=true;
  fetch(api,{cache:'no-store'}).then(async r=>{
   const data=await r.json();
   if(!r.ok)throw Error(r.status===403?'Sesi peserta tidak aktif. Bergabung kembali melalui kode kelas.':data.error||'Gagal memuat kursus');
   return data as Catalog;
  }).then(data=>{if(active){setCourses(data.courses||[]);setBranding(data.branding);setLoading(false);}})
   .catch(e=>{if(active){setError(e instanceof Error?e.message:'LMS belum tersedia');setLoading(false);}});
  return()=>{active=false};
 },[api]);
 async function act(body:{action:'enroll'|'complete_lesson';courseId:string;lessonId?:string}){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const r=await fetch(api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const data=await r.json();
   if(!r.ok)throw Error(data.error||'Permintaan tidak dapat diselesaikan');
   await refresh();
   setNotice(body.action==='enroll'?'Berhasil terdaftar di kursus.':'Progres materi berhasil disimpan.');
  }catch(e){setError(e instanceof Error?e.message:'Gagal menyimpan progres');}
  finally{setBusy(false);}
 }
 if(!LMS_ENABLED)notFound();
 return <main className="trainlive-workspace min-h-screen bg-slate-50 pb-20">
  <header className="workspace-nav text-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
   <a href={'/class/'+classId} className="text-lg font-extrabold text-white no-underline">Train<span className="text-teal-300">Live</span> <span className="ml-3 border-l border-white/20 pl-3 text-sm text-white/80">LMS</span></a>
   <a className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white no-underline" href={'/class/'+classId}>← Kembali ke kelas</a>
  </div></header>
  <div className="mx-auto max-w-5xl px-5 py-9">
   <p className="text-xs font-extrabold uppercase tracking-widest text-teal-700">LEARNING PORTAL</p>
   <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Belajar mandiri</h1>
   <p className="mt-3 max-w-3xl text-sm text-slate-600">Akses kursus yang dipublikasikan untuk program kelas Anda. Daftar pada kursus lalu pelajari materi dan tandai yang sudah selesai.</p>
   {loading&&<p role="status" className="mt-6 text-slate-600">Memuat katalog pembelajaran…</p>}
   {error&&<div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">{error}{error.includes('Sesi')&&<a href="/" className="ml-2 font-bold underline">Gabung kelas</a>}</div>}
   {notice&&<p role="status" className="mt-5 rounded-xl bg-teal-50 p-4 text-sm font-semibold text-teal-900">{notice}</p>}
   {!loading&&!error&&courses.length===0&&<div className="workspace-card mt-6 p-8 text-slate-600">Belum ada kursus yang dipublikasikan untuk program ini.</div>}
   {!loading&&<div className="mt-6 grid gap-5">{courses.map(c=><section className="workspace-card p-5 sm:p-7" key={c.id}>
    <div className="flex flex-wrap items-start justify-between gap-4">
     <div className="min-w-0 flex-1"><p className="text-xs font-bold tracking-widest text-teal-700">{c.code} · {c.deliveryMode.replace(/_/g,' ')}</p>
      <h2 className="mt-2 text-xl font-extrabold text-slate-900">{c.title}</h2>
      {c.description&&<p className="mt-2 text-sm text-slate-600">{c.description}</p>}</div>
     {!c.enrolled?<button type="button" disabled={busy} onClick={()=>void act({action:'enroll',courseId:c.id})} className="tl-staff-button">Daftar kursus</button>:
      <span className="rounded-full bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">Terdaftar</span>}
    </div>
    {c.enrolled&&<div className="mt-5">
     <div className="mb-2 flex justify-between gap-2 text-sm font-semibold text-slate-700"><span>Progres materi</span><span>{c.completedLessons}/{c.totalLessons} · {c.totalLessons?Math.round(100*c.completedLessons/c.totalLessons):0}%</span></div>
     <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={'Progres '+c.title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={c.totalLessons?Math.round(100*c.completedLessons/c.totalLessons):0}>
      <div className="h-full rounded-full bg-teal-600 transition-all" style={{width:(c.totalLessons?100*c.completedLessons/c.totalLessons:0)+'%'}}/>
     </div>
     {c.completedLessons===c.totalLessons&&c.totalLessons>0&&<p role="status" className="mt-2 text-xs font-semibold text-teal-800">Seluruh materi telah diselesaikan. Ini belum berarti lulus ujian atau memperoleh sertifikat.</p>}
     <div className="mt-5 space-y-4">{c.modules.map(m=><div key={m.id} className="rounded-xl border border-slate-200 p-4">
      <h3 className="text-base font-extrabold text-slate-900">{m.position}. {m.title}</h3>
      <ol className="mt-3 space-y-3">{m.lessons.map(l=><li key={l.id} className="rounded-xl bg-slate-50 p-4">
       <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-slate-900">{l.position}. {l.title}</h4>
        <span className={'rounded-full px-3 py-1 text-xs font-bold '+(l.completed?'bg-teal-100 text-teal-800':'bg-white text-slate-500')}>{l.completed?'Selesai':'Belum selesai'}</span>
       </div>
       {l.body&&<p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{l.body}</p>}
       {l.externalUrl&&/^https:\/\//.test(l.externalUrl)&&<a href={l.externalUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex text-sm font-bold text-teal-700 underline">Buka materi {l.contentType==='pdf'?'PDF':l.contentType==='video'?'video':'bacaan'} di situs eksternal ↗</a>}
       <div className="mt-4"><button type="button" disabled={busy||l.completed} onClick={()=>void act({action:'complete_lesson',courseId:c.id,lessonId:l.id})}
        className="rounded-lg border border-teal-200 bg-white px-4 py-2 text-sm font-bold text-teal-800 hover:bg-teal-50">{l.completed?'✓ Sudah selesai':'Tandai selesai'}</button></div>
      </li>)}</ol>
     </div>)}</div>
     {c.sequentialModules&&<p className="mt-4 text-xs text-slate-500">Mode berurutan aktif: selesaikan materi sebelumnya untuk membuka penyelesaian materi berikutnya.</p>}
    </div>}
   </section>)}</div>}
  </div>
 </main>;
}
