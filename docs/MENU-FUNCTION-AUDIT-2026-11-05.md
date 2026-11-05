# Audit menu & fungsi TrainLive — 5 November 2026

**Repository:** `elanghaqeem-hash/CustomerTrust` · **Branch produksi:** `main` · **Aplikasi:** `apps/trainlive` · **URL:** https://ct-kohl.vercel.app/

## Metode dan batas audit

Audit sumber mencakup halaman Next.js, rute API, skema dan policy RLS, laporan/ekspor, serta issue produksi #2–#8. **Status “tersedia di kode” tidak sama dengan hasil UAT browser, lolos keamanan, atau siap produksi.** Koneksi database produksi dan SSO/MFA belum tersedia menurut issue dan catatan deploy per 5 November 2026.

## Matriks menu, fungsi, dan status

| Portal / menu | Rute | Fungsi | Status audit kode | Syarat verifikasi |
|---|---|---|---|---|
| Gabung kelas | `/` · `POST /api/join` | Kode enam karakter, identitas, persetujuan, limit 25, rate-limit | Tersedia, fail-closed saat setup | Join sukses pada DB staging; validasi kode dan kapasitas |
| Peserta / Aktivitas | `/class/:id` | Poll, kuis skenario, jawaban terbuka, pre/post, waktu | Tersedia di kode | UAT 25 browser, timer & duplicate submit |
| Peserta / Rundown | `/class/:id` | Urutan aktivitas dan status dibuka/dibahas | **Dilengkapi pada audit ini** | UAT navigasi, tidak membocorkan kunci |
| Peserta / Skor | `/class/:id` · leaderboard API | Top 10 per kelas | Tersedia di kode | Verifikasi ledger dan isolasi kelas |
| Peserta / LK1–LK5 | `/class/:id/worksheets` | Draf, autosave, submit, LK2 otomatis | Tersedia di kode | UAT timeout, autosave, lock dan RF1–RF4 |
| Fasilitator / Konsol | `/host/:id` | Run item open/close/reveal, monitoring jawaban | Tersedia; **menu dan filter diperbaiki** | Peran fasilitator/cohost, status item, resubmit |
| Fasilitator / Moderasi | `/host/:id` | Bacakan +5 poin, hide/unhide, audit | Tersedia di kode | UAT moderasi dan poin idempoten |
| Observer | `/host/:id` | Monitoring read-only | **Kontrol tombol ditutup untuk Observer** | UAT negatif role + DB RLS |
| Laporan & ekspor | `/host/:id/report` | Pre/post, statistik peserta, CSV/XLSX/PDF | Tersedia; **link ditambahkan dari konsol** | UAT file unduh, audit, keamanan CSV |
| Identitas staf | `/api/auth/staff/*` | SSO OIDC/MFA dan cookie staf | Kode tersedia, **belum diaktivasi IdP** | OIDC live, MFA, revoke, RBAC |
| Dashboard admin kelas | CLI `tools/trainlive/` | Pembuatan kelas, seed, penugasan | **Tidak tersedia sebagai menu web** | Desain autentikasi admin dan alur persetujuan |
| Notifikasi realtime | UI poll 3 detik | Refresh aktivitas/leaderboard | **Belum WebSocket** | Provider & uji p95 <1 detik, issue #5 |
| Follow-up H+1/H+7/H+30/H+60 | `followup` table | Pengiriman terjadwal | **Belum terotomasi** | Consent dan vendor pesan, issue #7 |

## Perbaikan UI dalam pull request audit

1. Tambah menu **Konsol Kelas** dan **Laporan & Ekspor** pada portal fasilitator.
2. Tambah pencarian judul/kode/modul, filter status, serta tombol **Lihat hasil** agar fasilitator dan observer bisa memeriksa item yang sudah ditutup.
3. Perbaiki tombol **Tutup** agar nonaktif pada observer. Penolakan server dan RLS tetap wajib.
4. Tambah tab **Rundown** pada portal peserta, menampilkan status tanpa kunci sebelum reveal.
5. Tambah **Coba muat ulang** setelah gangguan jaringan dan rekonsiliasi respons HTTP 409 `already submitted` agar peserta mendapatkan umpan balik penyimpanan yang benar saat retry.

## Pengujian yang diwajibkan untuk menutup audit

- [ ] Build Next.js, TypeScript, CI database/RLS dan REST smoke tests lulus pada SHA yang tepat
- [ ] 25 peserta sintetis, 1 kelas aktif, 1 kelas lain untuk uji isolasi
- [ ] Pre-test (10 soal), 11 kuis skenario, polling anonim dan chat terbuka
- [ ] LK1–LK5 termasuk autosave, submit, due date, dan LK2 otomatis
- [ ] Host membuka/menutup/reveal; top-10 tidak memberi poin ganda
- [ ] Observer dapat melihat tetapi **tidak** melakukan mutasi, di UI maupun API
- [ ] Laporan CSV, XLSX, PDF dapat dibuka dan tidak memuat kelas lain
- [ ] Verifikasi negatif token usang, cross-origin write, dan input sensitif
- [ ] SSO/MFA IdP, DB non-owner RLS, seed resmi, backup/PITR dan readiness 200 lulus
- [ ] Kelayakan aksesibilitas WCAG 2.2 AA dan pengujian beban staging

## Keputusan rilis

**NO-GO untuk peserta bank sungguhan** sampai issue P0 #2, #3, #4 diselesaikan dan disetujui. Perbaikan UI pada audit ini dapat di-review/test di branch atau preview, tetapi status **READY** pada Vercel sendiri tidak membuktikan sistem operasional. Jangan menaruh kredensial maupun data nasabah di repository, issue, atau log.
