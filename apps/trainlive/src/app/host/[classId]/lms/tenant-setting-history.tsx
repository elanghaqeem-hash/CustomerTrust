'use client';
import {useEffect,useState} from 'react';
type HistoryEntry={revision:number;value:string|number|boolean;at:string;actorId:string};
type ResponseData={key:string;history:HistoryEntry[]};
const options=[
 'branding.primary_color','branding.logo_url','learning.default_passing_grade',
 'learning.default_sequential','learning.default_delivery_mode','certificate.issuer_name'
];
export default function TenantSettingHistory({classId,headers,refresh}:{
 classId:string;headers:()=>Record<string,string>;refresh:()=>Promise<void>
}){
 const [key,setKey]=useState(options[0]);
 const [history,setHistory]=useState<ResponseData|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function load(value:string){
  const res=await fetch('/api/class/'+classId+'/lms/settings/history?key='+encodeURIComponent(value),
   {headers:headers(),cache:'no-store'});
  const result=await res.json();
  if(!res.ok)throw Error(result.error||'Riwayat parameter gagal dimuat');
  setHistory(result as ResponseData);
 }
 useEffect(()=>{setHistory(null);void load(key).catch(e=>setError(e instanceof Error?e.message:'Gagal membaca riwayat'));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[classId,key]);
 async function restore(revision:number){
  if(busy||!window.confirm('Pulihkan parameter '+key+' ke revisi '+revision+'? Perubahan akan dicatat sebagai revisi baru.'))return;
  setBusy(true);setError('');setNotice('');
  try{
   const res=await fetch('/api/class/'+classId+'/lms/settings/history',{
    method:'POST',headers:{...headers(),'Content-Type':'application/json'},
    body:JSON.stringify({action:'rollback',key,revision})
   });
   const body=await res.json();
   if(!res.ok)throw Error(body.error||'Pemulihan parameter gagal');
   await Promise.all([load(key),refresh()]);
   setNotice('Revisi '+revision+' berhasil dipulihkan sebagai versi baru.');
  }catch(e){setError(e instanceof Error?e.message:'Pemulihan gagal');}
  finally{setBusy(false);}
 }
 return <div className="mt-5 border-t border-slate-200 pt-5">
  <h3 className="text-lg font-extrabold text-slate-900">Riwayat revisi & pemulihan parameter</h3>
  <p className="mt-1 text-sm text-slate-600">Hanya perubahan parameter tenant yang telah tersimpan; pemulihan melewati validasi dan menulis audit baru.</p>
  <label htmlFor="lms-history-key" className="field-label mt-3">Parameter yang ditinjau</label>
  <select id="lms-history-key" className="field-input max-w-md" value={key} onChange={e=>{setKey(e.target.value);setError('');setNotice('');}}>
   {options.map(o=><option key={o} value={o}>{o}</option>)}
  </select>
  {error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
  {notice&&<p role="status" className="mt-3 text-sm text-teal-800">{notice}</p>}
  {!history?<p className="mt-3 text-sm text-slate-500">Memuat riwayat…</p>:
   !history.history.length?<p className="mt-3 text-sm text-slate-500">Belum ada override untuk parameter ini.</p>:
   <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
    <thead><tr className="border-b border-slate-200 text-slate-600"><th className="p-2">Revisi</th><th className="p-2">Nilai</th><th className="p-2">Waktu</th><th className="p-2">Aksi</th></tr></thead>
    <tbody>{history.history.map(h=><tr key={h.revision} className="border-b border-slate-100">
     <td className="p-2 font-bold">{h.revision}</td><td className="max-w-xs break-all p-2">{String(h.value)}</td>
     <td className="p-2">{new Date(h.at).toLocaleString('id-ID')}</td>
     <td className="p-2"><button type="button" disabled={busy||h.revision===history.history[0]?.revision}
      className="rounded-lg border border-teal-300 px-3 py-1 font-semibold text-teal-800 disabled:opacity-40"
      onClick={()=>void restore(h.revision)}>Pulihkan</button></td>
    </tr>)}</tbody>
   </table></div>}
 </div>;
}
