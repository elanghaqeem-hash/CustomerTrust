'use client';
import {useParams} from 'next/navigation';
import { useEffect,useState } from 'react';
type Item={id:string;item_key:string;state:string;type:string;module_no:number;slide_ref:number|null;payload:{title?:string;prompt?:string}};
type Score={participant_id:string;display_name:string;unit:string;points:number;rank_no:number};
type ChatMessage={id:string;body:string;display_name:string;hidden:boolean;read_aloud:boolean;created_at:string};
type LoginMode='checking'|'sso_login'|'sso_ready'|'manual'|'blocked'|'invalid_class'|'unavailable';
const isFullClassId=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export default function HostPage(){
 const id=useParams<{classId:string}>().classId;
 const [token,setToken]=useState(''),[items,setItems]=useState<Item[]>([]),[score,setScore]=useState<Score[]>([]);
 const [messages,setMessages]=useState<ChatMessage[]>([]);
 const [classStatus,setClassStatus]=useState<'scheduled'|'live'|'closed'|'archived'|null>(null);
 const [role,setRole]=useState<'facilitator'|'cohost'|'observer'|null>(null);
 const [canCreateClass,setCanCreateClass]=useState(false);
 const canManage=Boolean(role&&role!=='observer');
 const [active,setActive]=useState<string|null>(null),[selectedItem,setSelectedItem]=useState<string|null>(null);
 const [search,setSearch]=useState(''),[filter,setFilter]=useState<'all'|'idle'|'open'|'finished'>('all');
 const [results,setResults]=useState<{answered:number;joined:number;counts:{choice:string;count:number}[]}|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [loginMode,setLoginMode]=useState<LoginMode>('checking');
 const [authRetry,setAuthRetry]=useState(0);
 const access=loginMode==='sso_ready'||(loginMode==='manual'&&Boolean(token));
 const authHeaders=():Record<string,string>=>loginMode==='manual'&&token
  ?{Authorization:'Bearer '+token}:{};
 useEffect(()=>{
  if(!access){setCanCreateClass(false);return}
  let mounted=true;
  fetch('/api/class/'+id+'/admin',{headers:authHeaders(),cache:'no-store'})
   .then(async r=>r.ok?await r.json():{canCreate:false})
   .then(s=>{if(mounted)setCanCreateClass(s.canCreate===true)})
   .catch(()=>{if(mounted)setCanCreateClass(false)});
  return()=>{mounted=false};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[access,token,id,loginMode]);
 useEffect(()=>{
  let mounted=true;
  setLoginMode('checking');
  if(!isFullClassId(id)){
   setLoginMode('invalid_class');
   return()=>{mounted=false};
  }
  fetch('/api/auth/staff/status?classId='+encodeURIComponent(id),{cache:'no-store'})
   .then(async r=>{
    if(r.status===400)return {invalidClass:true};
    if(!r.ok)throw Error('status unavailable');
    return r.json();
   })
   .then(s=>{if(mounted)setLoginMode(s.invalidClass?'invalid_class':
    s.authenticated?'sso_ready':s.configured?'sso_login':s.manualAllowed?'manual':'blocked')})
   .catch(()=>{if(mounted)setLoginMode('unavailable')});
  return()=>{mounted=false};
 },[id,authRetry]);
 async function logout(){
  await fetch('/api/auth/staff/logout',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({classId:id})}).catch(()=>{});
  window.location.assign('/host/'+id);
 }
 async function refresh(){
  if(!access)return;
  try{
   const headers=authHeaders();
   const [a,b,chat,capabilities,lifecycle]=await Promise.all([fetch('/api/class/'+id+'/items',{headers,cache:'no-store'}),
    fetch('/api/class/'+id+'/leaderboard',{headers,cache:'no-store'}),
    fetch('/api/class/'+id+'/chat',{headers,cache:'no-store'}),
    fetch('/api/class/'+id+'/capabilities',{headers,cache:'no-store'}),
    fetch('/api/class/'+id+'/lifecycle',{headers,cache:'no-store'})]);
   if(lifecycle.ok)setClassStatus((await lifecycle.json()).status);
   else setClassStatus(null);
   if(capabilities.ok)setRole((await capabilities.json()).role);
   else setRole(null);
   if(!a.ok)throw Error('Token staf ditolak atau tidak ditugaskan pada kelas ini.');
   const ia=await a.json(),lb=b.ok?await b.json():{top:[]};
   setItems(ia.items);setScore(lb.top||[]);setError('');
   if(chat.ok)setMessages((await chat.json()).messages||[]);
   const all=ia.items as Item[];
   const inspected=all.find(x=>x.id===selectedItem) || all.find(x=>x.state==='open') ||
    [...all].reverse().find(x=>x.state==='closed'||x.state==='revealed');
   setActive(inspected?.id||null);
   if(inspected){
    const res=await fetch('/api/class/'+id+'/results?itemId='+inspected.id,{headers,cache:'no-store'});
    setResults(res.ok?await res.json():null);
   }else setResults(null);
  }catch(e){setError(e instanceof Error?e.message:'Gagal mengambil data');}
 }
 useEffect(()=>{
  if(!access)return;
  void refresh();
  const interval=setInterval(()=>void refresh(),3000);
  return()=>clearInterval(interval);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[token,id,access,selectedItem]);
 async function changeClass(action:'start'|'close'){
  if(!access||!canManage)return;
  if(action==='close'&&!window.confirm('Tutup kelas secara permanen? Setelah ditutup, aktivitas tidak bisa dibuka lagi.'))return;
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/class/'+id+'/lifecycle',{method:'POST',
    headers:{...authHeaders(),'Content-Type':'application/json'},
    body:JSON.stringify({action})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Gagal mengubah status kelas');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Gagal memperbarui kelas')}
  finally{setBusy(false)}
 }
 async function act(itemId:string,action:'open'|'close'|'reveal'){
  if(!access||!canManage)return;setBusy(true);
  try{
   const res=await fetch('/api/class/'+id+'/action',{method:'POST',
    headers:{...authHeaders(),'Content-Type':'application/json'},
    body:JSON.stringify({itemId,action})});
   const j=await res.json();if(!res.ok)throw Error(j.error||'Gagal mengubah status');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Gagal menyimpan');}
  finally{setBusy(false)}
 }
 async function moderate(messageId:string,action:'read_aloud'|'hide'|'unhide'){
  if(!access||!canManage)return;setBusy(true);setError('');
  try{
   const r=await fetch('/api/class/'+id+'/chat',{method:'POST',
    headers:{...authHeaders(),'Content-Type':'application/json'},
    body:JSON.stringify({messageId,action})});
   const j=await r.json();if(!r.ok)throw Error(j.error||'Moderasi gagal');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Moderasi gagal')}
  finally{setBusy(false)}
 }
 return <main className="trainlive-workspace trainlive-console facilitator-console min-h-screen pb-16">
  <header className="workspace-nav facilitator-nav text-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
   <a href="/" aria-label="TrainLive — Beranda" className="flex items-center gap-3 text-white no-underline">
    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#5eead4] text-[#08263b]">
     <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" strokeLinejoin="round"/><path d="M4 6v12" strokeLinecap="round"/></svg>
    </span><span className="text-xl font-extrabold tracking-[-.04em]">Train<span className="text-[#5eead4]">Live</span></span>
    <span className="hidden border-l border-white/20 pl-3 text-xs font-medium text-slate-300 sm:inline">Workspace Fasilitator</span>
   </a><span className="facilitator-class-id">Kelas {id.slice(0,8)}</span>
  </div></header>
  <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
   <section className="facilitator-hero">
    <div className="facilitator-hero-body">
     <span className="facilitator-hero-eyebrow"><span className="facilitator-hero-spark" aria-hidden="true">✦</span> LIVE CLASS CONTROL</span>
     <h1>Konsol <span>fasilitator.</span></h1>
     <p>Semua kendali sesi training dalam satu tempat. Buka aktivitas, pantau jawaban, dan kelola interaksi peserta secara langsung.</p>
     <div className="facilitator-hero-meta">
      <span className="facilitator-hero-live"><span aria-hidden="true" className={'facilitator-dot '+(classStatus==='live'?'is-live':'')}></span>{classStatus==='live'?'Kelas sedang berlangsung':classStatus==='scheduled'?'Kelas siap dimulai':classStatus==='closed'?'Kelas telah selesai':classStatus==='archived'?'Kelas diarsipkan':'Menunggu koneksi kelas'}</span>
      <span className="facilitator-hero-role">{role==='observer'?'Akses observer':role==='cohost'?'Co-host':role==='facilitator'?'Fasilitator':'Akses staf'}</span>
     </div>
    </div>
    <div className="facilitator-hero-art" aria-hidden="true"><div className="facilitator-hero-orbit"></div><div className="facilitator-hero-orbit small"></div><div className="facilitator-hero-glyph"><svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M8 9h3m-3 4h7m-1-4h3"/></svg></div></div>
   </section>
   <nav aria-label="Menu fasilitator" className="facilitator-navigation">
    <a aria-current="page" href={'/host/'+id} className="facilitator-navigation-link is-current"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>Konsol kelas</a>
    <a href={'/host/'+id+'/report'} className="facilitator-navigation-link"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4v16h16M8 15l4-4 3 2 4-6"/></svg>Laporan & ekspor</a>
   </nav>
   {loginMode==='checking'&&<p role="status" className="mb-6 rounded-xl bg-white p-4">Memeriksa akses fasilitator…</p>}
   {loginMode==='invalid_class'&&<section role="alert" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
    <h2 className="text-lg font-extrabold">Tautan kelas tidak lengkap</h2>
    <p className="mt-2 text-sm leading-relaxed">Gunakan tautan fasilitator dengan ID kelas lengkap (36 karakter). Kode 8 karakter yang ditampilkan pada header hanya ringkasan, bukan alamat kelas.</p>
    <a href="/" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-bold text-amber-950">Kembali ke beranda TrainLive</a>
   </section>}
   {loginMode==='unavailable'&&<section role="alert" className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 text-[#12384d]">
    <h2 className="text-lg font-extrabold">Status login belum dapat diperiksa</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">Koneksi ke layanan autentikasi terganggu atau sementara tidak tersedia. Status ini tidak berarti SSO belum dikonfigurasi.</p>
    <button type="button" className="mt-4 rounded-xl bg-teal px-5 py-3 text-sm font-bold text-white" onClick={()=>setAuthRetry(n=>n+1)}>Coba periksa kembali</button>
   </section>}
   {loginMode==='blocked'&&<section role="alert" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
    <h2 className="text-lg font-extrabold">SSO/MFA fasilitator belum aktif</h2>
    <p className="mt-2 text-sm leading-relaxed">Akses staf belum tersedia di lingkungan deployment ini. Administrator perlu memeriksa konfigurasi penyedia identitas, variabel Vercel untuk lingkungan yang digunakan, dan deployment terbaru. Login tanpa MFA tetap dinonaktifkan.</p>
    <a className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-bold text-amber-950" href="/admin/login">Lihat halaman login administrator</a>
   </section>}
   {loginMode==='sso_login'&&<a href={'/api/auth/staff/start?classId='+encodeURIComponent(id)}
    className="mb-6 inline-flex rounded-xl bg-teal px-5 py-3 font-bold text-white">
    Masuk sebagai fasilitator (SSO + MFA)</a>}
   {loginMode==='sso_ready'&&<div className="facilitator-auth-strip mb-5 flex flex-wrap items-center justify-between gap-3">
    <span className="facilitator-auth-label"><span className="facilitator-auth-icon" aria-hidden="true">✓</span><span><strong>SSO / MFA terverifikasi</strong><small>Sesi staf Anda aman dan aktif</small></span></span>
    <button type="button" className="facilitator-logout" onClick={()=>void logout()}>Keluar <span aria-hidden="true">↗</span></button>
   </div>}
   {loginMode==='manual'&&<div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
    <p className="mb-3 text-sm font-semibold text-amber-900">Token sementara hanya untuk pengujian non-produksi.</p>
    <label className="field-label" htmlFor="staff-token">Token staf kelas (staging)</label>
    <div className="flex flex-wrap gap-2">
     <input id="staff-token" type="password" autoComplete="off" className="field-input max-w-2xl"
      value={token} onChange={e=>setToken(e.target.value)} placeholder="Token JWT khusus kelas"/>
     <button className="rounded-xl bg-teal px-5 font-bold text-white" onClick={()=>void refresh()}>Hubungkan</button>
    </div>
   </div>}
   {canCreateClass&&<a href={'/host/'+id+'/admin'} className="facilitator-create-link"><span className="facilitator-create-plus" aria-hidden="true">＋</span><span>Buat kelas baru</span><span className="facilitator-create-subtitle">Admin</span><span aria-hidden="true">↗</span></a>}
   {role&&<p role="status" className="facilitator-role-note">Peran kelas: <strong>{role==='observer'?'Observer (hanya melihat dan mengunduh laporan)':role==='cohost'?'Co-host':'Fasilitator'}</strong></p>}
   {error&&<p role="alert" className="mb-6 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
   {classStatus&&<section className="facilitator-status-card" aria-label="Status kelas saat ini">
    <div className="facilitator-status-content"><span className="facilitator-section-eyebrow">STATUS SESI</span>
     <div className="facilitator-status-title">Kelas <span className={'facilitator-status-pill status-'+classStatus}>{classStatus==='scheduled'?'Terjadwal':classStatus==='live'?'Berlangsung':classStatus==='closed'?'Selesai':'Diarsipkan'}</span></div>
     <p>{classStatus==='scheduled'?'Kelas belum dimulai. Aktifkan sesi untuk membuka aktivitas.':classStatus==='live'?'Sesi aktif. Anda dapat menjalankan aktivitas dan memantau respons peserta.':'Kelas sudah selesai. Aktivitas tidak dapat dibuka kembali.'}</p>
    </div>
    {classStatus==='scheduled'&&<button disabled={!canManage||busy} type="button" onClick={()=>void changeClass('start')}
      className="facilitator-primary-button">Mulai kelas <span aria-hidden="true">→</span></button>}
    {classStatus==='live'&&<button disabled={!canManage||busy} type="button" onClick={()=>void changeClass('close')}
      className="facilitator-danger-button">Tutup kelas <span aria-hidden="true">→</span></button>}
   </section>}
   <div className="facilitator-stats" aria-label="Ringkasan kelas">
    <div className="facilitator-stat"><span className="facilitator-stat-icon" aria-hidden="true">▦</span><span><small>Aktivitas</small><strong>{access?items.length:'—'}</strong></span></div>
    <div className="facilitator-stat"><span className="facilitator-stat-icon" aria-hidden="true">◉</span><span><small>Sedang dibuka</small><strong>{access?items.filter(i=>i.state==='open').length:'—'}</strong></span></div>
    <div className="facilitator-stat"><span className="facilitator-stat-icon" aria-hidden="true">◈</span><span><small>Pesan peserta</small><strong>{access?messages.length:'—'}</strong></span></div>
   </div>
   <div className="facilitator-content-grid">
    <section aria-label="Rundown aktivitas"><div className="facilitator-section-heading"><div><span className="facilitator-section-eyebrow">KELOLA AKTIVITAS</span><h2>Rundown interaktif</h2></div><span className="facilitator-count-tag">{items.length} aktivitas</span></div>
     <div className="facilitator-filter-panel">
      <label className="flex-1"><span className="field-label">Cari aktivitas</span>
       <input className="field-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Judul, kode, modul…"/></label>
      <label><span className="field-label">Status</span><select className="field-input" value={filter}
       onChange={e=>setFilter(e.target.value as typeof filter)}>
       <option value="all">Semua ({items.length})</option><option value="idle">Belum dibuka</option>
       <option value="open">Sedang dibuka</option><option value="finished">Selesai</option>
      </select></label>
     </div>
     <div className="facilitator-items-list">{items.filter(i=>
      (filter==='all'||(filter==='finished'?['closed','revealed'].includes(i.state):i.state===filter))&&
      [i.item_key,i.payload.title||'',i.payload.prompt||'',String(i.module_no)].join(' ').toLowerCase().includes(search.toLowerCase().trim())
     ).map(i=><article key={i.id} className={'facilitator-item '+(active===i.id?'is-selected':'')}>
      <div className="facilitator-item-meta">
       <span className="facilitator-item-module">MODUL {i.module_no} <span aria-hidden="true">·</span> SLIDE {i.slide_ref??'—'}</span>
       <span className={'facilitator-item-state state-'+i.state}><span className="facilitator-state-dot" aria-hidden="true"></span>{i.state==='idle'?'Belum dibuka':i.state==='open'?'Sedang dibuka':i.state==='closed'?'Ditutup':'Dibahas'}</span>
      </div>
      <h3>{i.payload.title||i.item_key}</h3>
      {i.payload.prompt&&<p className="facilitator-item-prompt">{i.payload.prompt}</p>}
      <div className="facilitator-item-actions" role="group" aria-label={'Kontrol '+(i.payload.title||i.item_key)}>
       <button type="button" onClick={()=>setSelectedItem(i.id)} aria-pressed={active===i.id}
        className="facilitator-item-action results">Lihat hasil</button>
       <button type="button" disabled={busy||!canManage||classStatus!=='live'||i.state==='revealed'||i.state==='open'} onClick={()=>void act(i.id,'open')}
        className="facilitator-item-action open">Buka</button>
       <button type="button" disabled={busy||!canManage||classStatus!=='live'||i.state!=='open'} onClick={()=>void act(i.id,'close')}
        className="facilitator-item-action close">Tutup</button>
       <button type="button" disabled={busy||!canManage||classStatus!=='live'||!['closed','open'].includes(i.state)} onClick={()=>void act(i.id,'reveal')}
        className="facilitator-item-action reveal">Bahas</button>
      </div>
     </article>)}</div>
     {!items.length&&<p className="rounded-xl bg-white p-6 text-slate-600">Belum terhubung atau item kelas tidak tersedia.</p>}
     {items.length>0&&!items.some(i=>(filter==='all'||(filter==='finished'?['closed','revealed'].includes(i.state):i.state===filter))&&
      [i.item_key,i.payload.title||'',i.payload.prompt||'',String(i.module_no)].join(' ').toLowerCase().includes(search.toLowerCase().trim()))&&
      <p className="rounded-xl bg-white p-6 text-slate-600">Tidak ada aktivitas yang cocok dengan pencarian.</p>}
    </section>
    <aside className="facilitator-insights">
     <section className="facilitator-insight-card" aria-label="Monitor jawaban">
      <div className="facilitator-insight-heading"><span className="facilitator-insight-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 16v-4M12 16V8M17 16v-6"/></svg></span><div><span className="facilitator-section-eyebrow">REAL-TIME</span><h2>Monitor jawaban</h2></div></div>
      <p className="facilitator-monitor-label">Item dipantau</p>
      <p className="facilitator-monitor-item">{items.find(i=>i.id===active)?.payload.title||items.find(i=>i.id===active)?.item_key||'Belum dipilih'}</p>
      <div className="facilitator-response-count"><strong>{results?.answered??0}</strong><span>dari <b>{results?.joined??0}</b> peserta terdaftar</span></div>
      <div className="facilitator-progress" role="progressbar" aria-label="Persentase jawaban terkumpul" aria-valuemin={0} aria-valuemax={100} aria-valuenow={results?.joined?Math.round(100*results.answered/results.joined):0}>
       <div className="facilitator-progress-fill" style={{width:(results?.joined?Math.min(100,Math.max(0,100*results.answered/results.joined)):0)+'%'}}></div>
      </div>
      <p className="facilitator-progress-caption">{results?.joined?Math.min(100,Math.round(100*results.answered/results.joined)):0}% respons terkumpul</p>
      <div className="facilitator-choice-list">{results?.counts.map(c=><div key={c.choice} className="facilitator-choice-row">
       <span>{c.choice}</span><strong>{c.count}</strong></div>)}</div>
      {!active&&<p className="facilitator-insight-empty">Pilih <strong>Lihat hasil</strong> pada rundown untuk memantau jawaban.</p>}
     </section>
     <section className="facilitator-insight-card" aria-label="Chat dan moderasi">
      <div className="facilitator-insight-heading"><span className="facilitator-insight-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5c0 4.7-4 8.5-9 8.5a10 10 0 0 1-4.2-.9L3 21l1.4-4.5A8 8 0 0 1 3 11.5C3 6.8 7 3 12 3s9 3.8 9 8.5Z"/></svg></span><div><span className="facilitator-section-eyebrow">INTERAKSI KELAS</span><h2>Chat & moderasi</h2></div><span className="facilitator-message-count">{messages.length}</span></div>
      <p className="facilitator-insight-description">Bacakan pesan relevan (+5 poin) atau sembunyikan pesan sensitif. Setiap aksi dicatat dalam audit.</p>
      <div className="facilitator-chat-list max-h-96 space-y-3 overflow-y-auto">
       {messages.map(m=><article key={m.id} className={'rounded-lg border p-3 '+(m.hidden?'border-red-200 bg-red-50':'border-slate-200')}>
        <div className="flex items-center justify-between gap-2 text-xs font-bold">
         <span>{m.display_name}</span><span>{m.read_aloud?'Sudah dibacakan':m.hidden?'Tersembunyi':'Baru'}</span>
        </div>
        <p className="mt-2 break-words text-sm">{m.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
         <button type="button" disabled={busy||!canManage||m.hidden||m.read_aloud} onClick={()=>void moderate(m.id,'read_aloud')}
          className="rounded border border-teal px-2 py-1 text-xs font-bold text-teal">Bacakan (+5)</button>
         <button type="button" disabled={busy||!canManage} onClick={()=>void moderate(m.id,m.hidden?'unhide':'hide')}
          className="rounded border border-slate-300 px-2 py-1 text-xs font-bold">{m.hidden?'Tampilkan':'Sembunyikan'}</button>
        </div>
       </article>)}
       {!messages.length&&<div className="facilitator-insight-empty"><span aria-hidden="true" className="facilitator-empty-symbol">◇</span><strong>Belum ada pesan</strong><span>Pesan peserta akan muncul otomatis saat dikirim.</span></div>}
      </div>
     </section>
     <section className="facilitator-insight-card" aria-label="Papan peringkat kelas">
      <div className="facilitator-insight-heading"><span className="facilitator-insight-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4H5a2 2 0 0 0-2 2c0 4 3 6 6 6M17 4h2a2 2 0 0 1 2 2c0 4-3 6-6 6M7 3h10v6a5 5 0 0 1-10 0Z"/></svg></span><div><span className="facilitator-section-eyebrow">LEADERBOARD</span><h2>Top 10 kelas</h2></div></div>
      <ol className="facilitator-leaderboard">{score.map(p=><li key={p.participant_id}>
       <span className="facilitator-leader-rank">{p.rank_no}</span><span className="facilitator-leader-name">{p.display_name}</span><strong>{p.points}<small> poin</small></strong></li>)}</ol>
      {!score.length&&<div className="facilitator-insight-empty"><span aria-hidden="true" className="facilitator-empty-symbol">☆</span><strong>Belum ada peringkat</strong><span>Skor peserta akan tampil setelah aktivitas dinilai.</span></div>}
     </section>
    </aside>
   </div>
  </div>
 </main>;
}
