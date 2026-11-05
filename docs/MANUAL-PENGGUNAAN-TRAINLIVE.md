# MANUAL PENGGUNAAN TRAINLIVE

**Panduan Pengguna, Fasilitator, dan Administrator**  
**Studi Kasus:** Customer Trust Challenge — PT Bank Pembangunan Daerah Sulawesi Tengah  
**Versi:** 1.0 | **Tanggal:** 5 November 2026 | **Bahasa:** Indonesia  
**Rujukan sistem:** [https://ct-kohl.vercel.app/](https://ct-kohl.vercel.app/)  
**Source of truth:** [Repository CustomerTrust — branch main](https://github.com/elanghaqeem-hash/CustomerTrust)

> **STATUS OPERASIONAL — BELUM DIBUKA UNTUK PESERTA NYATA.** Antarmuka TrainLive telah dibangun, namun berdasarkan verifikasi repository tanggal 5 November 2026, produksi belum siap digunakan: health check masih `503 setup_required`, database aplikasi produksi belum dikonfigurasi, dan identitas staf SSO/MFA belum tersedia. Petunjuk di bawah menjelaskan alur aplikasi yang diimplementasikan dan langkah persiapan teknis, **bukan** konfirmasi bahwa pelatihan dengan data peserta nyata dapat segera dilaksanakan.

## 1. Ringkasan dan tujuan

TrainLive adalah aplikasi web untuk interaksi training individual bersamaan dengan Zoom atau Microsoft Teams. Peserta mengakses dari HP/laptop tanpa memasang aplikasi, menerima aktivitas saat fasilitator membukanya, lalu dapat mengirim jawaban dan menyusun lembar kerja pribadi. Setiap kelas memakai kode akses dan data terpisah.

**Isi paket kelas Customer Trust Challenge:** pre-test 10 pertanyaan, satu pertanyaan terbuka (*chat warm-up*), satu polling multi-pilihan, 11 kuis skenario, post-test 10 pertanyaan, evaluasi enam pertanyaan, serta lima lembar kerja LK1–LK5. Kapasitas awal yang dikonfigurasi oleh alat pembentukan kelas adalah **25 peserta/kelas**; sesi pelatihan dijadwalkan pukul **09.00–16.00 WITA**.

**Dokumen ini diperuntukkan bagi:** (1) peserta, (2) trainer/fasilitator serta co-host yang ditugaskan, (3) administrator/operator teknis. Prosedur administrator seperti pembuatan kelas dan penyediaan akses staf saat ini menggunakan alat terkontrol, belum seluruhnya tersedia sebagai menu web.

### 1.1 Peta alur pelaksanaan

1. **Administrator:** siapkan infrastruktur, konten dan kelas → hasilkan kode kelas dan identitas kelas.
2. **Fasilitator:** hubungkan konsol staf khusus kelas → buka, tutup dan bahas aktivitas → pantau respons.
3. **Peserta:** buka situs → isi kode, identitas dan persetujuan → ikuti aktivitas serta isi LK1–LK5.
4. **Fasilitator:** lihat Top 10, moderasi jawaban terbuka → buka laporan → ekspor hasil kelas.
5. **Penyelenggara:** evaluasi pembelajaran dan tindak lanjut di luar sistem sesuai persetujuan serta kebijakan retensi.

## 2. Persyaratan, peran, dan alamat akses

### 2.1 Persyaratan minimum pengguna

- Gunakan HP Android/iPhone atau laptop dengan browser modern; pastikan koneksi internet stabil. Tidak ada instalasi aplikasi tambahan.
- Buka Zoom/Microsoft Teams di aplikasi atau tab tersendiri, sementara TrainLive tetap terbuka agar aktivitas baru muncul otomatis.
- Siapkan **kode kelas enam karakter** dari panitia. Kode hanya berlaku dalam jendela masuk yang ditentukan penyelenggara.
- Untuk peserta, siapkan nama panggilan dan unit/cabang; email bersifat opsional.
- Jangan memasukkan data nasabah atau informasi bank yang bersifat rahasia ke jawaban, chat, maupun lembar kerja.

### 2.2 Perbedaan peran

| Peran | Akses dan tugas utama | Batasan penting |
|---|---|---|
| Peserta | Masuk dengan kode kelas; mengisi tes, polling, kuis, chat, LK1–LK5; melihat Skor kelas | Hanya mengakses data kelasnya; tidak mengendalikan aktivitas |
| Fasilitator/co-host | Membuka/menutup/reveal aktivitas, memantau respons, memoderasi chat, melihat skor dan laporan | Wajib ditugaskan ke kelas; autentikasi staf produksi belum tersedia |
| Observer (ditugaskan) | Dapat diberi kewenangan membaca laporan/ekspor sesuai penugasan | Tidak diasumsikan dapat menjalankan kontrol aktivitas |
| Administrator/operator teknis | Menyiapkan database, seed konten, membuat kelas, menetapkan staf dan memverifikasi kesehatan sistem | Memerlukan akses manajemen tepercaya, bukan menu publik |

### 2.3 Alamat yang digunakan

| Keperluan | Alamat / pola |
|---|---|
| Halaman masuk peserta | `https://ct-kohl.vercel.app/` |
| Halaman kelas peserta | `/class/{CLASS_UUID}` (terbuka setelah berhasil bergabung) |
| Lembar kerja pribadi | `/class/{CLASS_UUID}/worksheets` |
| Konsol fasilitator | `/host/{CLASS_UUID}` |
| Laporan fasilitator | `/host/{CLASS_UUID}/report` |
| Pemeriksaan kesiapan | `/api/health` — operator harus memperoleh HTTP 200 `ready:true` |

`{CLASS_UUID}` adalah identitas kelas yang dibuat oleh administrator; **bukan** kode enam karakter peserta. URL di atas adalah pola rute aplikasi, bukan tautan kelas aktif.

## 3. Panduan peserta — bergabung dengan kelas

### Langkah 1 — buka aplikasi

1. Buka alamat TrainLive di browser HP/laptop.
2. Pada panel **Masuk ke kelas**, pastikan sistem tidak menampilkan pesan **Sistem sedang dalam persiapan. Pendaftaran peserta belum dibuka.** Jika pesan ini tampil, jangan mengulangi pendaftaran; hubungi panitia.
3. Masukkan **Kode kelas** enam karakter dari fasilitator (huruf besar/angka sesuai kode). Kode dapat terisi otomatis jika panitia memberikan tautan dengan parameter `?code=...`.

### Langkah 2 — isi identitas dan persetujuan

1. Isi **Nama panggilan** (nama yang tampil pada papan skor).
2. Isi **Unit / Cabang**, misalnya Cabang Palu.
3. Isi **Email (opsional)** jika memang diperlukan untuk administrasi pelatihan.
4. Baca dan centang persetujuan pemrosesan nama panggilan, unit, jawaban, skor, dan kehadiran untuk training.
5. Klik **Gabung Kelas**. Sistem membawa peserta ke halaman kelas setelah permintaan diterima.

> **Penting:** jangan memakai identitas nasabah sebagai nama panggilan, jangan membagikan kode kelas secara publik, dan jangan mengirim ulang pendaftaran jika Anda sudah berada dalam kelas kecuali diminta operator.

### Langkah 3 — kenali tampilan kelas

- Tombol **Aktifkan suara dan notifikasi saat kuis dibuka**: pilihan sukarela untuk suara singkat, notifikasi browser jika diizinkan, dan tanda judul tab berkedip saat kuis/fokus dibuka. Browser dapat membatasi suara/notifikasi.
- **Isi Lembar Kerja LK1–LK5**: menuju formulir kerja individual.
- Tab **Aktivitas**: menampilkan pertanyaan yang sedang dibuka, timer, dan pembahasan yang sudah diumumkan.
- Tab **Skor kelas**: melihat **Top 10** berdasarkan poin kelas.
- Pesan **Menunggu fasilitator** berarti belum ada item aktif; tetap buka halaman dan tunggu. Tampilan memperbarui sekitar setiap tiga detik.

## 4. Panduan peserta — menjawab aktivitas

### 4.1 Pre-test dan post-test

1. Saat fasilitator membuka **Pre-Test** atau **Post-Test**, pertanyaan tampil dalam tab Aktivitas.
2. Pilih satu jawaban A/B/C/D pada **setiap pertanyaan**. Satu paket terdiri dari 10 pertanyaan.
3. Perhatikan waktu yang disediakan sistem (konten awal mengatur **300 detik** untuk masing-masing tes).
4. Klik **Kirim Jawaban** sebelum timer berakhir; pastikan muncul pesan **Jawaban Anda telah tersimpan.**
5. Jawaban yang terkirim tidak dapat diubah melalui tampilan peserta. Jika waktu habis, beri tahu fasilitator; jangan menganggap jawaban otomatis tersimpan.

### 4.2 Polling

1. Ketika aktivitas berlabel **POLLING** dibuka, baca instruksi dengan cermat.
2. Pada polling Customer Trust, pilih **maksimal dua** perilaku yang relevan.
3. Klik **Kirim Jawaban** sebelum batas waktu (konten awal: 45 detik).
4. Polling ini dirancang anonim pada level penyimpanan respons; tidak berarti pengguna boleh mengirim informasi rahasia.

### 4.3 Kuis skenario / Red Flag

1. Baca kasus singkat dan pertanyaan sampai selesai.
2. Pilih jawaban sesuai opsi yang tersedia. Klik **Kirim Jawaban** selama aktivitas berstatus terbuka.
3. Perhatikan timer dan label **FOKUS PENUH** atau **KUIS**; aktifkan notifikasi jika ingin dibantu mengingat aktivitas baru.
4. Setelah fasilitator memilih **Reveal**, lihat **Pembahasan fasilitator**, kunci (jika ditampilkan), penjelasan, serta dasar ketentuan.
5. Jawaban benar pada 11 kuis skenario pilihan tunggal memberikan **10 poin** setelah proses reveal, sesuai aturan penilaian saat ini.

### 4.4 Pertanyaan chat terbuka

1. Ketika label **KETIK DI CHAT** muncul, ketik jawaban singkat sesuai pertanyaan.
2. Klik **Kirim Jawaban**. Pada aktivitas jawaban terbuka, panjang teks dibatasi hingga 1.500 karakter.
3. Fasilitator dapat memilih pesan untuk **Bacakan (+5)** atau **Sembunyikan** jika tidak sesuai. Poin lima diberikan sekali ketika pesan ditandai untuk dibacakan.
4. Jangan menuliskan nama, nomor rekening, NIK, PIN, sandi, data transaksi, atau informasi nasabah lain.

### 4.5 Evaluasi pembelajaran

Saat aktivitas **EVALUASI** dibuka, isi setiap pertanyaan sesuai format yang tersedia (skala 1–5 atau jawaban tulisan) lalu klik **Kirim Jawaban**. Evaluasi tidak sama dengan kuis yang diberi skor benar/salah.

## 5. Panduan peserta — lembar kerja LK1–LK5

1. Pada halaman kelas klik **Isi Lembar Kerja LK1–LK5**.
2. Pilih tab lembar kerja di sisi halaman; pada HP, daftar pilihan dapat digeser secara horizontal.
3. Isi kolom yang tersedia; sistem melakukan **penyimpanan draf otomatis** setelah perubahan, dan menyediakan tombol **Simpan draf**.
4. Periksa seluruh isian sebelum memilih **Kirim Lembar Kerja**. Sistem meminta konfirmasi karena **setelah terkirim lembar kerja terkunci**.
5. Jika berhasil, status menjadi **Sudah dikirim/Terkirim** dan sistem memberikan **20 poin** untuk setiap lembar kerja lengkap yang berhasil dikirim.
6. Tanggal batas waktu, jika tampil, disajikan dalam zona **WITA (Asia/Makassar)**.

### 5.1 Tujuan masing-masing lembar kerja

| Lembar | Nama dan panduan singkat |
|---|---|
| LK1 | **Trust Breaker di Unit Anda:** tulis perilaku, tahap customer journey, dampak, risiko, tindakan pencegahan dan PIC. |
| LK2 | **Red Flag Sheet:** dibuat **otomatis** setelah peserta menjawab RF1–RF4 dan fasilitator telah melakukan reveal untuk keempatnya; berisi ringkasan jawaban, kunci, penjelasan dan dasar ketentuan. Tidak perlu mengisi secara manual. |
| LK3 | **Fair Treatment Checklist:** centang praktik pelayanan yang telah dilakukan, lalu kirim. |
| LK4 | **Mini Self-Assessment:** pilih kelompok kertas kerja dan catat persyaratan, kondisi, bukti, kesenjangan, akar penyebab serta langkah perbaikan. Ini simulasi training, bukan laporan penilaian resmi. |
| LK5 | **30-Day Action Plan:** buat **3–5 inisiatif** dengan masalah, tindakan, PIC, indikator, target tanggal dan bukti yang akan ditunjukkan. |

> **Periksa sebelum mengirim.** Tombol pengiriman mengunci perubahan. Pengiriman draf berbeda dari pengiriman final, dan draf yang disimpan belum berarti tugas selesai.

## 6. Panduan fasilitator — menjalankan kelas

**Prasyarat:** administrator sudah membuat kelas, memuat konten, menetapkan staf, memastikan status kelas **live**, dan menyiapkan autentikasi yang sah. Konsol yang tersedia pada baseline ini masih menggunakan **token staf sementara khusus staging**, bukan prosedur login produksi.

### 6.1 Mengakses konsol (khusus development/staging)

1. Terima **CLASS_UUID** dan token staf khusus kelas melalui saluran aman dari operator yang berwenang.
2. Buka `/host/{CLASS_UUID}` pada environment uji yang telah siap.
3. Tempel token pada kolom **Token staf kelas (sementara)**, kemudian klik **Hubungkan**.
4. Jika ditolak, pastikan token tidak kedaluwarsa, kelas sesuai, dan penugasan staf benar. **Jangan** menaruh token di grup chat, layar presentasi, atau dokumen publik.

**Larangan produksi:** alur menempel JWT sementara tidak boleh dipakai sebagai pengganti SSO/MFA untuk kelas dengan data bank nyata.

### 6.2 Menjalankan item interaktif

1. Pada bagian **Rundown interaktif**, pilih aktivitas sesuai urutan slide/modul.
2. Klik **Buka** untuk mengaktifkan item. Pertanyaan akan muncul di layar peserta dalam siklus pembaruan aplikasi.
3. Pantau jumlah respons pada **Monitor jawaban** (jawaban masuk / peserta terdaftar) dan distribusi pilihan.
4. Klik **Tutup** saat waktu kegiatan selesai atau sesuai kebutuhan fasilitator.
5. Klik **Reveal** untuk menampilkan pembahasan dan memproses poin kuis benar yang memenuhi ketentuan.
6. Lanjutkan ke aktivitas berikutnya; jangan menampilkan kunci sebelum seluruh peserta selesai menjawab.

**Makna status:** `idle` = belum dibuka; `open` = menerima jawaban; `closed` = tidak menerima jawaban; `revealed` = pembahasan telah dibuka. Tombol hanya aktif untuk transisi yang diizinkan sistem.

### 6.3 Moderasi chat dan papan skor

- Pada panel **Chat & moderasi**, baca jawaban terbuka per peserta.
- Tekan **Bacakan (+5)** jika ingin membacakan pesan yang relevan di kelas; poin tercatat satu kali.
- Tekan **Sembunyikan** untuk materi tidak pantas atau sensitif; **Tampilkan** untuk mengembalikan pesan yang disembunyikan jika sudah memenuhi ketentuan.
- Panel **Top 10 kelas** menampilkan peserta, peringkat dan poin. Skor yang sama dibedakan menggunakan waktu menjawab benar, waktu bergabung dan kriteria lain dalam fungsi pemeringkatan.

### 6.4 Memantau kelancaran sesi

- Minta peserta tetap membuka halaman TrainLive sementara pembelajaran utama berlangsung di Zoom/Teams.
- Ingatkan agar peserta mengirim jawaban **sebelum** hitung mundur habis.
- Saat peserta tidak melihat aktivitas baru, minta cek tab **Aktivitas**, koneksi, dan status browser; bila perlu muat ulang satu kali.
- Hindari membuka beberapa pertanyaan sekaligus agar peserta tidak tertukar; aplikasi peserta memprioritaskan aktivitas terbuka terbaru.

## 7. Panduan fasilitator — laporan dan ekspor

1. Buka `/host/{CLASS_UUID}/report`, atau gunakan tautan **Konsol Fasilitator** untuk kembali ke konsol utama.
2. Tempel token staf **khusus kelas** dan klik **Muat laporan**.
3. Tinjau indikator: peserta terdaftar, pengumpulan pre-test/post-test, jumlah peserta post-test bernilai minimal 75, persentase kelulusan, dan kenaikan skor rata-rata berpasangan.
4. Tinjau tabel **Hasil per peserta**: nama panggilan, unit, nilai pre, post, gain, perkiraan menit aktif, serta poin.
5. Tinjau **Analitik kualitas soal**: berapa peserta menjawab tiap item, jumlah benar, dan persentase benar.
6. Klik **CSV**, **Excel**, atau **PDF** untuk mengunduh laporan kelas. Data ekspor dibatasi oleh kelas dan otorisasi staf, serta dicatat dalam jejak audit.

**Target pembelajaran awal:** minimal **80% peserta terdaftar** mencapai post-test **≥75/100**, dan **kenaikan rata-rata peserta yang memiliki pasangan nilai pre–post ≥20 poin**. Ini indikator program, bukan jaminan hasil.

**Catatan interpretasi:** indikator **Aktif (est. menit)** berasal dari hitungan heartbeat saat tab terlihat (sekitar satu per menit), sehingga merupakan perkiraan aktivitas tab, bukan bukti konsentrasi penuh. Jangan menyimpulkan kehadiran Zoom hanya dari angka ini.

## 8. Panduan administrator / operator teknis

Bagian ini untuk operator yang memiliki hak akses infrastruktur dan memahami keamanan database. Jangan memberikan akses manajemen atau kredensial ke peserta/trainer umum.

### 8.1 Penyiapan awal (development/staging)

1. Siapkan PostgreSQL dan aplikasi Node.js sesuai [README repository](https://github.com/elanghaqeem-hash/CustomerTrust/blob/main/README.md).
2. Jalankan migrasi terurut `001_core.sql` sampai `006_join_throttle.sql` dengan akun pemilik migrasi, bukan akun web biasa.
3. Gunakan akun runtime **non-owner** terbatas, Row Level Security, dan secret penandatanganan JWT yang aman; konfigurasi rahasia hanya di server/secret manager.
4. Validasi dan lakukan seed konten resmi `seed/customer-trust-challenge.v1.json`.
5. Buat kelas baru untuk setiap batch; data peserta kelas lama tidak boleh didaur ulang.
6. Jalankan pemeriksaan kesehatan, uji kelas silang, uji formulir peserta dan laporan pada lingkungan uji sebelum hari pelaksanaan.

### 8.2 Membuat kelas dan menerbitkan kode

Contoh perintah dari direktori root repository, **setelah** lingkungan manajemen aman tersedia:

```bash
node tools/trainlive/validate-seed.mjs
node tools/trainlive/seed.mjs
node tools/trainlive/create-class.mjs 2026-11-05 BATCH-01
```

Alat pembuatan kelas menghasilkan **class_id** dan **join_code** enam karakter. Secara default sesi dimulai **09.00 WITA** dan berakhir **16.00 WITA**, kapasitas 25 peserta, dan jendela masuk diatur dari H-1 sebelum sesi hingga H+1 sesudah sesi. Atur distribusi kode berdasarkan kebijakan penyelenggara, bukan berdasarkan masa validitas teknis semata.

### 8.3 Penugasan fasilitator dalam staging

```bash
node tools/trainlive/provision-facilitator.mjs CLASS_UUID fasilitator@example.invalid
```

Alat tersebut mengaktifkan kelas terjadwal, menugaskan fasilitator, dan menerbitkan JWT staf sementara **berlaku delapan jam** untuk pengujian. Wajib dijalankan oleh operator tepercaya dengan kredensial backend, **tidak untuk produksi**. Untuk produksi, identitas staf wajib melalui SSO/MFA dan penugasan kelas yang telah diverifikasi.

### 8.4 Gerbang produksi yang wajib dipenuhi

- PostgreSQL produksi tersedia, migrasi/seed selesai, backup/PITR dan pengujian restore tersedia.
- Environment Vercel memiliki `DATABASE_URL_APP` dan `TRAINLIVE_JWT_SECRET` yang valid, dengan role database non-owner.
- `GET /api/health` mengembalikan **HTTP 200** dan `ready:true`, bukan `503 setup_required`.
- Proses login staf produksi terintegrasi SSO/MFA; token paste staging dinonaktifkan untuk data nyata.
- UAT 25 browser serta pengujian pemisahan data dua kelas, pre/post-test, 11 skenario, polling anonim, chat, lima lembar kerja, dan ekspor dinyatakan lulus.
- Persetujuan pemrosesan data, penempatan data, retensi, pencadangan, monitoring dan otorisasi telah disahkan.

## 9. Contoh rundown operasional satu hari

| Waktu WITA | Aktivitas | Tindakan TrainLive |
|---|---|---|
| 08.30–09.00 | Pemeriksaan awal panitia | Cek kesehatan sistem, akses host, kode kelas dan koneksi peserta |
| 09.00–09.20 | Pembukaan | Peserta bergabung; **Pre-Test** dibuka (5 menit); pertanyaan chat terbuka |
| 09.20–10.00 | The Customer Trust Challenge | Polling Trust Breaker, diskusi, mulai LK1 |
| 10.00–10.15 | Istirahat | Pastikan draf tersimpan |
| 10.15–11.25 | Regulatory Masterclass | RF1–RF4; lakukan Reveal; **LK2** otomatis terbentuk |
| 11.25–12.15 | Fair Treatment in Action | Script Clinic SC1–SC2, LK3 |
| 12.15–13.15 | Istirahat | Tidak perlu membuka item baru |
| 13.15–14.15 | Consumer Protection Self-Assessment | Kuis M4Q1 dan LK4 |
| 14.15–15.05 | Customer Trust Incident Simulation | Kasus K1–K4 dan pembahasan |
| 15.05–15.35 | Customer Trust Action Plan | LK5: 3–5 inisiatif 30 hari |
| 15.35–16.00 | Penutup | Post-Test (5 menit), evaluasi, Top 10, ringkasan hasil |

*Rundown bersifat panduan operasional berdasarkan struktur konten awal; fasilitator tetap mengikuti alokasi slide dan instruksi program yang disepakati. Waktu pra-sesi 08.30–09.00 merupakan rekomendasi panitia, bukan jadwal yang dipaksakan oleh aplikasi.*

## 10. Aturan poin, target, dan penggunaan hasil

| Aktivitas | Ketentuan poin |
|---|---|
| Jawaban benar pada kuis skenario pilihan tunggal | **+10 poin** setelah Reveal, sekali untuk tiap item yang memenuhi syarat |
| Pesan chat yang dipilih fasilitator untuk dibacakan | **+5 poin**, sekali untuk tiap pesan |
| LK1, LK3, LK4, LK5 dikirim lengkap | **+20 poin per lembar** |
| LK2 yang otomatis terbentuk setelah RF1–RF4 dijawab dan di-reveal | **+20 poin** sesuai aturan pengiriman otomatis |
| Polling, evaluasi, pre-test, post-test | Tidak termasuk komponen poin kuis skenario pada papan skor; skor pre/post dilaporkan terpisah |

Peringkat Top 10 ditentukan terutama oleh total poin; bila sama, sistem menggunakan akumulasi latensi jawaban benar dan kriteria pemutus seri lain. Hasil digunakan untuk pembelajaran, bukan pengganti penilaian kompetensi atau kepatuhan formal tanpa validasi lebih lanjut.

## 11. Troubleshooting / solusi cepat

| Gejala | Kemungkinan penyebab | Tindakan pengguna |
|---|---|---|
| Tombol **Gabung Kelas** tidak aktif | Kode belum enam karakter, persetujuan belum dicentang, atau health check belum siap | Lengkapi formulir; bila ada pesan persiapan sistem, hubungi panitia |
| Kode ditolak | Kode salah/kedaluwarsa, jendela masuk belum dibuka, atau kelas penuh | Minta kode dan waktu masuk yang benar; jangan menebak kode berkali-kali |
| **Menunggu fasilitator** terus | Belum ada item yang dibuka | Tetap di tab Aktivitas dan konfirmasi ke trainer |
| Tidak melihat soal baru | Tab lain aktif, koneksi bermasalah, atau browser belum memperbarui | Pindah ke tab TrainLive; periksa jaringan; muat ulang bila perlu |
| Tombol **Kirim Jawaban** tidak bisa ditekan | Ada pertanyaan belum dijawab, timer habis, atau jawaban telah terkirim | Lengkapi jawaban saat item masih terbuka; informasikan trainer bila waktu lewat |
| LK2 belum terbentuk | RF1–RF4 belum semuanya dijawab/revealed | Selesaikan keempat RF dan tunggu Reveal; buka lagi halaman LK |
| LK terkunci | Sudah memilih Kirim Lembar Kerja | Finalisasi memang mengunci; laporkan koreksi ke panitia, jangan mengirim ulang sembarangan |
| Skor belum bertambah | Fasilitator belum Reveal atau belum menandai chat untuk dibacakan | Tunggu pembahasan dan penyegaran skor |
| Notifikasi tidak berbunyi | Izin browser/sistem tidak diberikan atau audio diblokir | Ketuk tombol aktivasi notifikasi; izinkan izin browser jika diinginkan; tetap pantau tab |
| Konsol host menolak token | Token salah, kedaluwarsa atau staf tidak ditugaskan | Hubungi operator; jangan mengirim token lewat kanal publik |
| Laporan/ekspor gagal | Izin staf tidak sesuai, sesi kadaluwarsa, atau sistem belum siap | Cek class_id dan autentikasi; operator periksa log tanpa membuka data kelas lain |

## 12. Perlindungan data dan tata tertib

- Gunakan data **simulasi** untuk skenario, chat, dan lembar kerja. Hindari nama nasabah, nomor rekening, NIK, kredensial, data pembayaran dan dokumen rahasia.
- Jangan memasukkan kode kelas dan token staf di materi yang dipublikasikan ke luar peserta yang berwenang.
- Fasilitator hanya boleh menampilkan hasil agregat/Top 10 sesuai kebutuhan kelas; distribusi laporan individual memerlukan kewenangan panitia dan aturan pelindungan data.
- Data di aplikasi dipisahkan berdasarkan kelas; pengguna tidak boleh mencoba membuka URL atau menggunakan token kelas lain.
- Fitur tindak lanjut H+1/H+7/H+30/H+60 **belum terotomasi** dan baru boleh diaktifkan dengan persetujuan, saluran notifikasi dan aturan retensi yang disahkan.
- Jika terjadi gangguan, hentikan input data nyata dan hubungi penanggung jawab sistem. Kegiatan dapat dilanjutkan secara lisan di Zoom/Teams sambil status teknis diperiksa.

## 13. Checklist pelaksanaan

### 13.1 Sebelum kelas (operator dan panitia)

- [ ] Health check produksi `ready:true` dan pengujian kelas dinyatakan lulus; jika tidak, **NO-GO** untuk data nyata.
- [ ] Kelas, tanggal, kode masuk, kapasitas dan penugasan fasilitator sudah diverifikasi.
- [ ] Pre-test, 11 kuis, polling, chat, post-test, evaluasi dan LK1–LK5 sudah diuji pada kelas simulasi.
- [ ] Kode kelas hanya disampaikan kepada peserta yang berhak.
- [ ] Akses trainer dan kewenangan ekspor diverifikasi; rencana pemulihan gangguan tersedia.

### 13.2 Selama kelas (fasilitator)

- [ ] Pastikan peserta berhasil masuk dan memilih persetujuan.
- [ ] Buka satu aktivitas, pantau respons, tutup, lalu reveal sesuai alur.
- [ ] Ingatkan peserta mengirim jawaban sebelum timer habis.
- [ ] Moderasi chat dan validasi perolehan poin.
- [ ] Pastikan LK2 terbentuk setelah RF1–RF4 dan LK lainnya terkirim.

### 13.3 Setelah kelas (fasilitator dan penyelenggara)

- [ ] Cek kelengkapan pre/post, respons, dan pengumpulan lembar kerja.
- [ ] Muat laporan resmi kelas; evaluasi indikator ≥75 dan kenaikan ≥20 poin.
- [ ] Ekspor CSV/Excel/PDF hanya kepada pihak yang memiliki otorisasi.
- [ ] Catat isu dan tindakan perbaikan; pastikan penyimpanan dan retensi sesuai kebijakan.
- [ ] Jadwalkan tindak lanjut di luar sistem hanya jika ketentuan privasi/consent mengizinkan.

## 14. Referensi dan batasan manual

Manual ini disusun dari implementasi yang terdapat pada repository GitHub `elanghaqeem-hash/CustomerTrust`, khususnya `apps/trainlive/src/app`, `tools/trainlive`, `seed/customer-trust-challenge.v1.json`, `README.md`, `docs/RUNBOOK.md`, dan `docs/PRODUCTION-READINESS.md`, dengan pemeriksaan pada **5 November 2026**. Perubahan fitur setelah tanggal tersebut perlu dicocokkan kembali sebelum dokumen dinyatakan sebagai SOP produksi final.

**Batasan penting:** belum tersedia menu administrator web lengkap untuk pembuatan kelas/akun; autentikasi SSO/MFA staf produksi dan broadcast realtime kelas belum selesai; halaman peserta hanya dapat dipakai setelah konfigurasi backend benar-benar siap. Dokumentasi ini tidak menggantikan approval TI, keamanan informasi, pelindungan data, dan pemilik program training.