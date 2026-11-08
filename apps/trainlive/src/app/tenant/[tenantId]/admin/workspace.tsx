'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {notFound} from 'next/navigation';
import {LMS_ENABLED} from '@/lib/lms-flags';

type Program={id:string;code:string;title:string;description:string;courseCount:number};
type Tenant={id:string;name:string;slug:string;status:'onboarding'|'active'|'suspended'};
type Workspace={tenant:Tenant;programs:Program[];settings:Record<string,unknown>;revisions:Record<string,number>};
type Effective={value:string|number|boolean;source:'tenant'|'global'};
type SettingResponse={effective:Record<string,Effective>;revisions:Record<string,number>};
type Approval={id:string;key:string;value:unknown;baseRevision:number;requestedBy:string;requesterEmail:string;requestedAt:string;status:string;canApprove:boolean};
type ApprovalResponse={requests:Approval[]};
const settingFields=[
 {key:'branding.primary_color',label:'Warna utama brand',kind:'color'},
 {key:'branding.logo_url',label:'URL logo HTTPS',kind:'url'},
 {key:'learning.default_passing_grade',label:'Passing grade default (%)',kind:'number'},
 {key:'learning.default_sequential',label:'Urutan modul default',kind:'boolean'},
 {key:'learning.default_delivery_mode',label:'Mode belajar default',kind:'mode'},
 {key:'certificate.issuer_name',label:'Nama penerbit sertifikat',kind:'text'}
] as const;
const initialProgram={code:'',title:'',description:''};
export default function TenantAdminWorkspace({tenantId}:{tenantId:string}){
 const [workspace,setWorkspace]=useState<Workspace|null>(null);
 const [settings,setSettings]=useState<SettingResponse|null>(null);
 const [approvals,setApprovals]=useState<Approval[]>([]);
 const [values,setValues]=useState<Record<string,string|number|boolean>>({});
 const [program,setProgram]=useState(initialProgram);
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const base='/api/tenant/'+tenantId;
 async function load(){
  const [a,b,c]=await Promise.all([
   fetch(base+'/lms',{cache:'no-store'}),
   fetch(base+'/lms/settings',{cache:'no-store'}),
   fetch(base+'/lms/settings/approvals',{cache:'no-store'})
  ]);
  const [ad,bd,cd]=await Promise.all([a.json(),b.json(),c.json()]);
  if(!a.ok)throw Error(ad.error||'Akses Tenant Admin ditolak');
  if(!b.ok)throw Error(bd.error||'Parameter tenant gagal dimuat');
  if(!c.ok)throw Error(cd.error||'Approval tenant gagal dimuat');
  const next=ad as Workspace,settingData=bd as SettingResponse;
  setWorkspace(next);setSettings(settingData);setApprovals((cd as ApprovalResponse).requests||[]);
  setValues(Object.fromEntries(Object.entries(settingData.effective).map(([k,v])=>[k,v.value])));
 }
 useEffect(()=>{let active=true;void load().catch(e=>{if(active)setError(e instanceof Error?e.message:'Workspace tidak tersedia')});
  return()=>{active=false};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[tenantId]);
 async function createProgram(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;
  setBusy('program');setError('');setNotice('');
  try{
   const res=await fetch(base+'/lms',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action:'create_program',...program})});
   const data=await res.json();if(!res.ok)throw Error(data.error||'Program tidak dapat dibuat');
   await load();setProgram(initialProgram);setNotice('Program berhasil dibuat di tenant ini. Kode program tetap unik di seluruh platform.');
  }catch(e){setError(e instanceof Error?e.message:'Gagal membuat program');}
  finally{setBusy('');}
 }
 async function propose(key:string){
  if(busy)return;
  setBusy(key);setError('');setNotice('');
  try{
   const res=await fetch(base+'/lms/settings',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({key,value:values[key]})});
   const data=await res.json();if(!res.ok)throw Error(data.error||'Usulan parameter ditolak');
   await load();setNotice(data.status==='no_change'?'Nilai sudah sama dengan konfigurasi aktif.':'Usulan '+key+' dikirim dan menunggu approval oleh Tenant Admin lain.');
  }catch(e){setError(e instanceof Error?e.message:'Gagal mengirim usulan');}
  finally{setBusy('');}
 }
 async function review(requestId:string,decision:'approve'|'reject'){
  if(busy)return;
  const note=window.prompt(decision==='approve'?'Catatan pemeriksaan (opsional)':'Alasan penolakan (wajib)')||'';
  if(decision==='reject'&&!note.trim()){setError('Alasan penolakan wajib diisi.');return;}
  setBusy(requestId);setError('');setNotice('');
  try{
   const res=await fetch(base+'/lms/settings/approvals',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({requestId,decision,note})});
   const data=await res.json();if(!res.ok)throw Error(data.error||'Approval ditolak');
   await load();setNotice(data.status==='approved'?'Parameter disetujui dan diterapkan sebagai revisi baru.':data.status==='stale'?'Usulan kedaluwarsa karena revisi parameter berubah.':'Usulan ditolak.');
  }catch(e){setError(e instanceof Error?e.message:'Gagal memproses approval');}
  finally{setBusy('');}
 }
 async function logout(){
  setBusy('logout');
  try{await fetch(base+'/logout',{method:'POST'});}finally{window.location.assign('/tenant/login/'+tenantId);}
 }
 if(!LMS_ENABLED)notFound();
 return <main className="trainlive-workspace min-h-screen bg-slate-50 pb-16">
  <header className="workspace-nav text-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
   <a href="/" className="text-xl font-extrabold text-white no-underline">Train<span className="text-teal-300">Live</span> <span className="ml-2 border-l border-white/20 pl-3 text-sm text-white/80">Tenant Workspace</span></a>
   <button type="button" onClick={()=>void logout()} disabled={busy==='logout'} className="rounded-lg border border-white/25 px-4 py-2 text-sm font-semibold text-white">{busy==='logout'?'Keluar…':'Keluar'}</button>
  </div></header>
  <div className="mx-auto max-w-6xl px-5 py-8">
   <p className="workspace-eyebrow">CLIENT LEARNING OPERATIONS</p>
   <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
    <div><h1 className="text-3xl font-extrabold text-slate-900">{workspace?.tenant.name||'Tenant Admin'}</h1>
     <p className="mt-2 text-sm text-slate-600">Kelola program, konfigurasi white-label dan persetujuan perubahan untuk tenant ini.</p>
     {workspace&&<p className="mt-2 text-xs text-slate-500">{workspace.tenant.slug} · {workspace.tenant.status} · {workspace.tenant.id}</p>}</div>
    {workspace&&<span className="rounded-full bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">TENANT SCOPED</span>}
   </div>
   {error&&<p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
   {notice&&<p role="status" className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">{notice}</p>}
   {!workspace?<p role="status" className="mt-6 text-sm text-slate-600">Memuat workspace tenant…</p>:<>
    <section className="mt-6 grid gap-4 md:grid-cols-3">
     <article className="workspace-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Program</p><p className="mt-2 text-3xl font-extrabold text-slate-900">{workspace.programs.length}</p></article>
     <article className="workspace-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Kursus terdaftar</p><p className="mt-2 text-3xl font-extrabold text-slate-900">{workspace.programs.reduce((n,p)=>n+p.courseCount,0)}</p></article>
     <article className="workspace-card p-5"><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Approval tertunda</p><p className="mt-2 text-3xl font-extrabold text-slate-900">{approvals.length}</p></article>
    </section>
    <section className="mt-7 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
     <form onSubmit={e=>void createProgram(e)} className="workspace-card space-y-4 p-5" aria-labelledby="tenant-program-title">
      <div><p className="workspace-eyebrow">01 / PROGRAM ONBOARDING</p><h2 id="tenant-program-title" className="mt-1 text-xl font-extrabold text-slate-900">Buat program pembelajaran</h2>
       <p className="mt-1 text-sm text-slate-600">Program disimpan di organisasi tenant tanpa membuat kelas atau menyalin data peserta lama.</p></div>
      <div><label className="field-label" htmlFor="tenant-program-code">Kode program *</label><input id="tenant-program-code" className="field-input" required pattern="[A-Z][A-Z0-9_-]{2,31}" maxLength={32} value={program.code} onChange={e=>setProgram(v=>({...v,code:e.target.value.toUpperCase()}))} placeholder="RISK2026"/></div>
      <div><label className="field-label" htmlFor="tenant-program-title">Nama program *</label><input id="tenant-program-title" className="field-input" required minLength={3} maxLength={160} value={program.title} onChange={e=>setProgram(v=>({...v,title:e.target.value}))} placeholder="Risk Management Academy"/></div>
      <div><label className="field-label" htmlFor="tenant-program-description">Deskripsi</label><textarea id="tenant-program-description" className="field-input min-h-24" maxLength={2000} value={program.description} onChange={e=>setProgram(v=>({...v,description:e.target.value}))} placeholder="Tujuan, ruang lingkup, dan sasaran pembelajaran"/></div>
      <button type="submit" className="tl-staff-button" disabled={Boolean(busy)}>{busy==='program'?'Menyimpan…':'Buat program'}</button>
     </form>
     <section className="workspace-card p-5" aria-labelledby="tenant-program-list-title">
      <p className="workspace-eyebrow">02 / PROGRAM CATALOG</p><h2 id="tenant-program-list-title" className="mt-1 text-xl font-extrabold text-slate-900">Program tenant</h2>
      {!workspace.programs.length?<p className="mt-4 text-sm text-slate-500">Belum ada program. Buat program pertama untuk memulai katalog pembelajaran.</p>:
       <div className="mt-4 space-y-3">{workspace.programs.map(p=><article key={p.id} className="rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-bold tracking-widest text-teal-700">{p.code}</p><h3 className="mt-1 font-extrabold text-slate-900">{p.title}</h3>
        {p.description&&<p className="mt-2 text-sm text-slate-600">{p.description}</p>}
        <p className="mt-2 text-xs text-slate-500">{p.courseCount} kursus · {p.id}</p>
       </article>)}</div>}
     </section>
    </section>
    <section className="workspace-card mt-7 p-5 sm:p-6" aria-labelledby="tenant-branding-title">
     <p className="workspace-eyebrow">03 / WHITE-LABEL & PARAMETER GOVERNANCE</p><h2 id="tenant-branding-title" className="mt-1 text-xl font-extrabold text-slate-900">Branding dan parameter tenant</h2>
     <p className="mt-2 text-sm text-slate-600">Setiap perubahan menjadi usulan. Nilai aktif baru berubah setelah disetujui Tenant Admin lain; pengaturan keamanan tidak dapat dilemahkan dari sini.</p>
     <div className="mt-4 grid gap-3 md:grid-cols-2">
      {settingFields.map(field=>{
       const effective=settings?.effective[field.key];if(!effective)return null;
       const value=values[field.key]??effective.value;
       return <form key={field.key} onSubmit={e=>{e.preventDefault();void propose(field.key);}} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="field-label" htmlFor={'tenant-setting-'+field.key}>{field.label}</label>
        {field.kind==='boolean'?<label className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><input id={'tenant-setting-'+field.key} type="checkbox" checked={Boolean(value)} onChange={e=>setValues(v=>({...v,[field.key]:e.target.checked}))}/>Aktif</label>:
         field.kind==='mode'?<select id={'tenant-setting-'+field.key} className="field-input mt-2" value={String(value)} onChange={e=>setValues(v=>({...v,[field.key]:e.target.value}))}><option value="live">Live</option><option value="self_paced">Self-paced</option><option value="blended">Blended</option></select>:
         <input id={'tenant-setting-'+field.key} className="field-input mt-2" type={field.kind==='color'?'color':field.kind==='url'?'url':field.kind==='number'?'number':'text'} min={field.kind==='number'?0:undefined} max={field.kind==='number'?100:undefined} maxLength={field.kind==='url'?512:field.kind==='text'?160:undefined} value={String(value)} onChange={e=>setValues(v=>({...v,[field.key]:field.kind==='number'?Number(e.target.value):e.target.value}))}/>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">{effective.source==='tenant'?'Override tenant':'Default global'} · revisi {settings?.revisions[field.key]||0}</span>
         <button type="submit" className="rounded-lg border border-teal-300 px-3 py-2 text-xs font-bold text-teal-800" disabled={Boolean(busy)||value===effective.value}>{busy===field.key?'Mengirim…':'Ajukan perubahan'}</button></div>
       </form>;
      })}
     </div>
    </section>
    <section className="workspace-card mt-7 p-5 sm:p-6" aria-labelledby="tenant-approval-title">
     <p className="workspace-eyebrow">04 / MAKER-CHECKER</p><h2 id="tenant-approval-title" className="mt-1 text-xl font-extrabold text-slate-900">Persetujuan parameter</h2>
     {!approvals.length?<p className="mt-4 text-sm text-slate-500">Tidak ada usulan parameter yang menunggu persetujuan.</p>:
      <div className="mt-4 space-y-3">{approvals.map(a=><article key={a.id} className="rounded-xl border border-slate-200 p-4">
       <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wider text-teal-700">{a.key}</p><p className="mt-1 break-all font-semibold text-slate-900">{String(a.value)}</p><p className="mt-1 text-xs text-slate-500">Pemohon: {a.requesterEmail} · revisi dasar {a.baseRevision}</p></div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">Menunggu</span></div>
       {a.canApprove?<div className="mt-3 flex flex-wrap gap-2"><button type="button" className="tl-staff-button" disabled={Boolean(busy)} onClick={()=>void review(a.id,'approve')}>Setujui</button>
        <button type="button" className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-bold text-rose-800" disabled={Boolean(busy)} onClick={()=>void review(a.id,'reject')}>Tolak</button></div>:<p className="mt-3 text-xs font-semibold text-amber-800">Dibuat oleh akun Anda. Minta Tenant Admin lain untuk memeriksa.</p>}
       <p className="mt-2 text-xs text-slate-500">Pembuat usulan tidak dapat menyetujui permintaannya sendiri. Database memverifikasi pemisahan tugas.</p>
      </article>)}</div>}
    </section>
   </>}
  </div>
 </main>;
}
