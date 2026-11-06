'use client';
import {useParams} from 'next/navigation';
import {useEffect,useState} from 'react';

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
type IconName='arrow'|'chart'|'refresh'|'download'|'check'|'file'|'users'|'lock'|'spark'|'trend'|'clipboard';

function Icon({name,size='h-5 w-5'}:{name:IconName;size?:string}){
 return <svg viewBox="0 0 24 24" className={size} fill="none" stroke="currentColor"
  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {name==='arrow'&&<><path d="m15 18-6-6 6-6"/><path d="M9 12h11"/></>}
  {name==='chart'&&<><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 16v-4m5 4V8m5 8v-6"/></>}
  {name==='refresh'&&<><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.7 9a7 7 0 0 1 12.1-2L20 12M4 12l2.2 5A7 7 0 0 0 18 15"/></>}
  {name==='download'&&<><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/></>}
  {name==='check'&&<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>}
  {name==='file'&&<><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10Z"/><path d="M13 3v7h7M8 15h8m-8 3h5"/></>}
  {name==='users'&&<><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/></>}
  {name==='lock'&&<><rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/></>}
  {name==='spark'&&<><path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2Z"/></>}
  {name==='trend'&&<><path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/></>}
  {name==='clipboard'&&<><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V3h6v2m-6 6h6m-6 4h6"/></>}
 </svg>;
}

export default function ClassReport(){
 const classId=useParams<{classId:string}>().classId;
 const [token,setToken]=useState(''),[data,setData]=useState<Report|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [loginMode,setLoginMode]=useState<'checking'|'sso_login'|'sso_ready'|'manual'|'blocked'>('checking');
 const [copied,setCopied]=useState(false);
 const access=loginMode==='sso_ready'||(loginMode==='manual'&&Boolean(token));
 const authHeaders=():Record<string,string>=>loginMode==='manual'&&token
  ?{Authorization:'Bearer '+token}:{};

 useEffect(()=>{
  let mounted=true;
  fetch('/api/auth/staff/status?classId='+encodeURIComponent(classId),{cache:'no-store'})
   .then(async r=>{if(!r.ok)throw Error('status unavailable');return r.json()})
   .then(s=>{if(mounted)setLoginMode(s.authenticated?'sso_ready':
    s.configured?'sso_login':s.manualAllowed?'manual':'blocked')})
   .catch(()=>{if(mounted)setLoginMode('blocked')});
  return()=>{mounted=false};
 },[classId]);

 async function logout(){
  await fetch('/api/auth/staff/logout',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({classId})}).catch(()=>{});
  window.location.assign('/host/'+classId);
 }
 async function load(){
  setBusy(true);setError('');
  try{
   const res=await fetch('/api/class/'+classId+'/report',
    {headers:authHeaders(),cache:'no-store'});
   if(!res.ok)throw Error(res.status===403?'Akun staf tidak memiliki izin untuk kelas ini.':'Laporan tidak dapat dimuat.');
   setData(await res.json());
  }catch(e){setError(e instanceof Error?e.message:'Kesalahan laporan');}
  finally{setBusy(false)}
 }
 async function exportFile(format:'csv'|'xlsx'|'pdf'){
  setBusy(true);setError('');
  try{
   const res=await fetch('/api/class/'+classId+'/export?format='+format,
    {headers:authHeaders(),cache:'no-store'});
   if(!res.ok)throw Error('Ekspor ditolak: '+res.status);
   const blob=await res.blob(),link=document.createElement('a');
   const objectUrl=URL.createObjectURL(blob);
   link.href=objectUrl;link.download='trainlive_'+classId+'_participants.'+format;
   document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),2000);
  }catch(e){setError(e instanceof Error?e.message:'Ekspor gagal');}
  finally{setBusy(false);}
 }
 async function copyId(){
  try{await navigator.clipboard.writeText(classId);setCopied(true)}
  catch{setError('ID kelas tidak dapat disalin pada perangkat ini.')}
 }

 const summary=data?.summary;
 const metrics=summary?[
  {label:'Peserta terdaftar',value:summary.participants.toLocaleString('id-ID'),detail:'Total peserta kelas',icon:'users' as IconName},
  {label:'Pre-test masuk',value:summary.pre_submitted.toLocaleString('id-ID'),detail:'Evaluasi awal',icon:'clipboard' as IconName},
  {label:'Post-test masuk',value:summary.post_submitted.toLocaleString('id-ID'),detail:'Evaluasi akhir',icon:'file' as IconName},
  {label:'Nilai post-test ≥ 75',value:summary.post_pass_75.toLocaleString('id-ID'),detail:'Peserta mencapai batas',icon:'check' as IconName},
  {label:'Tingkat kelulusan',value:summary.post_pass_pct_of_enrolled+'%',detail:'Dari total peserta',icon:'chart' as IconName},
  {label:'Kenaikan rata-rata',value:summary.paired_mean_gain===null?'—':summary.paired_mean_gain+' poin',detail:'Peserta dengan nilai lengkap',icon:'trend' as IconName}
 ]:[];

 return <main className="trainlive-workspace min-h-screen pb-20">
  <header className="workspace-nav">
   <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
    <a href="/" className="flex items-center gap-3 text-white no-underline" aria-label="TrainLive — Beranda">
     <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#5eead4] text-[#08263b] shadow-lg shadow-black/10">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-6 w-6" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" strokeLinejoin="round"/><path d="M4 6v12" strokeLinecap="round"/></svg>
     </span>
     <span className="text-xl font-extrabold tracking-[-.04em]">Train<span className="text-[#5eead4]">Live</span></span>
     <span className="hidden border-l border-white/20 pl-3 text-xs font-medium text-slate-300 sm:inline">Workspace Fasilitator</span>
    </a>
    <a className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-bold text-white no-underline transition hover:bg-white/20 sm:px-4 sm:text-sm"
     href={'/host/'+classId}><Icon name="arrow" size="h-4 w-4"/> Konsol kelas</a>
   </div>
  </header>

  <div className="report-hero">
   <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-9 sm:px-8 sm:pb-28 sm:pt-12">
    <span className="inline-flex items-center gap-2 rounded-full border border-[#66e9db]/25 bg-[#66e9db]/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[.17em] text-[#9bf9e9]">
     <span className="h-2 w-2 rounded-full bg-[#5eead4]"/> Learning intelligence
    </span>
    <div className="mt-5 flex flex-wrap items-end justify-between gap-7">
     <div className="max-w-2xl">
      <h1 className="text-[clamp(2rem,5vw,3.35rem)] font-extrabold leading-[1.12] tracking-[-.045em] text-white">
       Evaluasi <span className="text-[#79e8d8]">pembelajaran.</span>
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-[#c6d9e4] sm:text-base">
       Pantau kemajuan peserta, pencapaian target, dan kualitas setiap aktivitas dalam satu laporan kelas.
      </p>
     </div>
     <div className="flex max-w-full items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-white backdrop-blur-sm">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-[#79e8d8]"><Icon name="lock"/></span>
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#c6d9e4]">ID Kelas</p>
       <p className="max-w-[180px] truncate font-mono text-sm font-bold" title={classId}>{classId}</p>
      </div>
      <button type="button" onClick={()=>void copyId()} aria-label="Salin ID lengkap kelas"
       className="min-h-9 rounded-lg border border-white/20 px-3 text-xs font-bold text-[#b8fff1] hover:bg-white/10">
       {copied?'Tersalin':'Salin'}
      </button>
     </div>
    </div>
   </div>
  </div>

  <div className="relative z-10 mx-auto -mt-14 max-w-6xl space-y-7 px-5 sm:px-8">
   <section aria-labelledby="report-actions-title" className="workspace-card overflow-hidden p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
     <div><p className="workspace-eyebrow">REPORT CENTER</p>
      <h2 id="report-actions-title" className="mt-1.5 text-xl font-extrabold tracking-tight text-[#0c253b] sm:text-2xl">Laporan & ekspor data</h2>
      <p className="mt-2 text-sm leading-6 text-[#61788b]">Muat hasil terbaru, lalu unduh dalam format yang dibutuhkan.</p>
     </div>
     <span className={'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold '+(loginMode==='sso_ready'?'bg-emerald-50 text-emerald-700':loginMode==='blocked'?'bg-amber-50 text-amber-800':'bg-slate-100 text-slate-600')}>
      <span className={'h-2 w-2 rounded-full '+(loginMode==='sso_ready'?'bg-emerald-500':loginMode==='blocked'?'bg-amber-500':'bg-slate-400')}/>
      {loginMode==='checking'?'Memeriksa akses':loginMode==='sso_ready'?'Staf terverifikasi':loginMode==='sso_login'?'Login diperlukan':loginMode==='manual'?'Akses staging':'Akses belum tersedia'}
     </span>
    </div>

    {loginMode==='sso_login'&&<div className="mt-5 rounded-xl border border-[#b9e6dd] bg-[#edfaf7] p-4 text-sm text-[#245b53]">
     Masuk menggunakan identitas staf dan MFA untuk membuka laporan.
     <a className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#0f766e] px-4 font-bold text-white no-underline hover:bg-[#0c605a]"
      href={'/api/auth/staff/start?classId='+encodeURIComponent(classId)}><Icon name="lock" size="h-4 w-4"/> Masuk SSO + MFA</a>
    </div>}
    {loginMode==='manual'&&<div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
     <label htmlFor="report-staff-token" className="field-label text-amber-950">Token staf (khusus pengujian non-produksi)</label>
     <input id="report-staff-token" type="password" placeholder="Masukkan token staging" autoComplete="off"
      className="field-input" value={token} onChange={e=>setToken(e.target.value)}/>
    </div>}
    {loginMode==='blocked'&&<p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
     SSO/MFA belum tersedia. Laporan dan ekspor hanya bisa diakses staf yang berwenang.
    </p>}
    {loginMode==='checking'&&<p role="status" className="mt-5 text-sm text-slate-500">Memeriksa hak akses laporan…</p>}

    <div className="mt-6 grid gap-5 border-t border-[#e6eef0] pt-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-end">
     <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[.1em] text-[#718596]">Perbarui laporan</p>
      <div className="flex flex-wrap gap-2">
       <button type="button" disabled={busy||!access} onClick={()=>void load()}
        className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0f766e] px-5 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(15,118,110,.16)] transition hover:bg-[#0b5c56] disabled:shadow-none sm:flex-none">
        <Icon name="refresh" size={'h-4 w-4'+(busy?' animate-spin':'')}/>{busy?'Memproses…':data?'Perbarui laporan':'Muat laporan'}
       </button>
       {loginMode==='sso_ready'&&<button type="button" onClick={()=>void logout()}
        className="min-h-12 rounded-xl border border-[#d9e5e8] px-4 text-sm font-bold text-[#53697b] transition hover:bg-slate-50">Keluar</button>}
      </div>
     </div>
     <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[.1em] text-[#718596]">Unduh hasil</p>
      <div className="grid grid-cols-3 gap-2">
       {(['csv','xlsx','pdf'] as const).map(format=><button key={format} type="button" disabled={busy||!data||!access}
        onClick={()=>void exportFile(format)}
        className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-xl border border-[#d2e1e6] bg-white px-2 text-sm font-extrabold text-[#0e655f] transition hover:border-[#62b3a7] hover:bg-[#f0fbf8] disabled:text-slate-400">
        <Icon name="download" size="h-4 w-4"/>{format==='xlsx'?'Excel':format.toUpperCase()}
       </button>)}
      </div>
     </div>
    </div>
    {error&&<p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</p>}
   </section>

   {!data&&<section aria-labelledby="empty-report-title" className="workspace-card report-empty p-6 text-center sm:p-10">
    <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#e7f8f4] text-[#0f766e]"><Icon name="chart" size="h-8 w-8"/></span>
    <p className="workspace-eyebrow mt-6">YOUR CLASS INSIGHTS</p>
    <h2 id="empty-report-title" className="mt-2 text-2xl font-extrabold tracking-tight text-[#102d40]">Laporan kelas siap ditampilkan</h2>
    <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-[#667d8f] sm:text-base">
     {access?'Klik “Muat laporan” untuk melihat ringkasan belajar dan analitik peserta secara real-time.':
      'Verifikasi akses fasilitator terlebih dahulu untuk melihat analitik dan mengunduh laporan kelas.'}
    </p>
    <div className="mx-auto mt-8 grid max-w-3xl gap-3 text-left sm:grid-cols-3">
     <div className="report-preview-tile"><span className="report-preview-icon"><Icon name="users"/></span><h3>Partisipasi</h3><p>Pre-test, post-test, dan kehadiran</p></div>
     <div className="report-preview-tile"><span className="report-preview-icon"><Icon name="trend"/></span><h3>Perkembangan</h3><p>Kenaikan nilai dan pencapaian target</p></div>
     <div className="report-preview-tile"><span className="report-preview-icon"><Icon name="spark"/></span><h3>Kualitas soal</h3><p>Akurasi jawaban di setiap aktivitas</p></div>
    </div>
   </section>}

   {data&&<div className="space-y-7" aria-live="polite">
    <section aria-labelledby="metrics-title">
     <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><p className="workspace-eyebrow">OVERVIEW</p><h2 id="metrics-title" className="mt-1 text-2xl font-extrabold tracking-tight text-[#102d40]">Ringkasan kelas</h2></div>
      <span className="text-xs font-semibold text-[#708595]">Data dari laporan kelas terkini</span>
     </div>
     <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {metrics.map(m=><article key={m.label} className="workspace-card flex items-start justify-between gap-3 p-5">
       <div><p className="text-sm font-semibold text-[#61788b]">{m.label}</p>
        <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#102d40]">{m.value}</p>
        <p className="mt-1 text-xs text-[#889ba7]">{m.detail}</p>
       </div>
       <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e7f8f4] text-[#0f766e]"><Icon name={m.icon}/></span>
      </article>)}
     </div>
    </section>

    <section aria-labelledby="targets-title" className="workspace-card p-5 sm:p-7">
     <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="workspace-eyebrow">LEARNING OUTCOMES</p><h2 id="targets-title" className="mt-1 text-xl font-extrabold text-[#102d40]">Pencapaian target kelas</h2></div>
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#eaf5fb] text-[#16668a]"><Icon name="trend"/></span>
     </div>
     <div className="mt-5 grid gap-3 md:grid-cols-2">
      <div className="rounded-2xl border border-[#e2eaec] bg-[#f8fbfa] p-4">
       <p className="text-sm font-bold text-[#203b4e]">≥ 80% peserta meraih nilai ≥ 75</p>
       <span className={'mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold '+(summary?.target_post_met?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-900')}>
        <Icon name={summary?.target_post_met?'check':'chart'} size="h-4 w-4"/>{summary?.target_post_met?'Target tercapai':'Belum tercapai'}
       </span>
      </div>
      <div className="rounded-2xl border border-[#e2eaec] bg-[#f8fbfa] p-4">
       <p className="text-sm font-bold text-[#203b4e]">Kenaikan rata-rata ≥ 20 poin</p>
       <span className={'mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold '+(summary?.target_gain_met?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-900')}>
        <Icon name={summary?.target_gain_met?'check':'chart'} size="h-4 w-4"/>{summary?.target_gain_met?'Target tercapai':'Belum tercapai'}
       </span>
      </div>
     </div>
     <p className="mt-4 text-xs leading-6 text-[#718596]">{summary?.target_definitions}</p>
    </section>

    <section aria-labelledby="participant-results-title" className="workspace-card overflow-hidden">
     <div className="p-5 sm:p-7"><p className="workspace-eyebrow">PERFORMANCE</p>
      <h2 id="participant-results-title" className="mt-1 text-xl font-extrabold text-[#102d40]">Hasil per peserta</h2>
      <p className="mt-2 text-sm leading-6 text-[#718596]">{summary?.attendance_note}</p>
     </div>
     <div className="overflow-x-auto"><table className="workspace-table w-full min-w-[700px] text-left text-sm">
      <thead><tr>{['Nama peserta','Unit / cabang','Pre','Post','Gain','Aktif (est. menit)','Poin'].map(x=><th key={x} scope="col">{x}</th>)}</tr></thead>
      <tbody>{data.participants.map(p=><tr key={p.participant_id}>
       <td className="font-bold text-[#163b50]">{p.display_name}</td><td>{p.unit}</td>
       <td>{p.pre_score??'—'}</td><td>{p.post_score??'—'}</td>
       <td><span className={p.pre_score!==null&&p.post_score!==null&&p.post_score>p.pre_score?'font-extrabold text-emerald-700':'font-medium'}>{p.pre_score!==null&&p.post_score!==null?(p.post_score>p.pre_score?'+':'')+(p.post_score-p.pre_score):'—'}</span></td>
       <td>{p.heartbeat_count}</td><td className="font-extrabold text-[#0f766e]">{p.quiz_points}</td>
      </tr>)}
      {!data.participants.length&&<tr><td colSpan={7} className="text-center text-slate-500">Belum ada peserta dalam laporan.</td></tr>}
      </tbody>
     </table></div>
    </section>

    <section aria-labelledby="quiz-quality-title" className="workspace-card overflow-hidden">
     <div className="p-5 sm:p-7"><p className="workspace-eyebrow">QUESTION ANALYTICS</p>
      <h2 id="quiz-quality-title" className="mt-1 text-xl font-extrabold text-[#102d40]">Analitik kualitas soal</h2>
      <p className="mt-2 text-sm text-[#718596]">Distribusi jawaban benar membantu mengidentifikasi materi yang perlu diperkuat.</p>
     </div>
     <div className="overflow-x-auto"><table className="workspace-table w-full min-w-[540px] text-left text-sm">
      <thead><tr><th scope="col">Aktivitas</th><th scope="col">Terjawab</th><th scope="col">Benar</th><th scope="col">Akurasi</th></tr></thead>
      <tbody>{data.quizzes.map(q=><tr key={q.item_key}>
       <td className="font-semibold text-[#163b50]">{q.title||q.item_key}</td><td>{q.answered}</td><td>{q.correct}</td>
       <td className="min-w-[135px]"><div className="flex items-center gap-3">
        <div className="h-2 w-16 overflow-hidden rounded-full bg-[#e5eeee]" aria-hidden="true">
         <div className="h-full rounded-full bg-[#0f766e]" style={{width:Math.max(0,Math.min(100,q.correct_pct??0))+'%'}}/>
        </div><span className="font-bold">{q.correct_pct===null?'—':q.correct_pct+'%'}</span>
       </div></td>
      </tr>)}
      {!data.quizzes.length&&<tr><td colSpan={4} className="text-center text-slate-500">Belum ada data kualitas soal.</td></tr>}
      </tbody>
     </table></div>
    </section>
   </div>}

   <footer className="py-3 text-center text-xs leading-6 text-[#788e9b]">
    TrainLive · Laporan pembelajaran terproteksi · Data hanya untuk staf berwenang
   </footer>
  </div>
 </main>;
}
