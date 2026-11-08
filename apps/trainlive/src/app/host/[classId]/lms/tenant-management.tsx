'use client';

import {useEffect,useState,type FormEvent} from 'react';
import TenantSettings from './tenant-settings';

type Membership={staffId:string;email:string;displayName:string;
 role:'tenant_admin'|'learning_manager'|'course_author'|'viewer';active:boolean};
type Tenant={id:string;name:string;slug:string;status:'onboarding'|'active'|'suspended';members:Membership[]};
type TenantList={sourceOrganizationId:string;tenants:Tenant[]};
const roles:Membership['role'][]=['tenant_admin','learning_manager','course_author','viewer'];
export default function TenantManagement({classId,headers}:{
 classId:string;headers:()=>Record<string,string>
}){
 const [data,setData]=useState<TenantList|null>(null);
 const [selectedTenant,setSelectedTenant]=useState<string|null>(null);
 const [create,setCreate]=useState({name:'',slug:''});
 const [edit,setEdit]=useState<Record<string,{name:string;status:Tenant['status']}>>({});
 const [assign,setAssign]=useState({tenantId:'',email:'',role:'viewer' as Membership['role']});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [inviteLink,setInviteLink]=useState('');
 async function reload(){
  const res=await fetch('/api/class/'+classId+'/lms/tenants',{headers:headers(),cache:'no-store'});
  const result=await res.json();
  if(!res.ok)throw Error(result.error||'Gagal memuat daftar klien');
  setData(result as TenantList);
 }
 useEffect(()=>{void reload().catch(e=>setError(e instanceof Error?e.message:'Layanan tenant tidak tersedia'));
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[classId]);
 async function mutate(payload:Record<string,unknown>,message:string){
  if(busy)return false;
  setBusy(true);setError('');setNotice('');
  try{
   const res=await fetch('/api/class/'+classId+'/lms/tenants',{
    method:'POST',headers:{...headers(),'Content-Type':'application/json'},
    body:JSON.stringify(payload)
   });
   const result=await res.json();
   if(!res.ok)throw Error(result.error||'Permintaan tenant ditolak');
   await reload();setNotice(message);return true;
  }catch(e){setError(e instanceof Error?e.message:'Terjadi kesalahan');return false;}
  finally{setBusy(false);}
 }
 async function createTenant(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(await mutate({action:'create_tenant',...create},'Klien baru dibuat sebagai onboarding; belum memiliki kelas atau peserta.'))
   setCreate({name:'',slug:''});
 }
 async function assignRole(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(await mutate({action:'assign_role',...assign},'Akses staf diperbarui dengan audit.'))
   setAssign(v=>({...v,email:''}));
 }
 return <section className="mt-7 space-y-5" aria-labelledby="tenant-admin-heading">
  <div>
   <p className="workspace-eyebrow">CLIENT ONBOARDING & ROLE GOVERNANCE</p>
   <h2 id="tenant-admin-heading" className="mt-1 text-xl font-extrabold text-slate-900">Manajemen Klien / Tenant</h2>
   <p className="mt-2 text-sm text-slate-600">Kelola tenant yang diotorisasi. Identitas staf harus sudah terverifikasi melalui SSO; hak Super Admin platform tidak dapat diberikan di sini.</p>
  </div>
  {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  {notice&&<p role="status" className="rounded-lg bg-teal-50 p-3 text-sm text-teal-800">{notice}</p>}
  <form onSubmit={e=>void createTenant(e)} className="workspace-card grid gap-3 p-5 sm:grid-cols-3">
   <div><label className="field-label" htmlFor="tenant-new-name">Nama klien baru</label>
    <input id="tenant-new-name" className="field-input" minLength={2} maxLength={160} required value={create.name}
     onChange={e=>setCreate(v=>({...v,name:e.target.value}))} placeholder="PT Contoh Training"/></div>
   <div><label className="field-label" htmlFor="tenant-new-slug">Kode unik tenant</label>
    <input id="tenant-new-slug" className="field-input" pattern="[a-z][a-z0-9-]{2,62}" required value={create.slug}
     onChange={e=>setCreate(v=>({...v,slug:e.target.value.toLowerCase()}))} placeholder="contoh-training"/></div>
   <button type="submit" className="tl-staff-button self-end" disabled={busy}>Buat tenant onboarding</button>
  </form>
  {!data?<p role="status" className="text-sm text-slate-500">Memuat tenant yang diotorisasi…</p>:<>
   <p className="text-sm text-slate-600">Tenant terlihat: <strong>{data.tenants.length}</strong>. Tenant sumber: <code>{data.sourceOrganizationId}</code>.</p>
   <div className="grid gap-4 lg:grid-cols-2">
    {data.tenants.map(tenant=>{
     const form=edit[tenant.id]||{name:tenant.name,status:tenant.status};
     return <article key={tenant.id} className="workspace-card space-y-3 p-5">
      <div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">{tenant.slug}</p>
       <h3 className="mt-1 font-extrabold text-slate-900">{tenant.name}</h3>
       <p className="mt-1 text-xs text-slate-500">{tenant.id}</p></div>
      <button type="button" className="rounded-lg border border-teal-300 px-3 py-2 text-sm font-semibold text-teal-800" onClick={()=>setSelectedTenant(v=>v===tenant.id?null:tenant.id)}>{selectedTenant===tenant.id?'Tutup parameter':'Kelola parameter / white-label'}</button>
      <form className="space-y-3" onSubmit={e=>{e.preventDefault();void mutate({
       action:'update_tenant',tenantId:tenant.id,name:form.name,status:form.status
      },'Informasi dan status tenant diperbarui.');}}>
       <div><label className="field-label" htmlFor={'tenant-name-'+tenant.id}>Nama organisasi</label>
        <input id={'tenant-name-'+tenant.id} className="field-input" minLength={2} maxLength={160} required value={form.name}
         onChange={e=>setEdit(v=>({...v,[tenant.id]:{...form,name:e.target.value}}))}/></div>
       <div><label className="field-label" htmlFor={'tenant-status-'+tenant.id}>Status onboarding / authoring</label>
        <select id={'tenant-status-'+tenant.id} className="field-input" value={form.status}
         onChange={e=>setEdit(v=>({...v,[tenant.id]:{...form,status:e.target.value as Tenant['status']}}))}>
         <option value="onboarding">Onboarding</option><option value="active">Aktif</option>
         <option value="suspended">Ditangguhkan (authoring LMS)</option></select></div>
       <button className="tl-staff-button" type="submit" disabled={busy||
        (form.name===tenant.name&&form.status===tenant.status)}>Simpan tenant</button>
      </form>
      <div className="border-t border-slate-200 pt-3">
       <h4 className="mb-2 text-sm font-bold text-slate-900">Anggota staf terotorisasi ({tenant.members.length})</h4>
       {!tenant.members.length?<p className="text-xs text-slate-500">Belum ada membership terdaftar untuk tenant legacy.</p>:
        <ul className="space-y-2">{tenant.members.map(m=><li key={m.staffId}
         className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-xs">
         <div className="min-w-0"><strong className="block text-slate-800">{m.displayName}</strong>
          <span className="break-all text-slate-500">{m.email} · {m.role} · {m.active?'Aktif':'Nonaktif'}</span></div>
         {m.active&&<button type="button" disabled={busy} className="rounded-lg border border-slate-300 px-2 py-1 font-semibold"
          onClick={()=>{if(window.confirm('Cabut akses tenant untuk '+m.email+'?'))
           void mutate({action:'revoke_role',tenantId:tenant.id,staffId:m.staffId},'Akses tenant dicabut.');}}>Cabut akses</button>}
        </li>)}</ul>}
      </div>
     </article>;
    })}
   </div>
   <form onSubmit={e=>void assignRole(e)} className="workspace-card space-y-3 p-5" aria-label="Tetapkan peran staf tenant">
    <h3 className="text-lg font-extrabold text-slate-900">Tetapkan peran staf</h3>
    <p className="text-xs text-slate-600">Hanya staf yang telah diprovisikan dan memiliki identitas OIDC terverifikasi. Peran ini tidak otomatis memberi akses ke kelas atau hak Super Admin.</p>
    <div className="grid gap-3 md:grid-cols-3">
     <div><label className="field-label" htmlFor="tenant-member-id">Tenant</label>
      <select id="tenant-member-id" required className="field-input" value={assign.tenantId}
       onChange={e=>setAssign(v=>({...v,tenantId:e.target.value}))}>
       <option value="">Pilih klien</option>{data.tenants.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
     <div><label className="field-label" htmlFor="tenant-member-email">Email staf</label>
      <input id="tenant-member-email" type="email" maxLength={254} className="field-input" required value={assign.email}
       onChange={e=>setAssign(v=>({...v,email:e.target.value}))} placeholder="staff@perusahaan.co.id"/></div>
     <div><label className="field-label" htmlFor="tenant-member-role">Peran tenant</label>
      <select id="tenant-member-role" className="field-input" value={assign.role}
       onChange={e=>setAssign(v=>({...v,role:e.target.value as Membership['role']}))}>
       {roles.map(role=><option key={role} value={role}>{role}</option>)}</select></div>
    </div>
    <button type="submit" className="tl-staff-button" disabled={busy}>Tetapkan membership</button>
   </form>
   {selectedTenant&&data.tenants.some(t=>t.id===selectedTenant)&&
    <TenantSettings key={selectedTenant} classId={classId} tenantId={selectedTenant} headers={headers}/>}
  </>}
 </section>;
}
