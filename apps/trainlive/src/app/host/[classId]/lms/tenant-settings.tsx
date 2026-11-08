'use client';

import {useEffect,useState,type FormEvent} from 'react';
type Item={value:string|number|boolean;source:'tenant'|'global'};
type ResponseData={organizationId:string;effective:Record<string,Item>;revisions:Record<string,number>};
const fields=[
 {key:'branding.primary_color',label:'Warna utama',kind:'color'},
 {key:'branding.logo_url',label:'URL logo HTTPS',kind:'url'},
 {key:'learning.default_passing_grade',label:'Standar passing grade (%)',kind:'number'},
 {key:'learning.default_sequential',label:'Default pembelajaran berurutan',kind:'boolean'},
 {key:'learning.default_delivery_mode',label:'Default mode belajar',kind:'mode'},
 {key:'certificate.issuer_name',label:'Nama penerbit sertifikat (persiapan)',kind:'text'},
 {key:'certificate.enabled',label:'Penerbitan sertifikat (belum tersedia)',kind:'disabled'}
] as const;
export default function TenantSettings({classId,headers}:{
 classId:string;headers:()=>Record<string,string>
}){
 const [data,setData]=useState<ResponseData|null>(null);
 const [values,setValues]=useState<Record<string,string|number|boolean>>({});
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function load(){
  const res=await fetch('/api/class/'+classId+'/lms/settings',{headers:headers(),cache:'no-store'});
  const body=await res.json();
  if(!res.ok)throw Error(body.error||'Gagal memuat parameter tenant');
  const value=body as ResponseData;
  setData(value);
  setValues(Object.fromEntries(Object.entries(value.effective).map(([k,v])=>[k,v.value])));
 }
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'Gagal memuat parameter')); 
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[classId]);
 async function submit(event:FormEvent<HTMLFormElement>,key:string){
  event.preventDefault();if(busy)return;
  setBusy(key);setNotice('');setError('');
  try{
   const res=await fetch('/api/class/'+classId+'/lms/settings',{
    method:'POST',headers:{...headers(),'Content-Type':'application/json'},
    body:JSON.stringify({key,value:values[key]})
   });
   const body=await res.json();
   if(!res.ok)throw Error(body.error||'Perubahan ditolak');
   await load();setNotice('Parameter '+key+' tersimpan dan tercatat dalam audit.');
  }catch(e){setError(e instanceof Error?e.message:'Gagal menyimpan');}
  finally{setBusy('');}
 }
 return <section className="workspace-card mt-6 p-5 sm:p-6" aria-labelledby="tenant-settings-title">
  <p className="workspace-eyebrow">TENANT PARAMETERS / SUPER ADMIN</p>
  <h2 id="tenant-settings-title" className="mt-1 text-xl font-extrabold text-slate-900">Pengaturan klien dan nilai efektif</h2>
  <p className="mt-2 text-sm text-slate-600">Perubahan berlaku untuk tenant yang terhubung dengan kelas ini. Kursus yang sudah dibuat tidak diubah otomatis. Hanya Super Admin terotorisasi dapat menyimpan.</p>
  {error&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
  {notice&&<p role="status" className="mt-3 rounded-lg bg-teal-50 p-3 text-sm text-teal-900">{notice}</p>}
  {!data?<p className="mt-4 text-sm text-slate-500">Memuat parameter…</p>:
   <><p className="mt-3 break-all text-xs text-slate-500">Tenant ID: {data.organizationId}</p>
   <div className="mt-4 grid gap-3 md:grid-cols-2">
    {fields.map(field=>{
     const item=data.effective[field.key];
     if(!item)return null;
     const disabled=field.kind==='disabled';
     return <form key={field.key} onSubmit={e=>void submit(e,field.key)}
      className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label className="mb-2 block text-sm font-bold text-slate-800" htmlFor={'param-'+field.key}>{field.label}</label>
      {field.kind==='boolean'||field.kind==='disabled'?
       <input id={'param-'+field.key} type="checkbox" disabled={disabled}
        checked={Boolean(values[field.key])}
        onChange={e=>setValues(v=>({...v,[field.key]:e.target.checked}))}/>:
       field.kind==='mode'?
        <select id={'param-'+field.key} className="field-input" value={String(values[field.key])}
         onChange={e=>setValues(v=>({...v,[field.key]:e.target.value}))}>
         <option value="live">Live</option><option value="self_paced">Self-Paced</option><option value="blended">Blended</option>
        </select>:
        <input id={'param-'+field.key} className="field-input" required={field.kind!=='url'}
         type={field.kind==='color'?'color':field.kind==='number'?'number':field.kind==='url'?'url':'text'}
         min={field.kind==='number'?0:undefined} max={field.kind==='number'?100:undefined}
         minLength={field.kind==='text'?2:undefined} maxLength={field.kind==='url'?512:field.kind==='text'?160:undefined}
         value={String(values[field.key]??'')}
         onChange={e=>setValues(v=>({...v,[field.key]:field.kind==='number'?Number(e.target.value):e.target.value}))}/>}
      <div className="mt-3 flex items-center justify-between gap-2">
       <span className="text-xs text-slate-500">{item.source==='tenant'?'Override tenant':'Default global'} · revisi {data.revisions[field.key]||0}</span>
       <button className="tl-staff-button" type="submit" disabled={disabled||Boolean(busy)||values[field.key]===item.value}>
        {busy===field.key?'Menyimpan…':'Simpan'}</button>
      </div>
     </form>;
    })}
   </div></>}
 </section>;
}

