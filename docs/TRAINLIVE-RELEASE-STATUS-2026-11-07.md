# TrainLive — catatan rilis non-Vercel (7 November 2026)

Source of truth: [CustomerTrust](https://github.com/elanghaqeem-hash/CustomerTrust).

## Status terverifikasi

- `main` (sebelum perubahan runbook ini): `c128f5312525a9355bd84f08599cab681aa166cc`. Pipeline GitHub CI `42317456505` berhasil.
- Neon project `trainlive-production` (project ID `lively-queen-17136260`, default branch `production`) telah mempunyai migration 001–015, 6 kelas aktif/terjadwal dan 6 peserta tersimpan pada saat verifikasi.
- **Konten CTC v2 sudah terpublikasi secara additive pada production Neon**: 17 aktivitas, 5 worksheets, sesuai persis `seed/customer-trust-challenge.v2.json`. Versi 1 tetap terpublikasi dengan 16 aktivitas dan 5 worksheets; semua enam sesi lama tetap menggunakan snapshot v1.
- Sebuah salinan QA Neon bernama `trainlive-v2-release-qa-20261107` dibuat sebelum publikasi. Di salinan ini, migration 016 (LMS P0) dan 017 (LMS P1) berhasil diterapkan dalam transaksi terpisah. Pemeriksaan QA: sembilan fungsi LMS, RLS aktif untuk seluruh tabel LMS, nol hak akses tabel langsung bagi role `trainlive_app`, serta jumlah kelas/peserta lama tidak berubah.
- Migration 016/017 **belum dijalankan di production**. Kode LMS berada pada PR [#35](https://github.com/elanghaqeem-hash/CustomerTrust/pull/35) dan [#36](https://github.com/elanghaqeem-hash/CustomerTrust/pull/36); keduanya memerlukan review isolasi, UAT browser, dan verifikasi akses staf sebelum rilis.
- Rilis Vercel di luar cakupan pelaksanaan ini. Jangan menyamakan migrasi/seed berhasil dengan deployment aplikasi terbaru.

## Workflow database manual

GitHub Actions: `.github/workflows/trainlive-production-db.yml`. Jalankan hanya pada branch `main` menggunakan protected environment `production` dan secret `DATABASE_URL_ADMIN`; jangan menyalin kredensial ke log.

- `status`: memeriksa checksum dan status migrasi **tanpa membuat skema, tabel atau mengubah grants**; exit code 2 berarti ada migrasi tertunda.
- `seed-only`: memvalidasi seed dan menerbitkan hanya versi konten baru secara immutable; **tidak menerapkan migration**. Memerlukan input konfirmasi `APPROVE-PRODUCTION-DB`.
- `migrate-and-seed`: menerapkan migration setelah pemeriksaan backup/approval lalu menerbitkan konten. Memerlukan input konfirmasi yang sama.

Saat kode LMS 016/017 masuk `main`, pilihan `seed-only` dapat memperbarui konten tanpa secara tidak sengaja menerapkan migration LMS yang belum disetujui. Jangan mengaktifkan tindakan DB write tanpa snapshot/restore drill dan review perubahan.

## Gerbang rilis selanjutnya

1. Review P0/P1 functions SECURITY DEFINER, RLS, role isolation, dan auth SSO/MFA; jalankan CI dan UAT dengan PostgreSQL test yang disposable.
2. Saat akan menerapkan 016/017 di produksi, lakukan approval terpisah, backup/pemulihan, verifikasi checksum migrasi, dan ujikan setelahnya; pertahankan kelas/versi konten lama.
3. Tes fasilitator, Super Admin, peserta, kuis, lembar kerja, skor, dan penggunaan LMS di sesi terisolasi.
4. Deploy aplikasi melalui proses produksi terpisah setelah kuota atau penyedia hosting siap; periksa commit yang benar-benar aktif.

Tidak ada rahasia autentikasi atau data nasabah yang disimpan dalam catatan ini.
