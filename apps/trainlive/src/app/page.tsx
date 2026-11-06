'use client';
import { useEffect, useState, type FormEvent } from 'react';

const features = [
 { number: '01', title: 'Polling langsung', description: 'Bagikan pendapat Anda dan lihat hasil sesi secara interaktif.', icon: 'poll' },
 { number: '02', title: 'Kuis & studi kasus', description: 'Latih keputusan terbaik melalui tantangan yang relevan.', icon: 'quiz' },
 { number: '03', title: 'Skor & refleksi', description: 'Pantau progres, pahami pembahasan, dan catat pembelajaran.', icon: 'score' },
] as const;

function FeatureIcon({ icon }: { icon: 'poll' | 'quiz' | 'score' }) {
 if (icon === 'poll') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 20V11m5 9V5m5 15v-8m5 8V8" strokeLinecap="round"/><path d="M2 20h20" strokeLinecap="round"/></svg>;
 if (icon === 'quiz') return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 9h8m-8 4h4m-4 4h7" strokeLinecap="round"/></svg>;
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

export default function JoinPage() {
 const [code, setCode] = useState('');
 const [name, setName] = useState('');
 const [unit, setUnit] = useState('');
 const [email, setEmail] = useState('');
 const [consent, setConsent] = useState(false);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [readiness, setReadiness] = useState<'checking' | 'ready' | 'offline'>('checking');

 useEffect(() => {
  const queryCode = new URLSearchParams(window.location.search).get('code');
  if (queryCode) setCode(queryCode.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6));
 }, []);
 useEffect(() => {
  let mounted = true;
  fetch('/api/health', { cache: 'no-store' })
   .then(response => { if (mounted) setReadiness(response.ok ? 'ready' : 'offline'); })
   .catch(() => { if (mounted) setReadiness('offline'); });
  return () => { mounted = false; };
 }, []);

 async function submit(event: FormEvent) {
  event.preventDefault();
  if (readiness !== 'ready' || busy) return;
  setError('');
  setBusy(true);
  try {
   const response = await fetch('/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, displayName: name, unit, email, consent })
   });
   const data = await response.json();
   if (!response.ok) throw Error(data.error || 'Kode tidak dapat digunakan pada jendela kelas.');
   window.location.assign('/class/' + data.classId);
  } catch (cause) {
   setError(cause instanceof Error ? cause.message : 'Gagal bergabung');
   setBusy(false);
  }
 }

 return <main className="trainlive-landing min-h-screen">
  <div className="trainlive-stage">
   <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8 lg:py-8">
    <a href="/" className="inline-flex items-center gap-3 rounded-lg text-white no-underline" aria-label="TrainLive — beranda">
     <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2dd4bf] text-[#08283c] shadow-lg shadow-teal-950/20">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-6 w-6" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" strokeLinejoin="round"/><path d="M4 6v12" strokeLinecap="round"/></svg>
     </span>
     <span className="text-2xl font-extrabold tracking-[-.05em]">Train<span className="text-[#5eead4]">Live</span></span>
    </a>
    <nav className="flex items-center gap-3 sm:gap-7" aria-label="Navigasi utama">
     <span className="hidden text-[11px] font-bold uppercase tracking-[.19em] text-[#c6d8e4] md:inline">Customer Trust Challenge</span>
     <a href="/admin/login" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white no-underline transition hover:border-white/60 hover:bg-white/20">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true"><path d="M10 17l5-5-5-5m5 5H3m10-9h5a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      Login Admin
     </a>
    </nav>
   </header>

   <div className="trainlive-orb trainlive-orb-one" aria-hidden="true"/>
   <div className="trainlive-orb trainlive-orb-two" aria-hidden="true"/>

   <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-10 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_440px] lg:items-center lg:gap-16 lg:pb-28 lg:pt-16">
    <section className="max-w-2xl text-white">
     <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#5eead4]/30 bg-[#5eead4]/10 px-4 py-2 text-xs font-bold tracking-[.04em] text-[#a7f3d0] sm:text-sm">
      <span className="h-2 w-2 rounded-full bg-[#5eead4] shadow-[0_0_0_4px_rgba(94,234,212,.13)]" aria-hidden="true"/>
      Platform pembelajaran interaktif
     </div>
     <h1 className="max-w-[680px] text-[clamp(2.5rem,5vw,4.25rem)] font-extrabold leading-[1.09] tracking-[-.055em]">
      Setiap keputusan membangun <span className="text-[#5eead4]">kepercayaan.</span>
     </h1>
     <p className="mt-6 max-w-[580px] text-base leading-8 text-[#c8d7e4] sm:text-lg">
      Belajar lebih aktif lewat polling, kuis berbasis kasus, dan refleksi pribadi. Ikuti setiap sesi langsung dari perangkat Anda, tanpa instalasi aplikasi.
     </p>
     <div className="mt-9 flex flex-wrap items-center gap-4">
      <a href="#join-class" className="inline-flex min-h-12 items-center gap-3 rounded-xl bg-[#5eead4] px-6 font-bold text-[#073047] no-underline shadow-[0_12px_30px_rgba(45,212,191,.16)] transition hover:bg-[#99f6e4]">
       Mulai bergabung <span aria-hidden="true">↗</span>
      </a>
      <span className="inline-flex items-center gap-2 text-sm text-[#c8d7e4]">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-[#5eead4]" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2" strokeLinecap="round"/></svg>
       Mudah diakses lewat ponsel
      </span>
     </div>
     <div className="mt-14 grid max-w-xl grid-cols-3 gap-3 border-t border-white/15 pt-7">
      <div><div className="text-xl font-extrabold text-white sm:text-2xl">01<span className="text-[#5eead4]">.</span></div><p className="mt-1 text-xs leading-5 text-[#c6d8e4] sm:text-sm">Bergabung</p></div>
      <div><div className="text-xl font-extrabold text-white sm:text-2xl">02<span className="text-[#5eead4]">.</span></div><p className="mt-1 text-xs leading-5 text-[#c6d8e4] sm:text-sm">Berpartisipasi</p></div>
      <div><div className="text-xl font-extrabold text-white sm:text-2xl">03<span className="text-[#5eead4]">.</span></div><p className="mt-1 text-xs leading-5 text-[#c6d8e4] sm:text-sm">Berkembang</p></div>
     </div>
    </section>

    <section id="join-class" aria-labelledby="join-title" className="relative scroll-mt-6 overflow-hidden rounded-[26px] border border-white/75 bg-white p-6 shadow-[0_28px_75px_rgba(1,20,40,.32)] sm:p-8">
     <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#14b8a6] via-[#5eead4] to-[#d5a74f]" aria-hidden="true"/>
     <div className="flex items-start justify-between gap-4">
      <div>
       <span className="text-[11px] font-extrabold uppercase tracking-[.18em] text-[#0f766e]">Ruang peserta</span>
       <h2 id="join-title" className="mt-2 text-[28px] font-extrabold tracking-[-.035em] text-[#0c253b] sm:text-[32px]">Masuk ke kelas</h2>
       <p className="mt-2 text-sm leading-6 text-slate-500">Masukkan kode yang dibagikan fasilitator.</p>
      </div>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e9f9f6] text-[#0f766e]" aria-hidden="true">
       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 10h8m-8 4h5" strokeLinecap="round"/></svg>
      </span>
     </div>
     <div className={`mt-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-6 ${readiness === 'ready' ? 'border-[#b7e7d8] bg-[#edfaf5] text-[#16654f]' : 'border-[#f1dfb2] bg-[#fff9ea] text-[#855b16]'}`} role="status" aria-live="polite">
      <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${readiness === 'ready' ? 'bg-[#169b75]' : 'bg-[#d59b30]'}`} aria-hidden="true"/>
      <span>{readiness === 'checking' ? 'Memeriksa kesiapan sistem…' : readiness === 'ready' ? 'Sistem siap. Silakan masukkan kode kelas Anda.' : 'Sistem sedang dalam persiapan. Pendaftaran peserta belum dibuka.'}</span>
     </div>
     <form className="mt-6 space-y-4" onSubmit={submit}>
      <div><label htmlFor="join-code" className="field-label">Kode kelas <span className="text-[#0f766e]">*</span></label>
       <input id="join-code" className="field-input font-mono text-lg font-bold uppercase tracking-[.25em]" maxLength={6} required autoComplete="off" value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} placeholder="ABC234" aria-describedby="code-hint"/>
       <p id="code-hint" className="mt-1.5 text-xs text-slate-500">6 karakter dari fasilitator training</p>
      </div>
      <div><label htmlFor="display-name" className="field-label">Nama panggilan <span className="text-[#0f766e]">*</span></label>
       <input id="display-name" className="field-input" required minLength={2} maxLength={100} autoComplete="nickname" value={name} onChange={event => setName(event.target.value)} placeholder="Nama yang tampil di papan skor"/>
      </div>
      <div><label htmlFor="unit-name" className="field-label">Unit / Cabang <span className="text-[#0f766e]">*</span></label>
       <input id="unit-name" className="field-input" required minLength={2} maxLength={100} value={unit} onChange={event => setUnit(event.target.value)} placeholder="Contoh: Cabang Palu"/>
      </div>
      <div><label htmlFor="email" className="field-label">Email <span className="font-normal text-slate-400">(opsional)</span></label>
       <input id="email" type="email" className="field-input" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="nama@institusi.co.id"/>
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-[#f6f9fb] p-3 text-xs leading-5 text-slate-600">
       <input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#0d817c]"/>
       <span>Saya menyetujui pemrosesan nama panggilan, unit, jawaban, skor, dan kehadiran untuk pelaksanaan serta evaluasi training sesuai kebijakan pelindungan data.</span>
      </label>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{error}</p>}
      <button type="submit" disabled={busy || readiness !== 'ready' || !consent || code.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0f766e] px-5 py-3.5 font-bold text-white transition hover:bg-[#0b5f59] disabled:hover:bg-[#0f766e]">
       {busy ? 'Memproses…' : 'Gabung Kelas'} <span aria-hidden="true">→</span>
      </button>
      <p className="text-center text-[11px] leading-5 text-slate-500">Jangan masukkan data nasabah, nomor rekening, NIK, atau informasi rahasia bank.</p>
     </form>
    </section>
   </div>
  </div>

  <section aria-labelledby="activities-title" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
   <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
    <div><span className="text-xs font-bold uppercase tracking-[.18em] text-[#0f766e]">Pengalaman belajar</span><h2 id="activities-title" className="mt-3 text-2xl font-extrabold tracking-tight text-[#0c253b] sm:text-3xl">Belajar aktif, bukan sekadar menyimak.</h2></div>
    <p className="max-w-xs text-sm leading-6 text-slate-500">Seluruh aktivitas berjalan sesuai arahan fasilitator dan progres sesi.</p>
   </div>
   <div className="grid gap-5 md:grid-cols-3">
    {features.map(feature => <article key={feature.number} className="trainlive-feature rounded-2xl border border-[#e1e9ed] bg-white p-6">
     <div className="flex items-center justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e6f6f2] p-3 text-[#0f766e]"><FeatureIcon icon={feature.icon}/></span><span className="text-sm font-bold text-[#9eb2bd]">{feature.number} / 03</span></div>
     <h3 className="mt-6 text-lg font-extrabold text-[#0c253b]">{feature.title}</h3><p className="mt-2 text-sm leading-7 text-slate-600">{feature.description}</p>
    </article>)}
   </div>
  </section>
  <footer className="border-t border-[#e0e8ed] bg-white px-5 py-6 text-center text-xs leading-6 text-slate-500 sm:text-sm">
   TrainLive · Customer Trust Challenge · PT Bank Pembangunan Daerah Sulawesi Tengah
  </footer>
 </main>;
}
