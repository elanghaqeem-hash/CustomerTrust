'use client';
import {useParams} from 'next/navigation';
import { useEffect,useState } from 'react';
type Item={id:string;item_key:string;state:string;type:string;module_no:number;slide_ref:number|null;payload:{title?:string;prompt?:string}};
type Score={participant_id:string;display_name:string;unit:string;points:number;rank_no:number};
type ChatMessage={id:string;body:string;display_name:string;hidden:boolean;read_aloud:boolean;created_at:string};
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
 const [loginMode,setLoginMode]=useState<'checking'|'sso_login'|'sso_ready'|'manual'|'blocked'>('checking');
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
  fetch('/api/auth/staff/status?classId='+encodeURIComponent(id),{cache:'no-store'})
   .then(async r=>{if(!r.ok)throw Error('status unavailable');return r.json()})
   .then(s=>{if(mounted)setLoginMode(s.authenticated?'sso_ready':
    s.configured?'sso_login':s.manualAllowed?'manual':'blocked')})
   .catch(()=>{if(mounted)setLoginMode('blocked')});
  return()=>{mounted=false};
 },[id]);
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
 return <main className="trainlive-workspace trainlive-console min-h-screen pb-16">
  <header className="workspace-nav text-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
   <a href="/" aria-label="TrainLive — Beranda" className="flex items-center gap-3 text-white no-underline">
    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#5eead4] text-[#08263b]">
     <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" strokeLinejoin="round"/><path d="M4 6v12" strokeLinecap="round"/></svg>
    </span><span className="text-xl font-extrabold tracking-[-.04em]">Train<span className="text-[#5eead4]">Live</span></span>
    <span className="hidden border-l border-white/20 pl-3 text-xs font-medium text-slate-300 sm:inline">Workspace Fasilitator</span>
   </a><span className="rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-[#bfe8e2]">Kelas {id.slice(0,8)}</span>
  </div></header>
  <div className="mx-auto max-w-6xl px-5 py-8">
   <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div><p className="workspace-eyebrow">LIVE CLASS CONTROL</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#102d40]">Konsol fasilitator</h1>
     <p className="mt-2 text-sm text-[#667d8f]">Kelola aktivitas, pantau respons, dan moderasi percakapan kelas.</p>
    </div>
    <nav aria-label="Menu fasilitator" className="flex flex-wrap gap-2">
     <a aria-current="page" href={'/host/'+id} className="inline-flex min-h-11 items-center rounded-xl bg-[#0f766e] px-4 text-sm font-bold text-white no-underline shadow-sm">Konsol kelas</a>
     <a href={'/host/'+id+'/report'} className="inline-flex min-h-11 items-center rounded-xl border border-[#cce0df] bg-white px-4 text-sm font-bold text-[#0f766e] no-underline hover:bg-[#f2faf8]">Laporan & ekspor</a>
    </nav>
   </div>
   {loginMode==='checking'&&<p role="status" className="mb-6 rounded-xl bg-white p-4">Memeriksa akses fasilitator…</p>}
   {loginMode==='blocked'&&<p role="alert" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
    Login SSO/MFA fasilitator belum dikonfigurasi. Akses operasional kelas belum dibuka.
   </p>}
   {loginMode==='sso_login'&&<a href={'/api/auth/staff/start?classId='+encodeURIComponent(id)}
    className="mb-6 inline-flex rounded-xl bg-teal px-5 py-3 font-bold text-white">
    Masuk sebagai fasilitator (SSO + MFA)</a>}
   {loginMode==='sso_ready'&&<div className="mb-6 flex items-center justify-between rounded-xl border border-teal bg-white p-4">
    <span className="font-bold text-teal">Sesi SSO/MFA staf aktif</span>
    <button className="underline" onClick={()=>void logout()}>Keluar</button>
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
   {canCreateClass&&<a href={'/host/'+id+'/admin'} className="mb-5 inline-flex rounded-xl bg-teal px-5 py-3 font-bold text-white">Buat Kelas Baru (Admin)</a>}
   {role&&<p role="status" className="mb-4 text-sm font-semibold text-teal">Peran kelas: {role==='observer'?'Observer (hanya melihat dan mengunduh laporan)':role==='cohost'?'Co-host':'Fasilitator'}</p>}
   {error&&<p role="alert" className="mb-6 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
   {classStatus&&<section className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-5">
    <span className="font-bold">Status kelas: <strong className="text-teal">{classStatus.toUpperCase()}</strong></span>
    {classStatus==='scheduled'&&<button disabled={!canManage||busy} onClick={()=>void changeClass('start')}
      className="rounded-lg bg-teal px-4 py-2 font-bold text-white disabled:opacity-50">Mulai kelas</button>}
    {classStatus==='live'&&<button disabled={!canManage||busy} onClick={()=>void changeClass('close')}
      className="rounded-lg border border-red-300 bg-white px-4 py-2 font-bold text-red-800 disabled:opacity-50">Tutup kelas</button>}
    {(classStatus==='closed'||classStatus==='archived')&&<span className="text-sm text-slate-600">Kelas sudah selesai. Aktivitas tidak dapat dibuka kembali.</span>}
   </section>}
   <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
    <section><h2 className="mb-4 text-2xl font-extrabold tracking-tight">Rundown interaktif</h2>
     <div className="mb-4 flex flex-col gap-3 rounded-xl bg-white p-4 sm:flex-row">
      <label className="min-w-0 flex-1"><span className="field-label">Cari aktivitas</span>
       <input className="field-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Judul, kode, modul…"/></label>
      <label className="min-w-0 sm:w-44"><span className="field-label">Status</span><select className="field-input" value={filter}
       onChange={e=>setFilter(e.target.value as typeof filter)}>
       <option value="all">Semua ({items.length})</option><option value="idle">Belum dibuka</option>
       <option value="open">Sedang dibuka</option><option value="finished">Selesai</option>
      </select></label>
     </div>
     <div className="space-y-3">{items.filter(i=>
      (filter==='all'||(filter==='finished'?['closed','revealed'].includes(i.state):i.state===filter))&&
      [i.item_key,i.payload.title||'',i.payload.prompt||'',String(i.module_no)].join(' ').toLowerCase().includes(search.toLowerCase().trim())
     ).map(i=><div key={i.id} className={'shadow-card rounded-xl border bg-white p-5 '+(active===i.id?'border-teal':'border-slate-200')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
       <span className="text-sm font-bold text-teal">Modul {i.module_no} · Slide {i.slide_ref??'—'}</span>
       <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase">{i.state}</span>
      </div>
      <h2 className="text-lg font-bold">{i.payload.title||i.item_key}</h2>
      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{i.payload.prompt}</p>
      <div className="mt-4 flex flex-wrap gap-2">
       <button type="button" onClick={()=>setSelectedItem(i.id)} aria-pressed={active===i.id}
        className="rounded-lg border border-teal px-4 py-2 font-bold text-teal">Lihat hasil</button>
       <button disabled={busy||!canManage||classStatus!=='live'||i.state==='revealed'||i.state==='open'} onClick={()=>void act(i.id,'open')}
        className="rounded-lg bg-teal px-4 py-2 font-bold text-white">Buka</button>
       <button disabled={busy||!canManage||classStatus!=='live'||i.state!=='open'} onClick={()=>void act(i.id,'close')}
        className="rounded-lg bg-navy px-4 py-2 font-bold text-white">Tutup</button>
       <button disabled={busy||!canManage||classStatus!=='live'||!['closed','open'].includes(i.state)} onClick={()=>void act(i.id,'reveal')}
        className="rounded-lg border border-gold bg-white px-4 py-2 font-bold text-navy">Reveal</button>
      </div>
     </div>)}</div>
     {!items.length&&<div className="tl-console-empty" role="status">
      <span className="tl-console-empty-icon" aria-hidden="true">▤</span>
      <strong>{access?'Aktivitas belum tersedia':'Hubungkan akun fasilitator'}</strong>
      <p>{access?'Belum ada materi terpublikasi di kelas ini. Periksa materi kelas sumber sebelum memulai sesi.':'Masuk menggunakan SSO + MFA untuk melihat rundown, hasil kuis, dan jawaban peserta.'}</p>
     </div>
     {items.length>0&&!items.some(i=>(filter==='all'||(filter==='finished'?['closed','revealed'].includes(i.state):i.state===filter))&&
      [i.item_key,i.payload.title||'',i.payload.prompt||'',String(i.module_no)].join(' ').toLowerCase().includes(search.toLowerCase().trim()))&&
      <p className="rounded-xl bg-white p-6 text-slate-600">Tidak ada aktivitas yang cocok dengan pencarian.</p>}
    </section>
    <aside className="space-y-6">
     <section className="shadow-card rounded-xl bg-white p-5">
      <h2 className="mb-4 text-xl font-bold">Monitor jawaban</h2>
      <p className="text-sm text-slate-500">Item dipantau: {items.find(i=>i.id===active)?.payload.title||items.find(i=>i.id===active)?.item_key||'Belum dipilih'}</p>
      <p className="mt-3 text-3xl font-extrabold text-teal">{results?.answered??0} <span className="text-base text-slate-500">/ {results?.joined??0} peserta terdaftar</span></p>
      <div className="mt-4 space-y-2">{results?.counts.map(c=><div key={c.choice} className="flex justify-between border-b border-slate-100 py-2">
       <span>{c.choice}</span><strong>{c.count}</strong></div>)}</div>
     </section>
     <section className="shadow-card rounded-xl bg-white p-5">
      <h2 className="mb-3 text-xl font-bold">Chat & moderasi</h2>
      <p className="mb-4 text-sm text-slate-500">Bacakan pesan yang relevan (+5 poin), atau sembunyikan pesan sensitif. Aksi tercatat pada audit.</p>
      <div className="max-h-96 space-y-3 overflow-y-auto">
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
       {!messages.length&&<p className="text-sm text-slate-500">Belum ada pesan peserta.</p>}
      </div>
     </section>
     <section className="shadow-card rounded-xl bg-white p-5"><h2 className="mb-4 text-xl font-bold">Top 10 kelas</h2>
      <ol className="space-y-2">{score.map(p=><li key={p.participant_id} className="flex justify-between gap-4 border-b border-slate-100 py-2">
       <span>{p.rank_no}. {p.display_name}</span><strong>{p.points}</strong></li>)}</ol>
     </section>
    </aside>
   </div>
  </div>
 </main>;
}
