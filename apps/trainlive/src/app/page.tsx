'use client';
import { useEffect,useState,type FormEvent } from 'react';

export default function JoinPage(){
 const [code,setCode]=useState(''),[name,setName]=useState(''),[unit,setUnit]=useState(''),
 [email,setEmail]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),
 [error,setError]=useState('');
 const [readiness,setReadiness]=useState<'checking'|'ready'|'offline'>('checking');
 useEffect(()=>{const q=new URLSearchParams(window.location.search).get('code');if(q)setCode(q.toUpperCase().slice(0,6));},[]);
 useEffect(()=>{
  let mounted=true;
  fetch('/api/health',{cache:'no-store'}).then(r=>{if(mounted)setReadiness(r.ok?'ready':'offline')})
   .catch(()=>{if(mounted)setReadiness('offline')});
  return()=>{mounted=false};
 },[]);
 async function submit(e:FormEvent){
  e.preventDefault();setError('');setBusy(true);
  try{
   const res=await fetch('/api/join',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({code,displayName:name,unit,email,consent})});
   const json=await res.json();
   if(!res.ok)throw Error(json.error||'Kode tidak dapat digunakan pada jendela kelas.');
   window.location.assign('/class/'+json.classId);
  }catch(e){setError(e instanceof Error?e.message:'Gagal bergabung');setBusy(false);}
 }
 return <main className="min-h-screen">
  <header className="bg-navy text-white"><div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
   <div className="text-xl font-extrabold tracking-tight">Train<span className="text-[#55d3c2]">Live</span></div>
   <nav className="flex items-center gap-4"><span className="hidden text-xs font-semibold tracking-wider text-slate-200 sm:inline">CUSTOMER TRUST CHALLENGE</span><a href="/admin/login" className="rounded-lg border border-white/50 px-3 py-2 text-xs font-bold text-white hover:bg-white/10">Login Admin</a></nav>
  </div></header>
  <div className="mx-auto grid max-w-5xl gap-10 px-5 pb-20 pt-12 md:grid-cols-[1fr_420px] md:pt-20">
   <section className="max-w-xl">
    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#b5cfc8] bg-[#eaf6f1] px-4 py-2 text-sm font-bold text-teal">
     <span className="h-2 w-2 rounded-full bg-teal" aria-hidden="true"/> Pelatihan interaktif individual
    </div>
    <h1 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">Bangun kepercayaan nasabah melalui keputusan yang tepat.</h1>
    <p className="mb-6 max-w-lg text-lg leading-relaxed text-slate-600">Jawab polling, tantangan kasus, dan lembar kerja dari ponsel Anda. Tidak perlu menginstal aplikasi atau membentuk kelompok.</p>
    <div className="grid gap-3 sm:grid-cols-2">
     <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="font-bold text-teal">01 / Partisipasi</div><p className="mt-2 text-sm text-slate-600">Ikuti kuis saat fasilitator membukanya.</p></div>
     <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="font-bold text-gold">02 / Pembelajaran</div><p className="mt-2 text-sm text-slate-600">Lihat pembahasan, poin, dan refleksi pribadi.</p></div>
    </div>
   </section>
   <section aria-labelledby="join-title" className="shadow-card rounded-2xl border border-slate-200 bg-white p-6 md:p-8">
    <h2 id="join-title" className="text-2xl font-extrabold">Masuk ke kelas</h2>
    <p className="mt-2 text-slate-600">Gunakan kode enam karakter dari fasilitator.</p>
    {readiness!=='ready'&&<p role="status" className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
     {readiness==='checking'?'Memeriksa kesiapan sistem…':'Sistem sedang dalam persiapan. Pendaftaran peserta belum dibuka.'}
    </p>}
    <form className="mt-6 space-y-4" onSubmit={submit}>
     <div><label htmlFor="join-code" className="field-label">Kode kelas *</label>
      <input id="join-code" className="field-input font-mono text-xl font-bold tracking-[.25em]" maxLength={6} required
       autoComplete="off" value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g,''))} placeholder="ABC234"/></div>
     <div><label htmlFor="display-name" className="field-label">Nama panggilan *</label>
      <input id="display-name" className="field-input" required minLength={2} maxLength={100}
       value={name} onChange={e=>setName(e.target.value)} placeholder="Nama yang tampil di skor"/></div>
     <div><label htmlFor="unit-name" className="field-label">Unit / Cabang *</label>
      <input id="unit-name" className="field-input" required minLength={2} maxLength={100}
       value={unit} onChange={e=>setUnit(e.target.value)} placeholder="Contoh: Cabang Palu"/></div>
     <div><label htmlFor="email" className="field-label">Email (opsional)</label>
      <input id="email" type="email" className="field-input" value={email} onChange={e=>setEmail(e.target.value)}
       placeholder="nama@institusi.co.id"/></div>
     <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-slate-700">
      <input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}
       className="mt-1 h-5 w-5 shrink-0 accent-[#0D6E6D]"/>
      <span>Saya menyetujui pemrosesan nama panggilan, unit, jawaban, skor, dan kehadiran untuk pelaksanaan serta evaluasi training sesuai kebijakan pelindungan data.</span>
     </label>
     {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800">{error}</p>}
     <button disabled={busy||readiness!=='ready'||!consent||code.length!==6} type="submit"
      className="w-full rounded-xl bg-teal px-5 py-3 font-bold text-white hover:bg-[#095755]">
      {busy?'Memproses…':'Gabung Kelas'}</button>
     <p className="text-xs leading-relaxed text-slate-500">Jangan masukkan nama nasabah, nomor rekening, NIK, atau data rahasia bank di kolom jawaban.</p>
    </form>
   </section>
  </div>
  <footer className="border-t border-slate-200 px-5 py-6 text-center text-sm text-slate-500">
   TrainLive · Customer Trust Challenge · PT Bank Pembangunan Daerah Sulawesi Tengah
  </footer>
 </main>;
}
