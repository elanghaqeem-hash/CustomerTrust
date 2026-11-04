'use client';
import {useParams} from 'next/navigation';
import {useState} from 'react';
type Summary={
 participants:number;pre_submitted:number;post_submitted:number;post_pass_75:number;
 post_pass_pct_of_enrolled:number;pre_mean:number|null;post_mean:number|null;paired_mean_gain:number|null;
 target_post_met:boolean;target_gain_met:boolean;target_definitions:string;attendance_note:string
};
type Participant={
 participant_id:string;display_name:string;unit:string;pre_score:number|null;
 post_score:number|null;heartbeat_count:number;quiz_points:number
};
type Quiz={item_key:string;title:string|null;answered:number;correct:number;correct_pct:number|null};
type Report={classId:string;summary:Summary;participants:Participant[];quizzes:Quiz[]};
export default function ClassReport(){
 const classId=useParams<{classId:string}>().classId;
 const [token,setToken]=useState(''),[data,setData]=useState<Report|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){
  setBusy(true);setError('');
  try{
   const res=await fetch('/api/class/'+classId+'/report',
    {headers:{Authorization:'Bearer '+token},cache:'no-store'});
   if(!res.ok)throw Error(res.status===403?'Token staf tidak memiliki izin untuk kelas ini.':'Laporan tidak dapat dimuat.');
   setData(await res.json());
  }catch(e){setError(e instanceof Error?e.message:'Kesalahan laporan');}
  finally{setBusy(false)}
 }
 async function exportCsv(){
  setBusy(true);setError('');
  try{
   const res=await fetch('/api/class/'+classId+'/export?format=csv',
    {headers:{Authorization:'Bearer '+token},cache:'no-store'});
   if(!res.ok)throw Error('Ekspor ditolak: '+res.status);
   const blob=await res.blob(),link=document.createElement('a');
   const objectUrl=URL.createObjectURL(blob);
   link.href=objectUrl;link.download='trainlive_'+classId+'_participants.csv';
   document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),2000);
  }catch(e){setError(e instanceof Error?e.message:'Ekspor gagal');}
  finally{setBusy(false);}
 }
 const summary=data?.summary;
 const metrics=[
  {label:'Peserta terdaftar',value:summary?.participants??'—'},
  {label:'Pre-test masuk',value:summary?.pre_submitted??'—'},
  {label:'Post-test masuk',value:summary?.post_submitted??'—'},
  {label:'Post-test ≥ 75',value:summary?summary.post_pass_75+' peserta':'—'},
  {label:'Lulus ≥ 75 / terdaftar',value:summary?summary.post_pass_pct_of_enrolled+'%':'—'},
  {label:'Kenaikan rata-rata berpasangan',value:summary?.paired_mean_gain===null?'—':String(summary?.paired_mean_gain)+' poin'}
 ];
 return <main className="min-h-screen bg-paper pb-20">
  <header className="bg-navy px-5 py-5 text-white"><div className="mx-auto flex max-w-6xl items-center justify-between">
   <span className="text-xl font-extrabold">TrainLive / Laporan Kelas</span>
   <a className="text-sm underline" href={'/host/'+classId}>Konsol Fasilitator</a>
  </div></header>
  <div className="mx-auto max-w-6xl px-5 py-8">
   <h1 className="text-3xl font-extrabold">Evaluasi pembelajaran</h1>
   <p className="mt-2 text-slate-600">Rekap eksklusif kelas <span className="font-mono text-xs">{classId}</span>.</p>
   <div className="mt-6 flex flex-wrap gap-2">
    <input type="password" aria-label="Token staf khusus kelas" placeholder="Tempel token staf kelas"
     autoComplete="off" className="field-input max-w-xl flex-1" value={token} onChange={e=>setToken(e.target.value)}/>
    <button className="rounded-xl bg-teal px-5 font-bold text-white" disabled={busy||!token}
     onClick={()=>void load()}>Muat laporan</button>
    <button className="rounded-xl border border-teal bg-white px-5 font-bold text-teal"
     disabled={busy||!data} onClick={()=>void exportCsv()}>Ekspor CSV</button>
   </div>
   {error&&<div className="mt-5 rounded-xl bg-red-50 p-4 text-red-800" role="alert">{error}</div>}
   {data&&<div className="mt-7 space-y-7">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{metrics.map(m=><section key={m.label}
     className="shadow-card rounded-xl border border-slate-200 bg-white p-5">
     <p className="text-sm font-semibold text-slate-500">{m.label}</p>
     <p className="mt-2 text-3xl font-extrabold text-teal">{m.value}</p>
    </section>)}</div>
    <section className="rounded-xl bg-navy p-5 text-white">
     <h2 className="text-xl font-bold">Indikator target kelas</h2>
     <p className="mt-3">≥ 80% peserta post-test mencapai 75/100: <strong>{summary?.target_post_met?'TERCAPAI':'BELUM TERCAPAI'}</strong></p>
     <p className="mt-2">Kenaikan rata-rata ≥ 20 poin: <strong>{summary?.target_gain_met?'TERCAPAI':'BELUM TERCAPAI'}</strong></p>
     <p className="mt-4 text-sm text-slate-200">{summary?.target_definitions}</p>
    </section>
    <section className="shadow-card overflow-hidden rounded-xl bg-white">
     <div className="p-5"><h2 className="text-xl font-extrabold">Hasil per peserta</h2>
      <p className="mt-2 text-sm text-slate-500">{summary?.attendance_note}</p></div>
     <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm">
      <thead className="bg-slate-100 text-navy"><tr>
       {['Nama','Unit','Pre','Post','Gain','Aktif (est. menit)','Poin'].map(x=><th key={x} className="p-3">{x}</th>)}
      </tr></thead>
      <tbody>{data.participants.map(p=><tr key={p.participant_id} className="border-t border-slate-100">
       <td className="p-3 font-semibold">{p.display_name}</td><td className="p-3">{p.unit}</td>
       <td className="p-3">{p.pre_score??'—'}</td><td className="p-3">{p.post_score??'—'}</td>
       <td className="p-3">{p.pre_score!==null&&p.post_score!==null?p.post_score-p.pre_score:'—'}</td>
       <td className="p-3">{p.heartbeat_count}</td><td className="p-3 font-bold">{p.quiz_points}</td>
      </tr>)}</tbody></table></div>
    </section>
    <section className="shadow-card overflow-hidden rounded-xl bg-white">
     <h2 className="p-5 text-xl font-extrabold">Analitik kualitas soal</h2>
     <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm">
      <thead className="bg-slate-100"><tr><th className="p-3">Item</th><th className="p-3">Terjawab</th>
       <th className="p-3">Benar</th><th className="p-3">% benar</th></tr></thead>
      <tbody>{data.quizzes.map(q=><tr className="border-t border-slate-100" key={q.item_key}>
       <td className="p-3">{q.title||q.item_key}</td><td className="p-3">{q.answered}</td>
       <td className="p-3">{q.correct}</td><td className="p-3">{q.correct_pct===null?'—':q.correct_pct+'%'}</td>
      </tr>)}</tbody></table></div>
    </section>
   </div>}
  </div>
 </main>;
}
