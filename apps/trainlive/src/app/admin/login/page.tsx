import {staffOIDCConfig} from '@/lib/staff-oidc';
export const dynamic='force-dynamic';

export default function AdminLoginPage(){
 const configured=Boolean(staffOIDCConfig());
 return <main className="trainlive-admin-login">
  <header className="workspace-nav text-white"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
   <a href="/" className="flex items-center gap-3 text-xl font-extrabold tracking-tight text-white no-underline">
    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#5eead4] text-[#09283e]">▶</span>
    <span>Train<span className="text-[#5eead4]">Live</span></span>
   </a><span className="rounded-full border border-white/20 px-3 py-2 text-[11px] font-bold tracking-wider text-[#cde7e5]">ADMINISTRATOR</span>
  </div></header>
  <div className="tl-login-wrap"><div className="tl-login-grid">
   <aside className="tl-login-feature">
    <span className="text-[11px] font-bold uppercase tracking-[.17em] text-[#82ead8]">TRAINLIVE • STAFF WORKSPACE</span>
    <h2>Satu tempat untuk semua momen belajar.</h2>
    <p>Kelola aktivitas, pantau partisipasi, dan evaluasi training dalam satu workspace yang lebih sederhana.</p>
    <div className="tl-login-feature-list" aria-label="Fitur administrator">
     <span>✓ Manajemen kelas</span><span>✓ Kuis & polling</span><span>✓ Laporan pembelajaran</span>
    </div>
   </aside>
   <section className="tl-login-panel" aria-labelledby="admin-title">
    <span className="tl-login-badge">● &nbsp; Login Administrator · Akses khusus staf</span>
    <h1 id="admin-title">Selamat datang kembali.</h1>
    <p className="mt-4">Masuk ke area administrator menggunakan akun staf dengan peran Super Admin yang telah disetujui.</p>
    {configured
     ? <a href="/api/auth/staff/start?role=admin" className="tl-staff-button mt-8 w-full">Masuk dengan SSO + MFA <span aria-hidden="true">→</span></a>
     : <div role="status" className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
        Login Administrator belum tersedia karena konfigurasi penyedia SSO/MFA produksi belum lengkap.
       </div>}
    <div className="tl-security-note"><p><strong className="text-[#123a4b]">Akses terlindungi.</strong> Hanya akun yang telah diberi kewenangan Super Admin oleh operator berwenang yang dapat masuk. Halaman ini tidak membuat atau mengaktifkan akun baru.</p></div>
    <a className="mt-7 inline-flex min-h-11 items-center text-sm font-bold text-[#0c766e] underline" href="/">← Kembali ke halaman peserta</a>
   </section>
  </div></div>
 </main>;
}
