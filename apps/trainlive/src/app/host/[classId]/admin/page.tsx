'use client';
import {useParams} from 'next/navigation';
import {useEffect,useState,type FormEvent} from 'react';
type NewClass={classId:string;joinCode:string;name:string;batch:string;date:string;capacity:number};
type Mode='checking'|'sso_login'|'sso_ready'|'manual'|'blocked';
export default function AdminClassPage(){
 const id=useParams<{classId:string}>().classId;
 const [mode,setMode]=useState<Mode>('checking'),[token,setToken]=useState('');
 const [allowed,setAllowed]=useState(false),[busy,setBusy]=useState(false);
 const [name,setName]=useState('Customer Trust Challenge'),[batch,setBatch]=useState(''),[date,setDate]=useState('');
 const [error,setError]=useState(''),[created,setCreated]=useState<NewClass|null>(null);
 const access=mode==='sso_ready'||(mode==='manual'&&Boolean(token));
 const authHeaders=():Record<string,string>=>mode==='manual'&&token?{Authorization:'Bearer '+token}:{};
 useEffect(()=>{
  let active=true;
  fetch('/api/auth/staff/status?classId='+encodeURIComponent(id),{cache:'no-store'})
   .then(async r=>{if(!r.ok)throw Error('Login unavailable');return r.json()})
   .then(s=>{if(active)setMode(s.authenticated?'sso_ready':s.configured?'sso_login':s.manualAllowed?'manual':'blocked')})
   .catch(()=>{if(active)setMode('blocked')});
  return()=>{active=false};
 },[id]);
 useEffect(()=>{
  if(!access){setAllowed(false);return;}
  let active=true;
  fetch('/api/class/'+id+'/admin',{headers:authHeaders(),cache:'no-store'})
   .then(async r=>{if(!r.ok)throw Error('Tidak memiliki hak admin');return r.json()})
   .then(x=>{if(active)setAllowed(x.canCreate===true)})
   .catch(()=>{if(active)setAllowed(false)});
  return()=>{active=false};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[id,mode,token,access]);
 async function save(event:FormEvent){
  event.preventDefault();
  if(!allowed)return;
  setBusy(true);setError('');setCreated(null);
  try{
   const r=await fetch('/api/class/'+id+'/admin',{
    method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},
    body:JSON.stringify({name,batch,date})
   });
   const x=await r.json();
   if(!r.ok)throw Error(x.error||'Gagal membuat kelas');
   setCreated(x as NewClass);
  }catch(e){setError(e instanceof Error?e.message:'Kesalahan membuat kelas');}
  finally{setBusy(false)}
 }
 return <main className="trainlive-workspace min-h-screen pb-16">
  <header className="workspace-nav text-white"><div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-4">
   <a href="/" className="text-xl font-extrabold tracking-tight text-white no-underline">Train<span className="text-[#5eead4]">Live</span><span className="ml-3 border-l border-white/20 pl-3 text-xs font-medium text-slate-300">Administrator</span></a>
   <a className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white no-underline hover:bg-white/20" href={'/host/'+id}>← Kembali ke kelas</a>
  </div></header>
  <div className="mx-auto max-w-3xl px-5 py-9">
   <p className="workspace-eyebrow">CLASS MANAGEMENT</p><h1 className="mt-2 text-3xl font-extrabold tracking-tight">Buat kelas training baru</h1>
   <p className="mt-2 text-slate-600">Salin materi terpublikasi dari kelas sumber tanpa menyalin data peserta, jawaban, atau skor.</p>
   {mode==='checking'&&<p role="status" className="mt-6">Memeriksa akses administrator…</p>}
   {mode==='blocked'&&<p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 text-amber-900">SSO/MFA belum disiapkan. Aksi admin dinonaktifkan.</p>}
   {mode==='sso_login'&&<a className="mt-5 inline-flex rounded-xl bg-teal p-4 font-bold text-white" href={'/api/auth/staff/start?classId='+encodeURIComponent(id)}>Masuk SSO + MFA</a>}
   {mode==='manual'&&<div className="mt-5 rounded-xl bg-amber-50 p-4">
    <label htmlFor="staff-token" className="field-label">Token staf — hanya staging</label>
    <input id="staff-token" type="password" className="field-input" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)}/>
   </div>}
   {access&&!allowed&&<p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 text-amber-900">Hak Super Admin belum diberikan untuk kelas sumber ini.</p>}
   {error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-900">{error}</p>}
   <form className="workspace-card mt-7 p-6 sm:p-8" onSubmit={save}>
    <div className="tl-class-form-header"><span className="number">01</span><div><h2>Informasi kelas</h2><p>Lengkapi detail batch dan tanggal pelaksanaan.</p></div></div>
    <div className="tl-class-form-grid">
    <div className="tl-class-form-wide"><label htmlFor="name" className="field-label">Nama kelas *</label><input id="name" className="field-input" required minLength={3} maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></div>
    <div><label htmlFor="batch" className="field-label">Kode batch *</label><input id="batch" className="field-input" required maxLength={32} pattern="[A-Za-z0-9_-]{1,32}" placeholder="BATCH-02" value={batch} onChange={e=>setBatch(e.target.value)}/></div>
    <div><label htmlFor="date" className="field-label">Tanggal kelas (WITA) *</label><input id="date" type="date" className="field-input" required value={date} onChange={e=>setDate(e.target.value)}/></div>
    <p className="tl-class-form-hint tl-class-form-wide">Jadwal 09.00–16.00 WITA. Kode peserta berlaku dari satu hari sebelum hingga satu hari setelah kelas.</p>
    <div className="tl-class-form-wide"><button disabled={!allowed||busy} className="tl-staff-button">{busy?'Menyimpan…':'Buat kelas dan kode peserta →'}</button></div>
    </div>
   </form>
   {created&&<section aria-live="polite" className="mt-7 rounded-2xl border border-teal bg-white p-6">
    <h2 className="text-xl font-bold text-teal">Kelas berhasil dibuat</h2>
    <p className="mt-3">{created.name} · {created.batch} · {created.date}</p>
    <p className="mt-4 text-sm text-slate-500">Kode akses khusus peserta:</p>
    <p className="mt-2"><span className="tl-access-code font-mono">{created.joinCode}</span></p>
    <p className="mt-2 text-sm">Kapasitas {created.capacity}. Kelas baru tidak berisi peserta maupun jawaban sebelumnya.</p>
    <div className="mt-4 flex flex-wrap gap-5">
     <a className="tl-staff-button" href={'/host/'+created.classId}>Buka konsol kelas →</a>
     <button type="button" className="tl-staff-button tl-staff-button-secondary" onClick={()=>void navigator.clipboard.writeText(window.location.origin+'/?code='+created.joinCode).catch(()=>setError('Tautan gagal disalin'))}>Salin tautan peserta</button>
    </div>
   </section>}
  </div>
 </main>;
}
