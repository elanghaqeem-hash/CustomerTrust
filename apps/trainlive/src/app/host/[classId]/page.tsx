'use client';
import {useParams} from 'next/navigation';
import { useEffect,useState } from 'react';
type Item={id:string;item_key:string;state:string;type:string;module_no:number;slide_ref:number|null;payload:{title?:string;prompt?:string}};
type Score={participant_id:string;display_name:string;unit:string;points:number;rank_no:number};
export default function HostPage(){
 const id=useParams<{classId:string}>().classId;
 const [token,setToken]=useState(''),[items,setItems]=useState<Item[]>([]),[score,setScore]=useState<Score[]>([]);
 const [active,setActive]=useState<string|null>(null),[results,setResults]=useState<{answered:number;joined:number;counts:{choice:string;count:number}[]}|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){
  if(!token)return;
  try{
   const headers={Authorization:'Bearer '+token};
   const [a,b]=await Promise.all([fetch('/api/class/'+id+'/items',{headers,cache:'no-store'}),
    fetch('/api/class/'+id+'/leaderboard',{headers,cache:'no-store'})]);
   if(!a.ok)throw Error('Token staf ditolak atau tidak ditugaskan pada kelas ini.');
   const ia=await a.json(),lb=b.ok?await b.json():{top:[]};
   setItems(ia.items);setScore(lb.top||[]);setError('');
   const opened=(ia.items as Item[]).find(x=>x.state==='open');
   if(opened){
    setActive(opened.id);
    const res=await fetch('/api/class/'+id+'/results?itemId='+opened.id,{headers,cache:'no-store'});
    if(res.ok)setResults(await res.json());
   }else setResults(null);
  }catch(e){setError(e instanceof Error?e.message:'Gagal mengambil data');}
 }
 useEffect(()=>{
  if(!token)return;
  void refresh();
  const interval=setInterval(()=>void refresh(),3000);
  return()=>clearInterval(interval);
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[token,id]);
 async function act(itemId:string,action:'open'|'close'|'reveal'){
  if(!token)return;setBusy(true);
  try{
   const res=await fetch('/api/class/'+id+'/action',{method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({itemId,action})});
   const j=await res.json();if(!res.ok)throw Error(j.error||'Gagal mengubah status');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Gagal menyimpan');}
  finally{setBusy(false)}
 }
 return <main className="min-h-screen bg-paper">
  <header className="bg-navy px-6 py-5 text-white"><div className="mx-auto flex max-w-6xl justify-between gap-4">
   <span className="text-xl font-extrabold">TrainLive / Fasilitator</span><span className="text-sm text-slate-300">Kelas {id.slice(0,8)}</span>
  </div></header>
  <div className="mx-auto max-w-6xl px-5 py-8">
   <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
    Konsol staging: masukkan token staf yang diterbitkan secara aman untuk kelas ini. Autentikasi SSO/MFA dan kanal WebSocket belum tersedia.
   </div>
   <label className="field-label" htmlFor="staff-token">Token staf kelas (sementara)</label>
   <div className="mb-6 flex flex-wrap gap-2">
    <input id="staff-token" type="password" autoComplete="off" className="field-input max-w-2xl"
     value={token} onChange={e=>setToken(e.target.value)} placeholder="Token JWT khusus kelas"/>
    <button className="rounded-xl bg-teal px-5 font-bold text-white" onClick={()=>void refresh()}>Hubungkan</button>
   </div>
   {error&&<p role="alert" className="mb-6 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
   <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
    <section><h1 className="mb-4 text-2xl font-extrabold">Rundown interaktif</h1>
     <div className="space-y-3">{items.map(i=><div key={i.id} className="shadow-card rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
       <span className="text-sm font-bold text-teal">Modul {i.module_no} · Slide {i.slide_ref??'—'}</span>
       <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase">{i.state}</span>
      </div>
      <h2 className="text-lg font-bold">{i.payload.title||i.item_key}</h2>
      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{i.payload.prompt}</p>
      <div className="mt-4 flex flex-wrap gap-2">
       <button disabled={busy||i.state==='revealed'||i.state==='open'} onClick={()=>void act(i.id,'open')}
        className="rounded-lg bg-teal px-4 py-2 font-bold text-white">Buka</button>
       <button disabled={busy||i.state!=='open'} onClick={()=>void act(i.id,'close')}
        className="rounded-lg bg-navy px-4 py-2 font-bold text-white">Tutup</button>
       <button disabled={busy||!['closed','open','revealed'].includes(i.state)} onClick={()=>void act(i.id,'reveal')}
        className="rounded-lg border border-gold bg-white px-4 py-2 font-bold text-navy">Reveal</button>
      </div>
     </div>)}</div>
     {!items.length&&<p className="rounded-xl bg-white p-6 text-slate-600">Belum terhubung atau item kelas tidak tersedia.</p>}
    </section>
    <aside className="space-y-6">
     <section className="shadow-card rounded-xl bg-white p-5">
      <h2 className="mb-4 text-xl font-bold">Monitor jawaban</h2>
      <p className="text-sm text-slate-500">Item aktif: {active?.slice(0,8)||'Belum dibuka'}</p>
      <p className="mt-3 text-3xl font-extrabold text-teal">{results?.answered??0} <span className="text-base text-slate-500">/ {results?.joined??0} peserta terdaftar</span></p>
      <div className="mt-4 space-y-2">{results?.counts.map(c=><div key={c.choice} className="flex justify-between border-b border-slate-100 py-2">
       <span>{c.choice}</span><strong>{c.count}</strong></div>)}</div>
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
