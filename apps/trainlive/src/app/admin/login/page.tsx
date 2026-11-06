import {staffOIDCConfig} from '@/lib/staff-oidc';
export const dynamic='force-dynamic';

export default function AdminLoginPage(){
 const configured=Boolean(staffOIDCConfig());
 return <main className="min-h-screen bg-paper">
  <header className="bg-navy px-5 py-5 text-white">
   <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
    <a href="/" className="text-xl font-extrabold">Train<span className="text-[#55d3c2]">Live</span></a>
    <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">Area Administrator</span>
   </div>
  </header>
  <div className="mx-auto max-w-lg px-5 py-16">
   <section aria-labelledby="admin-title" className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
    <div className="mb-4 inline-flex rounded-full bg-[#eaf6f1] px-4 py-2 text-sm font-bold text-teal">
     Login staf terverifikasi
    </div>
    <h1 id="admin-title" className="text-3xl font-extrabold text-navy">Login Administrator</h1>
    <p className="mt-4 text-slate-600">
     Kelola kelas training dan kode peserta melalui akun Super Admin yang telah disetujui.
     Akses menggunakan SSO perusahaan dan verifikasi multi-faktor (MFA).
    </p>
    {configured
     ? <a href="/api/auth/staff/start?role=admin"
        className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-teal px-6 py-4 text-center font-bold text-white hover:bg-[#095755]">
        Masuk sebagai Admin (SSO + MFA)
       </a>
     : <div role="status" className="mt-7 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
        Login Administrator belum dibuka karena konfigurasi penyedia SSO/MFA produksi belum lengkap.
       </div>}
    <p className="mt-5 text-sm text-slate-600">
     Hanya akun yang telah ditugaskan sebagai fasilitator dan dipromosikan menjadi Super Admin
     oleh operator berwenang yang dapat masuk. Tautan ini tidak membuat atau mengaktifkan akun baru.
    </p>
    <a className="mt-6 inline-block text-sm font-semibold text-teal underline" href="/">
      Kembali ke halaman peserta
    </a>
   </section>
  </div>
  <footer className="border-t border-slate-200 px-5 py-6 text-center text-sm text-slate-500">
   TrainLive · Administrator · SSO/MFA
  </footer>
 </main>;
}
