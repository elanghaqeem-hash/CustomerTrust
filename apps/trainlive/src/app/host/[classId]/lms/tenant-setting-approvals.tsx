'use client';
import {useEffect,useState} from 'react';
type Approval={id:string;key:string;value:unknown;baseRevision:number;requesterEmail:string;requestedAt:string;canApprove:boolean};
export default function TenantSettingApprovals({classId,tenantId,headers}:{classId:string;tenantId:string;headers:()=>Record<string,string>}){
 const endpoint='/api/class/'+classId+'/lms/tenants/'+tenantId+'/settings/approvals';
 const [items,setItems]=useState<Approval[]>([]);
 const [error,setError]=useState(''),[busy,setBusy]=useState('');
 async function load(){
  const r=await fetch(endpoint,{headers:headers(),cache:'no-store'});const d=await r.json();
  if(!r.ok)throw Error(d.error||'Approval queue tidak tersedia');
  setItems((d.requests||[]) as Approval[]);
 }
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Approval queue gagal dimuat'));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[classId,tenantId]);
 async function review(id:string,decision:'approve'|'reject'){
  if(busy)return;
  const note=window.prompt(decision==='approve'?'Catatan pemeriksaan (opsional)':'Alasan penolakan (wajib)')||'';
  if(decision==='reject'&&!note.trim()){setError('Alasan penolakan wajib diisi.');return;}
  setBusy(id);setError('');
  try{
   const r=await fetch(endpoint,{method:'POST',headers:{...headers(),'Content-Type':'application/json'},
    body:JSON.stringify({requestId:id,decision,note})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Approval ditolak');
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Approval gagal');}
  finally{setBusy('');}
 }
 return <section className="mt-6 border-t border-slate-200 pt-5" aria-labelledby="tenant-approval-queue-title">
  <p className="workspace-eyebrow">MAKER-CHECKER / PARAMETER GOVERNANCE</p>
  <h3 id="tenant-approval-queue-title" className="mt-1 text-lg font-extrabold text-slate-900">Antrean persetujuan parameter</h3>
  <p className="mt-1 text-sm text-slate-600">Perubahan belum aktif sampai checker yang berbeda menyetujui. Revisi dasar diperiksa kembali saat approval.</p>
  {error&&<p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
  {!items.length?<p className="mt-3 text-sm text-slate-500">Tidak ada usulan menunggu persetujuan.</p>:
   <div className="mt-3 space-y-3">{items.map(item=><article key={item.id} className="rounded-xl border border-slate-200 p-4">
    <p className="text-xs font-bold uppercase tracking-wider text-teal-700">{item.key}</p>
    <p className="mt-1 break-all font-semibold text-slate-900">{String(item.value)}</p>
    <p className="mt-1 text-xs text-slate-500">Pemohon {item.requesterEmail} · base revision {item.baseRevision}</p>
    {item.canApprove?<div className="mt-3 flex flex-wrap gap-2">
     <button type="button" className="tl-staff-button" disabled={Boolean(busy)} onClick={()=>void review(item.id,'approve')}>{busy===item.id?'Memproses…':'Setujui'}</button>
     <button type="button" className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-bold text-rose-800" disabled={Boolean(busy)} onClick={()=>void review(item.id,'reject')}>Tolak</button>
    </div>:<p className="mt-3 text-xs font-semibold text-amber-800">Dibuat oleh akun Anda. Minta Tenant Admin lain untuk memeriksa.</p>}
   </article>)}</div>}
 </section>;
}
