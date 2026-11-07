'use client';

import {notFound,useParams} from 'next/navigation';
import {LMS_ENABLED} from '@/lib/lms-flags';
import {useEffect,useState,type FormEvent} from 'react';

type Mode='checking'|'sso_login'|'sso_ready'|'manual'|'blocked'|'unavailable';
type Module={id:string;moduleKey:string;title:string;kind:'lesson'|'assessment'|'live_session';estimatedMinutes:number;position:number};
type Course={id:string;code:string;title:string;description:string;deliveryMode:'live'|'self_paced'|'blended';passingGrade:number;sequentialModules:boolean;status:'draft'|'published'|'archived';modules:Module[]};
type Catalog={organization:{id:string;name:string};program:{id:string;code:string;title:string};courses:Course[]};
type CourseForm={code:string;title:string;description:string;deliveryMode:Course['deliveryMode'];passingGrade:number;sequentialModules:boolean};
type ModuleForm={courseId:string;moduleKey:string;title:string;kind:Module['kind'];estimatedMinutes:number};
const initialCourse:CourseForm={code:'',title:'',description:'',deliveryMode:'blended',passingGrade:70,sequentialModules:true};
const initialModule:ModuleForm={courseId:'',moduleKey:'',title:'',kind:'lesson',estimatedMinutes:30};
const validClass=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const modes:Record<Course['deliveryMode'],string>={live:'Live Training',self_paced:'Self-Paced',blended:'Blended Learning'};
const kinds:Record<Module['kind'],string>={lesson:'Materi / Lesson',assessment:'Assessment',live_session:'Sesi Live'};

export default function LmsCatalogPage(){
 const {classId}=useParams<{classId:string}>();
 const [mode,setMode]=useState<Mode>('checking');
 const [retry,setRetry]=useState(0),[token,setToken]=useState('');
 const [catalog,setCatalog]=useState<Catalog|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [course,setCourse]=useState<CourseForm>(initialCourse);
 const [editingId,setEditingId]=useState<string|null>(null);
 const [moduleForm,setModuleForm]=useState<ModuleForm>(initialModule);
 const access=mode==='sso_ready'||(mode==='manual'&&Boolean(token));
 const headers=():Record<string,string>=>mode==='manual'&&token?{Authorization:'Bearer '+token}:{};

 useEffect(()=>{
  let active=true;
  setMode('checking');
  if(!validClass(classId)){setMode('blocked');return()=>{active=false};}
  fetch('/api/auth/staff/status?classId='+encodeURIComponent(classId),{cache:'no-store'})
   .then(async r=>{if(!r.ok)throw Error('SSO tidak tersedia');return r.json();})
   .then(s=>{if(active)setMode(s.authenticated?'sso_ready':s.configured?'sso_login':s.manualAllowed?'manual':'blocked');})
   .catch(()=>{if(active)setMode('unavailable');});
  return()=>{active=false};
 },[classId,retry]);

 useEffect(()=>{
  if(!access){setCatalog(null);return;}
  let active=true;
  fetch('/api/class/'+classId+'/lms',{headers:headers(),cache:'no-store'})
   .then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'Akses LMS ditolak');return data as Catalog;})
   .then(data=>{if(active){setCatalog(data);setError('');setModuleForm(v=>({...v,courseId:v.courseId||data.courses[0]?.id||''}));}})
   .catch(e=>{if(active){setCatalog(null);setError(e instanceof Error?e.message:'LMS tidak tersedia');}});
  return()=>{active=false};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[classId,mode,token,access]);

 async function reload(){
  const r=await fetch('/api/class/'+classId+'/lms',{headers:headers(),cache:'no-store'});
  const data=await r.json();
  if(!r.ok)throw Error(data.error||'Gagal memuat katalog');
  setCatalog(data as Catalog);
  setModuleForm(v=>({...v,courseId:v.courseId||data.courses[0]?.id||''}));
 }

 async function submitCourse(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!catalog||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const action=editingId?'update_course':'create_course';
   const body=editingId?{action,courseId:editingId,...course}:{action,...course};
   const r=await fetch('/api/class/'+classId+'/lms',{
    method:'POST',headers:{...headers(),'Content-Type':'application/json'},body:JSON.stringify(body)
   });
   const data=await r.json();
   if(!r.ok)throw Error(data.error||(r.status===409?'Kode kursus sudah digunakan':'Gagal menyimpan kursus'));
   await reload();
   setNotice(editingId?'Parameter kursus diperbarui.':'Kursus baru dibuat sebagai draft.');
   setCourse(initialCourse);setEditingId(null);
  }catch(e){setError(e instanceof Error?e.message:'Gagal menyimpan kursus');}
  finally{setBusy(false);}
 }

 async function submitModule(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!catalog||busy||!moduleForm.courseId)return;
  setBusy(true);setError('');setNotice('');
  try{
   const r=await fetch('/api/class/'+classId+'/lms',{
    method:'POST',headers:{...headers(),'Content-Type':'application/json'},
    body:JSON.stringify({action:'create_module',...moduleForm})
   });
   const data=await r.json();
   if(!r.ok)throw Error(data.error||'Gagal menambah modul');
   await reload();
   setNotice('Modul berhasil ditambahkan ke kursus draft.');
   setModuleForm(v=>({...initialModule,courseId:v.courseId}));
  }catch(e){setError(e instanceof Error?e.message:'Gagal menambah modul');}
  finally{setBusy(false);}
 }

 function editCourse(item:Course){
  setEditingId(item.id);
  setCourse({code:item.code,title:item.title,description:item.description,
   deliveryMode:item.deliveryMode,passingGrade:item.passingGrade,sequentialModules:item.sequentialModules});
  window.scrollTo({top:0,behavior:'smooth'});
 }

 if(!LMS_ENABLED)notFound();
 return <main className="trainlive-workspace min-h-screen bg-slate-50 pb-16">
  <header className="workspace-nav text-white">
   <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
    <a className="text-xl font-extrabold tracking-tight text-white no-underline" href="/">Train<span className="text-teal-300">Live</span><span className="ml-3 border-l border-white/20 pl-3 text-xs font-semibold text-slate-200">LMS Enterprise</span></a>
    <nav className="flex flex-wrap gap-2" aria-label="Navigasi administrator">
     <a className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10" href={'/host/'+classId+'/admin'}>Manajemen Kelas</a>
     <a className="rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10" href={'/host/'+classId}>Konsol Live</a>
    </nav>
   </div>
  </header>
  <div className="mx-auto max-w-6xl px-5 py-8">
   <div className="mb-8">
    <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-teal-700">Learning Management System · P0</p>
    <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Course & Module Builder</h1>
    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">Kelola kursus dan struktur modul berdasarkan program klien. Semua kursus baru disimpan sebagai draft; sesi TrainLive yang sudah berjalan tidak berubah.</p>
   </div>

   {mode==='checking'&&<p role="status" className="rounded-xl bg-white p-5 text-slate-700">Memeriksa akses administrator…</p>}
   {mode==='unavailable'&&<div role="alert" className="rounded-xl bg-amber-50 p-5 text-amber-900">Status autentikasi tidak tersedia. <button type="button" className="font-bold underline" onClick={()=>setRetry(n=>n+1)}>Coba lagi</button></div>}
   {mode==='blocked'&&<p role="alert" className="rounded-xl bg-amber-50 p-5 text-amber-900">ID kelas tidak valid atau SSO/MFA belum diaktifkan. Pengelolaan LMS dikunci.</p>}
   {mode==='sso_login'&&<a href={'/api/auth/staff/start?classId='+encodeURIComponent(classId)} className="inline-flex rounded-xl bg-teal-700 px-5 py-3 font-bold text-white">Masuk melalui SSO + MFA</a>}
   {mode==='manual'&&<div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-5">
    <label className="field-label" htmlFor="lms-staff-token">Token staf (hanya untuk staging)</label>
    <input id="lms-staff-token" className="field-input" type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)} />
   </div>}
   {error&&<p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
   {notice&&<p role="status" className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm font-semibold text-teal-900">{notice}</p>}
   {access&&!catalog&&!error&&<p role="status" className="mt-4 text-slate-600">Memuat katalog LMS…</p>}

   {catalog&&<>
    <section className="mb-7 grid gap-3 sm:grid-cols-3" aria-label="Ringkasan katalog">
     <div className="workspace-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Klien / Tenant</p><p className="mt-2 text-lg font-extrabold text-slate-900">{catalog.organization.name}</p></div>
     <div className="workspace-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Program</p><p className="mt-2 text-lg font-extrabold text-slate-900">{catalog.program.title}</p><p className="text-xs text-slate-500">{catalog.program.code}</p></div>
     <div className="workspace-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Kursus Terdaftar</p><p className="mt-2 text-3xl font-extrabold text-teal-700">{catalog.courses.length}</p></div>
    </section>

    <div className="grid items-start gap-6 lg:grid-cols-2">
     <form onSubmit={submitCourse} className="workspace-card space-y-4 p-5 sm:p-6" aria-labelledby="course-form-title">
      <div><p className="workspace-eyebrow">01 / COURSE CONFIGURATION</p>
       <h2 id="course-form-title" className="mt-1 text-xl font-extrabold text-slate-900">{editingId?'Ubah parameter kursus':'Buat kursus baru'}</h2>
       <p className="mt-1 text-xs text-slate-500">Parameter berlaku pada kursus ini, bukan pada kelas lain.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
       <div><label className="field-label" htmlFor="lms-course-code">Kode kursus *</label><input className="field-input" id="lms-course-code" required pattern="[A-Z][A-Z0-9_-]{2,31}" maxLength={32} disabled={Boolean(editingId)} value={course.code} onChange={e=>setCourse(v=>({...v,code:e.target.value.toUpperCase()}))} placeholder="CYBER001"/></div>
       <div><label className="field-label" htmlFor="lms-mode">Mode pembelajaran</label><select className="field-input" id="lms-mode" value={course.deliveryMode} onChange={e=>setCourse(v=>({...v,deliveryMode:e.target.value as Course['deliveryMode']}))}><option value="live">Live Training</option><option value="self_paced">Self-Paced</option><option value="blended">Blended Learning</option></select></div>
       <div className="sm:col-span-2"><label className="field-label" htmlFor="lms-course-title">Judul kursus *</label><input className="field-input" id="lms-course-title" required minLength={3} maxLength={160} value={course.title} onChange={e=>setCourse(v=>({...v,title:e.target.value}))} placeholder="Contoh: Cybersecurity Awareness"/></div>
       <div className="sm:col-span-2"><label className="field-label" htmlFor="lms-course-desc">Deskripsi kursus</label><textarea className="field-input min-h-24" id="lms-course-desc" maxLength={2000} value={course.description} onChange={e=>setCourse(v=>({...v,description:e.target.value}))} placeholder="Tujuan dan ruang lingkup pembelajaran"/></div>
       <div><label className="field-label" htmlFor="lms-grade">Passing grade (%)</label><input className="field-input" id="lms-grade" type="number" min={0} max={100} required value={course.passingGrade} onChange={e=>setCourse(v=>({...v,passingGrade:Number(e.target.value)}))}/></div>
       <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-700"><input type="checkbox" className="h-4 w-4 accent-teal-700" checked={course.sequentialModules} onChange={e=>setCourse(v=>({...v,sequentialModules:e.target.checked}))}/>Modul berurutan</label>
      </div>
      <div className="flex flex-wrap gap-2"><button className="tl-staff-button" disabled={busy} type="submit">{busy?'Menyimpan…':editingId?'Simpan perubahan':'Buat kursus draft'}</button>
       {editingId&&<button className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700" type="button" onClick={()=>{setEditingId(null);setCourse(initialCourse);}}>Batal edit</button>}
      </div>
     </form>

     <form onSubmit={submitModule} className="workspace-card space-y-4 p-5 sm:p-6" aria-labelledby="module-form-title">
      <div><p className="workspace-eyebrow">02 / CURRICULUM STRUCTURE</p><h2 id="module-form-title" className="mt-1 text-xl font-extrabold text-slate-900">Tambah modul</h2>
       <p className="mt-1 text-xs text-slate-500">Modul dapat ditambahkan pada kursus yang masih draft.</p></div>
      <div><label className="field-label" htmlFor="lms-module-course">Pilih kursus *</label><select id="lms-module-course" className="field-input" required value={moduleForm.courseId} onChange={e=>setModuleForm(v=>({...v,courseId:e.target.value}))}><option value="">Pilih kursus</option>{catalog.courses.filter(c=>c.status==='draft').map(c=><option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}</select></div>
      <div className="grid gap-4 sm:grid-cols-2">
       <div><label className="field-label" htmlFor="lms-module-key">Kode modul *</label><input id="lms-module-key" className="field-input" required pattern="[A-Z][A-Z0-9_-]{1,31}" maxLength={32} value={moduleForm.moduleKey} onChange={e=>setModuleForm(v=>({...v,moduleKey:e.target.value.toUpperCase()}))} placeholder="MOD01"/></div>
       <div><label className="field-label" htmlFor="lms-module-kind">Jenis modul</label><select id="lms-module-kind" className="field-input" value={moduleForm.kind} onChange={e=>setModuleForm(v=>({...v,kind:e.target.value as Module['kind']}))}><option value="lesson">Materi / Lesson</option><option value="assessment">Assessment</option><option value="live_session">Live Session</option></select></div>
       <div className="sm:col-span-2"><label className="field-label" htmlFor="lms-module-title">Judul modul *</label><input id="lms-module-title" className="field-input" required minLength={3} maxLength={160} value={moduleForm.title} onChange={e=>setModuleForm(v=>({...v,title:e.target.value}))} placeholder="Contoh: Pengenalan Keamanan Siber"/></div>
       <div><label className="field-label" htmlFor="lms-module-duration">Estimasi durasi (menit)</label><input id="lms-module-duration" className="field-input" type="number" min={1} max={10080} value={moduleForm.estimatedMinutes} onChange={e=>setModuleForm(v=>({...v,estimatedMinutes:Number(e.target.value)}))}/></div>
      </div>
      <button className="tl-staff-button" type="submit" disabled={busy||!moduleForm.courseId}>{busy?'Menyimpan…':'Tambah modul'}</button>
      <p className="text-xs leading-relaxed text-slate-500">P0 membuat struktur modul. Upload konten, enrolment, ujian dan sertifikat dikembangkan pada tahap berikutnya.</p>
     </form>
    </div>

    <section className="mt-8" aria-labelledby="course-list-title"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div>
     <p className="workspace-eyebrow">03 / COURSE LIBRARY</p><h2 id="course-list-title" className="mt-1 text-xl font-extrabold text-slate-900">Katalog kursus klien</h2></div>
     <button type="button" onClick={()=>void reload().catch(e=>setError(e instanceof Error?e.message:'Gagal memuat katalog'))} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Muat ulang</button>
    </div>
    {!catalog.courses.length?<div className="workspace-card p-8 text-center text-slate-600">Belum ada kursus. Gunakan Course Builder untuk membuat kursus pertama.</div>:
     <div className="grid gap-4 lg:grid-cols-2">{catalog.courses.map(item=><article className="workspace-card p-5 sm:p-6" key={item.id}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold tracking-widest text-teal-700">{item.code}</p><h3 className="mt-1 text-lg font-extrabold text-slate-900">{item.title}</h3></div>
       <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold uppercase text-amber-800">{item.status}</span></div>
      {item.description&&<p className="mt-3 text-sm text-slate-600">{item.description}</p>}
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600"><span className="rounded-lg bg-slate-100 px-2 py-1">{modes[item.deliveryMode]}</span><span className="rounded-lg bg-slate-100 px-2 py-1">Lulus ≥ {item.passingGrade}%</span><span className="rounded-lg bg-slate-100 px-2 py-1">{item.sequentialModules?'Berurutan':'Bebas urutan'}</span></div>
      <div className="mt-4 border-t border-slate-100 pt-4"><p className="mb-2 text-xs font-bold uppercase text-slate-500">Modul ({item.modules.length})</p>
       {item.modules.length?<ol className="space-y-2">{item.modules.map(m=><li key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="min-w-0"><strong className="text-slate-900">{m.position}. {m.title}</strong><span className="ml-2 text-xs text-slate-500">{kinds[m.kind]}</span></span><span className="shrink-0 text-xs text-slate-500">{m.estimatedMinutes} mnt</span></li>)}</ol>:<p className="text-sm text-slate-500">Belum ada modul</p>}</div>
      {item.status==='draft'&&<button type="button" onClick={()=>editCourse(item)} className="mt-4 rounded-xl border border-teal-200 px-4 py-2 text-sm font-bold text-teal-800 hover:bg-teal-50">Ubah parameter</button>}
     </article>)}</div>}
    </section>
   </>}
  </div>
 </main>;
}
