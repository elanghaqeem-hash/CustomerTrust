import {notFound} from 'next/navigation';
import {LMS_ENABLED} from '@/lib/lms-flags';
import {staffOIDCConfig} from '@/lib/staff-oidc';
export const dynamic='force-dynamic';
export default async function TenantLoginPage({params}:{params:Promise<{tenantId:string}>}){
 const {tenantId}=await params;
 if(!LMS_ENABLED||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId))notFound();
 const configured=Boolean(staffOIDCConfig());
 return <main className="trainlive-admin-login">
  <header className="workspace-nav text-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
   <a href="/" className="text-xl font-extrabold tracking-tight text-white no-underline">Train<span className="text-[#5eead4]">Live</span></a>
   <span className="rounded-full border border-white/20 px-3 py-2 text-[11px] font-bold tracking-wider text-[#cde7e5]">TENANT ADMIN</span>
  </div></header>
  <div className="tl-login-wrap"><div className="tl-login-grid">
   <aside className="tl-login-feature"><span className="text-[11px] font-bold uppercase tracking-[.17em] text-[#82ead8]">TENANT WORKSPACE</span>
    <h2>Kelola program pembelajaran organisasi Anda.</h2>
    <p>Masuk menggunakan identitas perusahaan yang menerima undangan Tenant Admin.</p>
    <div className="tl-login-feature-list"><span>✓ Program & katalog tenant</span><span>✓ Parameter dan white-label</span><span>✓ Approval maker-checker</span></div>
   </aside>
   <section className="tl-login-panel" aria-labelledby="tenant-login-title">
    <span className="tl-login-badge">● &nbsp; Login Tenant Admin · SSO + MFA</span>
    <h1 id="tenant-login-title">Masuk ke workspace klien.</h1>
    <p className="mt-4">Gunakan email yang menerima undangan. Akses tenant diverifikasi kembali pada database setiap permintaan.</p>
    {configured
     ? <a href={'/api/auth/staff/start?role=tenant_admin&tenantId='+encodeURIComponent(tenantId)}
        className="tl-staff-button mt-8 w-full">Masuk melalui SSO + MFA <span aria-hidden="true">→</span></a>
     : <div role="alert" className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
        SSO/MFA belum dikonfigurasi. Login Tenant Admin belum dapat digunakan.
       </div>}
    <p className="mt-5 break-all text-xs text-slate-500">Tenant reference: {tenantId}</p>
    <div className="tl-security-note"><p><strong className="text-[#123a4b]">Akses terlindungi.</strong> Halaman ini tidak membuat akun. Akun baru hanya dibuat ketika undangan aktif cocok dengan email OIDC terverifikasi.</p></div>
    <a className="mt-7 inline-flex min-h-11 items-center text-sm font-bold text-[#0c766e] underline" href="/">← Kembali ke TrainLive</a>
   </section>
  </div></div>
 </main>;
}
