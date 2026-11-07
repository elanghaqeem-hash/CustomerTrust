'use client';
import {useParams} from 'next/navigation';
import {useEffect,useState,type FormEvent} from 'react';
type NewClass={classId:string;joinCode:string;name:string;batch:string;date:string;capacity:number;clientName:string;trainingTitle:string};
type Mode='checking'|'sso_login'|'sso_ready'|'manual'|'blocked'|'invalid_class'|'unavailable';
const isFullClassId=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export default function AdminClassPage(){
 const id=useParams<{classId:string}>().classId;
 const [mode,setMode]=useState<Mode>('checking'),[token,setToken]=useState('');
 const [authRetry,setAuthRetry]=useState(0);
 const [allowed,setAllowed]=useState(false),[busy,setBusy]=useState(false);
 const [name,setName]=useState('Customer Trust Challenge'),[batch,setBatch]=useState(''),[date,setDate]=useState('');
 const [clientName,setClientName]=useState('PT Bank Pembangunan Daerah Sulawesi Tengah');
 const [trainingTitle,setTrainingTitle]=useState('Customer Trust Challenge');
 const [currentClient,setCurrentClient]=useState('');
 const [currentTitle,setCurrentTitle]=useState('');
 const [brandingSaved,setBrandingSaved]=useState(false);
 const [error,setError]=useState(''),[created,setCreated]=useState<NewClass|null>(null);
 const [copied,setCopied]=useState<'code'|'link'|null>(null);
 const access=mode==='sso_ready'||(mode==='manual'&&Boolean(token));
 const authHeaders=():Record<string,string>=>mode==='manual'&&token?{Authorization:'Bearer '+token}:{};
 useEffect(()=>{
  let active=true;
  setMode('checking');
  if(!isFullClassId(id)){
   setMode('invalid_class');
   return()=>{active=false};
  }
  fetch('/api/auth/staff/status?classId='+encodeURIComponent(id),{cache:'no-store'})
   .then(async r=>{
    if(r.status===400)return {invalidClass:true};
    if(!r.ok)throw Error('Login unavailable');
    return r.json();
   })
   .then(s=>{if(active)setMode(s.invalidClass?'invalid_class':
    s.authenticated?'sso_ready':s.configured?'sso_login':s.manualAllowed?'manual':'blocked')})
   .catch(()=>{if(active)setMode('unavailable')});
  return()=>{active=false};
 },[id,authRetry]);
 useEffect(()=>{
  if(!access){setAllowed(false);return;}
  let active=true;
  fetch('/api/class/'+id+'/admin',{headers:authHeaders(),cache:'no-store'})
   .then(async r=>{if(!r.ok)throw Error('Tidak memiliki hak admin');return r.json()})
   .then(x=>{
    if(active){
     setAllowed(x.canCreate===true);
     if(x.branding){
      setCurrentClient(x.branding.clientName);
      setCurrentTitle(x.branding.trainingTitle);
      setClientName(x.branding.clientName);
      setTrainingTitle(x.branding.trainingTitle);
     }
    }
   })
   .catch(()=>{if(active)setAllowed(false)});
  return()=>{active=false};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[id,mode,token,access]);
 async function save(event:FormEvent){
  event.preventDefault();
  if(!allowed)return;
  setBusy(true);setError('');setCreated(null);setCopied(null);
  try{
   const r=await fetch('/api/class/'+id+'/admin',{
    method:'POST',headers:{...authHeaders(),'Content-Type':'application/json'},
    body:JSON.stringify({name,batch,date,clientName,trainingTitle})
   });
   const x=await r.json();
   if(!r.ok)throw Error(x.error||'Gagal membuat kelas');
   setCreated(x as NewClass);
  }catch(e){setError(e instanceof Error?e.message:'Kesalahan membuat kelas');}
  finally{setBusy(false)}
 }
 async function saveExistingBranding(event:FormEvent){
  event.preventDefault();
  if(!allowed||busy)return;
  setBusy(true);setError('');setBrandingSaved(false);
  try{
   const r=await fetch('/api/class/'+id+'/admin',{
    method:'PUT',headers:{...authHeaders(),'Content-Type':'application/json'},
    body:JSON.stringify({clientName:currentClient,trainingTitle:currentTitle})
   });
   const x=await r.json();
   if(!r.ok)throw Error(x.error||'Gagal menyimpan identitas training');
   setBrandingSaved(true);
  }catch(e){setError(e instanceof Error?e.message:'Gagal menyimpan identitas training');}
  finally{setBusy(false)}
 }
 async function copyText(value:string,kind:'code'|'link'){
  try{await navigator.clipboard.writeText(value);setCopied(kind);setError('')}
  catch{setError('Tidak dapat menyalin otomatis. Silakan salin kode secara manual.')}
 }
 return <main className="trainlive-workspace tl-class-create min-h-screen pb-16">
  <header className="workspace-nav text-white"><div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 px-5 py-4">
   <a href="/" className="text-xl font-extrabold tracking-tight text-white no-underline">Train<span className="text-[#5eead4]">Live</span><span className="ml-3 border-l border-white/20 pl-3 text-xs font-medium text-slate-300">Administrator</span></a>
   <div className="flex flex-wrap gap-2"><a className="rounded-lg border border-teal-200/40 bg-teal-500/20 px-4 py-2 text-sm font-semibold text-white no-underline hover:bg-teal-500/30" href={'/host/'+id+'/lms'}>LMS Course Builder →</a><a className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white no-underline hover:bg-white/20" href={'/host/'+id}>← Kembali ke kelas</a></div>
  </div></header>
  <div className="mx-auto max-w-5xl px-5 py-7 sm:py-10">
   <section className="tl-create-hero" aria-labelledby="create-title">
    <div className="tl-create-hero-copy"><p className="tl-create-kicker">✦ CLASS MANAGEMENT / NEW BATCH</p>
     <h1 id="create-title">Buat kelas <span>training baru</span></h1>
     <p>Buat sesi baru dari materi training yang telah terpublikasi. Siap dibagikan ke peserta dalam beberapa langkah.</p>
     <span className="tl-create-hero-note">✓ Kelas baru &nbsp; ✓ Kode akses unik &nbsp; ✓ Data peserta tetap terpisah</span>
    </div>
    <div className="tl-create-hero-art" aria-hidden="true"><span className="tl-create-art-icon">✦</span><span className="tl-create-art-orbit"></span></div>
   </section>
   <div className="tl-create-flow" aria-label="Alur pembuatan kelas"><span className="is-current"><b>1</b> Isi detail kelas</span><span><b>2</b> Dapatkan kode</span><span><b>3</b> Bagikan ke peserta</span></div>
   {mode==='checking'&&<p role="status" className="mt-6">Memeriksa akses administrator…</p>}
   {mode==='invalid_class'&&<p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">Tautan kelas sumber tidak lengkap. Buka halaman ini melalui konsol kelas dengan ID lengkap, bukan kode 8 karakter.</p>}
   {mode==='unavailable'&&<div role="alert" className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-slate-800">Tidak dapat memeriksa status login. <button type="button" className="ml-2 font-bold text-teal underline" onClick={()=>setAuthRetry(n=>n+1)}>Coba lagi</button></div>}
   {mode==='blocked'&&<p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 text-amber-900">SSO/MFA belum disiapkan. Aksi admin dinonaktifkan.</p>}
   {mode==='sso_login'&&<a className="mt-5 inline-flex rounded-xl bg-teal p-4 font-bold text-white" href={'/api/auth/staff/start?classId='+encodeURIComponent(id)}>Masuk SSO + MFA</a>}
   {mode==='manual'&&<div className="mt-5 rounded-xl bg-amber-50 p-4">
    <label htmlFor="staff-token" className="field-label">Token staf — hanya staging</label>
    <input id="staff-token" type="password" className="field-input" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)}/>
   </div>}
   {access&&!allowed&&<p role="alert" className="mt-5 rounded-xl bg-amber-50 p-4 text-amber-900">Hak Super Admin belum diberikan untuk kelas sumber ini.</p>}
   {error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-red-900">{error}</p>}
   {access&&allowed&&<form className="workspace-card mt-6 space-y-4 p-5 sm:p-7" onSubmit={saveExistingBranding} aria-labelledby="branding-settings-title">
    <div><span className="workspace-eyebrow">PENGATURAN TAMPILAN</span>
     <h2 id="branding-settings-title" className="mt-2 text-xl font-extrabold">Identitas kelas saat ini</h2>
     <p className="mt-2 text-sm text-slate-600">Nama klien dan judul training kelas ini dapat diperbarui tanpa mengubah konten ataupun kelas lain.</p></div>
    <div className="tl-class-form-grid">
     <div><label htmlFor="current-client" className="field-label">Nama klien *</label>
      <input id="current-client" className="field-input" required minLength={2} maxLength={160} value={currentClient} onChange={e=>{setCurrentClient(e.target.value);setBrandingSaved(false)}}/></div>
     <div><label htmlFor="current-title" className="field-label">Judul training *</label>
      <input id="current-title" className="field-input" required minLength={3} maxLength={160} value={currentTitle} onChange={e=>{setCurrentTitle(e.target.value);setBrandingSaved(false)}}/></div>
    </div>
    <button type="submit" disabled={busy||!allowed} className="tl-staff-button">{busy?'Menyimpan…':'Simpan identitas kelas'}</button>
    {brandingSaved&&<p role="status" className="text-sm font-semibold text-teal">Tersimpan. Tampilan peserta diperbarui otomatis.</p>}
   </form>}
   <div className="tl-create-layout"><div className="min-w-0">
   <form className="workspace-card tl-create-form p-5 sm:p-8" onSubmit={save}>
    <div className="tl-class-form-header"><span className="number">01</span><div><h2>Informasi kelas</h2><p>Lengkapi detail batch dan tanggal pelaksanaan.</p></div></div>
    <div className="tl-class-form-grid">
    <div className="tl-class-form-wide"><label htmlFor="name" className="field-label">Nama kelas *</label><input id="name" className="field-input" required minLength={3} maxLength={160} value={name} onChange={e=>setName(e.target.value)}/></div>
    <div><label htmlFor="clientName" className="field-label">Nama klien *</label>
     <input id="clientName" className="field-input" required minLength={2} maxLength={160} value={clientName} onChange={e=>setClientName(e.target.value)} placeholder="Contoh: PT Bank ABC"/></div>
    <div><label htmlFor="trainingTitle" className="field-label">Judul training *</label>
     <input id="trainingTitle" className="field-input" required minLength={3} maxLength={160} value={trainingTitle} onChange={e=>setTrainingTitle(e.target.value)} placeholder="Contoh: Customer Experience Masterclass"/></div>
    <div><label htmlFor="batch" className="field-label">Kode batch *</label><input id="batch" className="field-input" required maxLength={32} pattern="[A-Za-z0-9_-]{1,32}" placeholder="BATCH-02" value={batch} onChange={e=>setBatch(e.target.value)}/></div>
    <div><label htmlFor="date" className="field-label">Tanggal kelas (WITA) *</label><input id="date" type="date" className="field-input" required value={date} onChange={e=>setDate(e.target.value)}/></div>
    <p className="tl-class-form-hint tl-class-form-wide">Jadwal 09.00–16.00 WITA. Kode peserta berlaku dari satu hari sebelum hingga satu hari setelah kelas.</p>
    <div className="tl-class-form-wide"><button disabled={!allowed||busy} className="tl-staff-button">{busy?'Menyimpan…':'Buat kelas dan kode peserta →'}</button></div>
    </div>
   </form>
   {created&&<section aria-live="polite" className="tl-create-success mt-6" aria-labelledby="create-success-title">
    <div className="tl-create-success-head"><span className="tl-create-success-check" aria-hidden="true">✓</span><div><p className="tl-create-kicker">CLASS READY</p><h2 id="create-success-title">Kelas berhasil dibuat!</h2></div></div>
    <p className="mt-4 text-sm font-bold text-teal">{created.trainingTitle} · {created.clientName}</p>
    <p className="mt-4 text-sm text-[#506d7a]">{created.name} · Batch {created.batch} · {created.date}</p>
    <div className="tl-create-code-area"><span>KODE AKSES PESERTA</span><strong className="font-mono" aria-label={'Kode peserta '+created.joinCode}>{created.joinCode}</strong>
     <button type="button" className="tl-create-copy" onClick={()=>void copyText(created.joinCode,'code')}>{copied==='code'?'✓ Kode tersalin':'Salin kode'}</button></div>
    <p className="mt-4 text-sm leading-relaxed text-[#577384]">Kapasitas {created.capacity} peserta. Kelas baru tidak membawa data peserta, jawaban, atau skor dari kelas sumber.</p>
    <div className="tl-create-success-actions"><a className="tl-staff-button" href={'/host/'+created.classId}>Buka konsol kelas <span aria-hidden="true">→</span></a>
     <button type="button" className="tl-staff-button tl-staff-button-secondary" onClick={()=>void copyText(window.location.origin+'/?code='+encodeURIComponent(created.joinCode),'link')}>{copied==='link'?'✓ Tautan tersalin':'Salin tautan peserta'}</button></div>
   </section>}
   </div>
   <aside className="tl-create-help" aria-label="Informasi pembuatan kelas">
    <div className="tl-create-help-icon" aria-hidden="true">✧</div><h2>Siap untuk sesi berikutnya?</h2><p>Materi yang sudah dipublikasikan di kelas sumber akan tersedia pada kelas baru.</p>
    <div className="tl-create-help-divider"></div>
    <h3>Yang ikut disalin</h3><p>Aktivitas dan materi terpublikasi, termasuk kuis serta polling yang tersedia.</p>
    <h3>Yang tetap terpisah</h3><p>Daftar peserta, respons, skor, dan riwayat aktivitas dari kelas sebelumnya.</p>
    <div className="tl-create-help-footer"><span aria-hidden="true">◷</span><span>09.00–16.00 WITA<br/>Kode berlaku H-1 sampai H+1</span></div>
   </aside></div>
  </div>
 </main>;
}
