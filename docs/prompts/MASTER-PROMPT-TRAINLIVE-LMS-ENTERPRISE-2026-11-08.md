# MASTER EXECUTION PROMPT — TRAINLIVE LMS ENTERPRISE
## Transformasi TrainLive menjadi Learning Management System Multi-Tenant, White-Label, dan Fully Parameterized
**Versi:** 1.0 — 8 November 2026
**Source of truth:** https://github.com/elanghaqeem-hash/CustomerTrust
**Default branch:** main
**Vercel:** https://ct-kohl.vercel.app/ (project ct; hanya verifikasi, jangan menganggap fitur baru sudah deployed)
**Hosting alternatif:** Hostinger VPS / trainlive.seraya.id (opsional, belum otomatis aktif)
**Bahasa kerja:** Indonesia; dukung lokalisasi Indonesia/Inggris.
**Mode eksekusi:** IMPLEMENTASI kode bertahap, bukan sekadar analisis atau pembuatan mockup.

> PERINTAH UTAMA: Audit repository terbaru, buat gap matrix berbasis bukti, lalu kembangkan TrainLive secara inkremental menjadi LMS Enterprise multi-tenant yang dapat dikonfigurasi oleh Super Admin tanpa perubahan kode per klien. Pertahankan SEMUA fitur TrainLive, data kelas, konten versi terbit, identitas, audit log, skor, dan workflow yang sudah ada. Bangun fitur end-to-end (UI + API + database + authorization + automated tests + documentation), commit/push setiap paket yang valid, buat PR bila perlu dan verifikasi hasil. Jangan mengklaim siap produksi sebelum gates terbukti PASS.

# 01. ROLE TIM EKSEKUSI
Bertindak sebagai satu tim: Enterprise Solution Architect, LMS Product Owner, Full-Stack Engineer, PostgreSQL DBA, IAM/SSO Security Engineer, Learning Experience Designer, UI/UX Designer, QA Automation, Performance Engineer, DevSecOps/SRE, Data Privacy Officer, Accessibility Reviewer, Business Analyst, dan Technical Writer.
- Jalankan pekerjaan dari repository yang benar-benar ada, bukan asumsi.
- Keputusan harus menimbang backward compatibility, isolasi tenant, least privilege, testability, biaya layanan, dan kemudahan operasi.
- Untuk perubahan berisiko, gunakan branch + PR; pertahankan branch protection dan CI. Jangan melakukan force-push, reset produksi, atau menimpa karya yang sudah ada.
- Semua langkah eksekusi dan laporan menggunakan bahasa Indonesia.

# 02. BASELINE NYATA DAN KEWAJIBAN REVALIDASI
Pada audit repo 8 November 2026:
- Monorepo aplikasi Next.js 15.5.28, React 19.3.1, TypeScript, PostgreSQL 16, Zod, jose, ExcelJS, pdf-lib; aplikasi berada di apps/trainlive.
- TrainLive telah mendukung class multi-batch, pre-test/post-test, kuis skenario, polling, chat peserta, worksheets, leaderboard dan poin, dashboard fasilitator, laporan CSV/XLSX/PDF, serta branding kelas.
- Aplikasi memakai organization → program → published content_version → class_session; published content dan class snapshot memiliki guard immutability.
- Migrasi 001–015 sudah ada; 016_lms_catalog.sql dan 017_lms_learning.sql telah ada di main bersama tes 09_lms_catalog.sql dan 10_lms_learning.sql.
- P0 LMS: course/module catalog tenant-scoped, course configuration, lesson/module authoring UI, staff API dan authorization.
- P1 LMS: lesson text/link/video/pdf sebagai HTTPS link, draft publication guard, learner enrollment, sequential completion dan learner page; belum ada private upload media, assessment engine, valid graduation maupun long-lived learner identity.
- Feature flag NEXT_PUBLIC_TRAINLIVE_LMS_ENABLED wajib OFF sampai migration, izin, auth dan UAT lolos.
- PR #38 draft mengusulkan 018_lms_tenant_settings.sql (registry parameter tenant) dan roadmap. Jangan menganggap PR telah merge. Reconcile/lanjutkan dengan aman; hindari migrasi duplikat.
- Catatan rilis 7 November menyatakan database produksi Neon memiliki migrasi 001–015, sementara 016/017 baru diuji di clone QA; VERIFIKASI ULANG keadaan terkini sebelum tindakan.
- Source of truth tata kerja: AGENTS.md; baca README, docs/LMS-P0-FOUNDATION.md, docs/LMS-P1-LEARNING.md, docs/PRODUCTION-READINESS.md, docs/TRAINLIVE-RELEASE-STATUS-2026-11-07.md, seluruh workflow CI, security functions dan migration manifest.
- Jangan mempercayai tanggal catatan status sebagai bukti status live hari ini; cek CI, branch, deployment SHA, /api/health, RLS, database migration dan SSO/MFA secara terpisah.

# 03. SASARAN PRODUK DAN DEFINISI SELESAI
Bangun satu platform TrainLive LMS dengan tiga cara penggunaan:
A. Instructor-Led Live Training: Zoom/Microsoft Teams/offline, live polling, quiz, breakout-independent exercises, moderator, papan skor, evaluasi dan attendance.
B. Self-Paced Learning: akses berkelanjutan, video/dokumen, modul sekuensial atau fleksibel, kuis mandiri, tugas, progress, remedial, sertifikat.
C. Blended Learning: program yang mengombinasikan sesi live, materi mandiri, tugas, ujian, evaluasi dan sertifikasi.

Satu sistem dapat dipakai oleh training provider atau klien bank/perusahaan dengan pemisahan data yang kuat. Super Admin memilih tenant, brand, nama perusahaan, nama training, judul program, template learning path, kurikulum, assessment, sertifikat, peran, kebijakan belajar dan reporting TANPA edit source code. Dukungan corporate/private training lebih diprioritaskan daripada marketplace publik.

Definition of Done untuk tiap fitur:
1. Konfigurasi dan layar benar-benar tersedia, sesuai hak akses.
2. Database dan API berfungsi pada Postgres nyata, bukan hanya mock.
3. Validasi input, tenant isolation, SoD, audit, idempotency dan error handling lengkap.
4. Positive/negative automated tests ada dan lulus di CI.
5. Responsive browser QA dan aksesibilitas lulus.
6. Documentation dan runbook diperbarui.
7. Commit SHA, PR, test evidence dan deployment status dilaporkan dengan benar.
8. Tidak ada regresi pada skenario Customer Trust Challenge yang sudah berjalan.

# 04. TENANCY DAN HIERARKI PARAMETER
Hierarki default: GLOBAL → TENANT/ORGANIZATION → PROGRAM → COURSE → BATCH/CLASS → ACTIVITY/LESSON.
Prioritas pembacaan: override terdekat yang sah menang, dengan nilai efektif terhitung server-side. Parameter sensitif auth/security tidak boleh dioverride oleh setting bisnis.
- GLOBAL: default produk, bahasa, timezone default, minimum security floor dan feature availability.
- TENANT: logo, client display name, legal entity, tema, email sender terotorisasi, custom domain terverifikasi, data retention sesuai kebijakan, program default, sertifikat issuer, learning rules yang disetujui.
- PROGRAM: nama katalog, deskripsi, tujuan belajar, category, competency, target role, rubrik, tag, waktu.
- COURSE: mode, urutan modul, passing grade, lesson completion, attempts, deadline, enrollment prerequisites, sertifikat.
- BATCH: trainer, jadwal, kuota, lokasi / meeting link, enroll window, attendance threshold, notifikasi, judul publik/branding batch.
- ACTIVITY: visibility, due date, timer, bobot, randomization, feedback release, assessment constraints.
Persyaratan: registry allowlist + schema validation + audit before/after + effective settings preview + versioning + rollback + approval untuk parameter kritis. Nilai keamanan minimum tidak boleh dilemahkan oleh tenant. Konfigurasi diterbitkan menjadi snapshot sehingga hasil historis tidak berubah ketika template diubah.
Implementasi 018 pada PR #38 harus ditinjau sebelum diintegrasikan; jangan duplikasi tabel/fungsi. Tambahkan UI dan API untuk setting ini dengan scoped auth yang tepat.

# 05. 24 MENU / MODUL TARGET
M01 Executive Dashboard: statistik lintas tenant untuk Super Admin; tenant-specific KPI untuk Tenant Admin.
M02 Tenant / Client Management: create, suspend, branding, verified domains, regional settings, policies, tenant lifecycle.
M03 Organization & Business Units: divisi, unit, cabang, lokasi, struktur hirarki dan cohort.
M04 System Parameters: CRUD terkontrol untuk global/tenant/program/course/batch settings; inheritance inspector dan change history.
M05 Identity, SSO & Roles: invitation, employee directory, MFA/OIDC/SAML via provider, role assignment, session, approval.
M06 Program & Course Catalog: draft-review-published-archived; metadata, owner, tags, competencies, prerequisites.
M07 Curriculum / Learning Path Builder: section, module, lesson, dependency, drag-sort accessible, estimated duration, versioned publish.
M08 Content & Media Library: text, PDF, slide, video, audio, URLs, document permissions, private storage and scanning.
M09 Assessment & Question Bank: MCQ single/multiple, true/false, short answer, case scenario, matching, rubric/essay (manual grade).
M10 Exam & Grading: attempt lifecycle, timer, shuffle, pass mark, weighting, answer key protection, retake/remedial.
M11 Assignment & Worksheet: individual tasks, templates, uploads, due date, revision, assessor workflow and rubric.
M12 Class / Batch & Schedule: timetable, roster, join code, trainer, capacity, timezone, repeat sessions, calendar.
M13 Live Training Console: existing TrainLive polls, quizzes, open chat, worksheets, timer, reveal, leaderboard.
M14 Enrollment & Admission: invitation, bulk upload, registration, approval, capacity/waitlist, class transfer, activation.
M15 Learner Portal / My Learning: active courses, roadmap, resume, downloadable permitted material, progress.
M16 Attendance & Engagement: join/leave, heartbeat, live attendance, asynchronous activity, engagement and privacy notices.
M17 Certification & Badges: template, eligibility, issue, QR/token verify, expiry, revoke, renew, audit.
M18 Evaluation & Feedback: pre/post surveys, Kirkpatrick L1/L2; optionally L3 follow-up; NPS and CSAT with consent.
M19 Reports & Learning Analytics: completion, score, attendance, funnel, heatmap, cohort, exports and filters.
M20 Notifications & Reminders: email/in-app, invited, assigned, deadline, exam result, certificate, opt-out and retry.
M21 Integrations & Open APIs: Teams/Zoom links first; verified external APIs, webhooks, SCORM/xAPI/LTI as phased optional modules.
M22 Compliance & Audit Center: trail, SoD review, consent, retention, export evidence, deletion workflows.
M23 Document Vault & Templates: controlled file versioning, course templates, question imports, certificate layouts, manuals.
M24 Administration & Operations: jobs, migrations/version, diagnostics, feature flags, health, backup status, support tools.
Setiap menu memiliki list/detail/create/edit/read-only view, search/filter, pagination, empty/loading/error states, authorization, responsive UX, server-side validation dan audit bila relevan. Menu yang belum berfungsi jangan dipromosikan sebagai selesai; sembunyikan/label beta lewat feature gate.

# 06. PERAN, AUTHORIZATION, SEGREGATION OF DUTIES
Peran minimum:
- Platform Super Admin: pengaturan platform dan tenant sesuai explicit assignment; privileged MFA.
- Platform Operations: monitoring/backup tanpa otomatis dapat membaca PII/course answers.
- Tenant Admin: mengatur satu atau lebih tenant yang diotorisasi saja.
- Corporate L&D Manager: program, batch, enrollment dan laporan per tenant.
- Program Manager / Training Coordinator: jadwal, roster, learning plan, assignment.
- Course Author / Instructional Designer: draft content/question bank, tidak otomatis publish.
- Reviewer / Publisher: review dan approve konten; sesuai maker-checker untuk konten penting.
- Facilitator / Instructor: jalankan batch assigned, monitor kegiatan, feedback.
- Assessor / Grader: penilaian essay/tugas assigned; audit hasil/perubahan.
- Learner / Participant: course sendiri, progress sendiri, sertifikat sendiri.
- Observer / Sponsor Viewer: laporan agregat tenant yang diotorisasi.
- Auditor / Compliance: read-only evidence scoped, masked PII unless justification approved.
- External Verifier: verifikasi status sertifikat minimal via token terbatas tanpa membuka data pribadi lain.
Gunakan RBAC + resource-bound ABAC (tenant_id, course_id, class_id, assignment) dan denial by default. Pisahkan peran platform/tenant/course/class; jangan menyandarkan scope pada browser-supplied tenant_id. Semua query dan mutasi tenant-scoped. Larang tenant admin mempromosikan dirinya sendiri menjadi platform super admin; privileged actions perlu dual control jika disepakati. Preserve existing staff SSO+MFA dan class cookie flow sampai identity bridge yang aman selesai.

# 07. MASTER DATA YANG PARAMETERIZED
Kelompok data: tenant, client/brand, organization unit, category/topic, instructor, facilitator, assessors, venue, academic calendar, timezone, schedule template, competency framework, skill tags, proficiency levels, role map, course type, delivery mode, question type, grade scale, certificate type, evaluation template, notification template, attendance policy, completion policy, badge, assessment bank, onboarding template, report template, retention policy dan integration connection.
Sediakan import/export CSV/XLSX dengan preview, field mapping, row validation, duplicate report, rollback batch, idempotent import dan tenant ownership. Untuk key referensi stabil gunakan internal UUID dan kode unik tenant-scoped; hindari hard delete untuk master yang sudah dipakai transaksi.

# 08. LMS COURSE & CONTENT LIFECYCLE
Lifecycle: draft → review → approved/published → archived/superseded. Publikasi membekukan versi konten; perubahan setelah publish membuat revision baru, bukan overwrite konten yang telah dipakai. Tentukan course equivalence dan version-specific completion policy. Course boleh memiliki section, lessons, SCORM package (future adapter), knowledge check, assessment, assignment, survey, live session, final exam. Prasyarat harus divalidasi bebas siklus, termasuk lintas course yang diperbolehkan dalam satu tenant. Tampilkan estimated time, learning outcome, prerequisites, difficulty, valid-from/valid-to, owner, language dan accessible descriptions.
Course clone/template hanya menyalin desain, bukan enrollment dan skor. Cross-tenant template sharing membutuhkan explicit platform permission, sanitization dan no customer PII. Tidak boleh menyalin data peserta dari Bank Sulteng ke klien lain.

# 09. LEARNER IDENTITY, ENROLLMENT DAN PROGRESS
Implementasikan identitas learner tahan lama: OIDC enterprise jika tersedia, atau passwordless/email OTP dengan abuse protection, MFA saat perlu. Jangan mengandalkan cookie kelas 72 jam sebagai identitas LMS jangka panjang. Pisahkan account identity dengan membership per tenant; kaitkan participant lama hanya setelah verifikasi kepemilikan dan persetujuan sesuai desain. Hindari auto-merge berdasarkan nama/email yang belum diverifikasi.
Enrollment lifecycle: invited → pending → active → completed / failed / withdrawn / expired; waitlist bila kuota penuh. Dukungan enrollment individual, bulk, group, by program dan transfer batch dengan aturan rekonsiliasi riwayat. Progress dihitung server-side dari lesson/assessment/attendance/tugas dan policy versi yang berlaku; completed_lessons saja bukan graduation. Event progress idempotent; concurrent requests aman; tampilkan timeline learner tanpa bocor data orang lain.
Aturan belajar bisa sequential atau free-navigation, drip schedule, due date, prerequisites dan retake sesuai parameter. Mobile-first, resume after interruption, progress indicator, bookmark dan accessibility.

# 10. ASSESSMENT, SCORING, EXAM INTEGRITY
Buat tenant-specific question banks dengan topic, competency, difficulty, type, tags, source, approved version, status, correct answers encrypted/protected by server authorization. Tipe minimum: MCQ A-D/E single, multiple correct, true/false, short text dengan normalized match, case scenario, essay/manual rubric; matching/ordering dapat bertahap.
Assessment builder: blueprints, fixed/random question sets, seeded shuffle, timer, availability window, max attempts, pass threshold 0–100, weighted rubric, penalty optional, negative marking off by default, answer reveal timing, question review policy, retake cooldown, accommodation/extra time untuk peserta yang berhak.
Attempt lifecycle: not_started → in_progress → submitted → graded → published; server-issued start time; race-safe submission; auto-save; expiry; duplicate-submit idempotence. Never expose correct answer or grading key to participant API before reveal entitlement. Store versioned assessment snapshot to preserve integrity of historical results. Essay/worksheet approval and grade override require reason, actor, audit, and optional second approval.
Retain live TrainLive leaderboard points separately from formal LMS final grade unless explicit configured formula; avoid double-counting. Pre/post score comparison valid only for comparable item/competency mapping. Implement moderation, plagiarism signals only as indicators, not automated unchallengeable findings.

# 11. LIVE LEARNING — KOMPATIBILITAS TRAINLIVE
Fitur berikut wajib tetap berfungsi: class join code 6 karakter, 25+ peserta simultan, pre-test, post-test, anonymous polling, skenario, red-flag sheet/worksheet, facilitator controls, chat moderation, timer, reveal, ranking/ledger idempotent, report exports, branded join page.
Gunakan adapter antara LMS course/batch dengan existing class_session; jangan menghapus class_id, content_version, snapshot, score or participant legacy. Fasilitator dapat memulai sesi, pause/close, membuka aktivitas, mengingatkan kuis, menampilkan voting, memoderasi jawaban dan menutup kelas sesuai hak akses. Zoom/Teams diarahkan melalui secure meeting URLs; tidak mengklaim konferensi video built-in. Real-time broadcast bisa polling sebagai fallback; bila memilih WebSocket/SSE, sesuaikan kemampuan hosting dan buktikan class/tenant isolation serta reconnect.
Sesi offline dapat mencatat attendance manual dengan approval dan audit. Peserta mengikuti dari masing-masing perangkat, tidak mengharuskan kerja kelompok.

# 12. MEDIA, FILE DAN CONTENT SECURITY
Awalnya lesson plain text serta HTTPS links yang sudah ada tetap didukung. Tambah authenticated private upload PDF/PPTX/DOCX/XLSX/MP4 (sesuai kapasitas/kontrak) dengan MIME+magic verification, size quota, antivirus scanning, storage key tenant-scoped, short-lived signed access dan audit download. Jangan memasukkan secret URL atau media key ke client. HTML lesson gunakan editor dengan sanitization ketat dan CSP; jangan membiarkan arbitrary scripts/iframes. External embeds via per-tenant allowlist dan sandbox. Video progress tidak boleh semata mengandalkan untrusted client claim; tetapkan kebijakan completion yang jujur.
File retention, revisions, delete approvals dan object lifecycle harus selaras UU PDP dan kontrak pelanggan. Cegah cross-tenant IDOR, path traversal, malware upload, formula injection, CSV/XLSX injection, XSS/CSRF dan SSRF dari URL import.

# 13. CERTIFICATE DAN DIGITAL CREDENTIAL
Super Admin/Tenant Admin memilih template, logo, title, instructor/issuer, tanda tangan gambar yang sah, language, warna, verification domain dan masa berlaku. Kelayakan sertifikat berasal dari computed completion policy: minimum score, attendance, mandatory lessons, assignment dan evaluation bila disyaratkan. Sertifikat unik, punya nomor, issued_at, expires_at (opsional), revoked_at, version dan checksum; PDF server-rendered. Public verification lewat QR/opaque random token dan rate limiting; tampilkan hanya informasi yang memang boleh dipublikasikan dan telah disetujui peserta/tenant. Dukung revocation/reissue dengan trail. Jangan mengklaim tanda tangan elektronik tersertifikasi bila belum ada integrasi penyelenggara yang sah.
Certificate.enabled dari 018 hanya feature flag sampai issuance lifecycle benar-benar diterapkan dan diuji.

# 14. EVALUATION, FEEDBACK, FOLLOW-UP
Bangun survey builder: skala Likert, pilihan ganda, komentar, NPS/CSAT, survey fasilitator, relevansi materi, evaluasi sebelum/sesudah, L1 reaction dan L2 learning. H+1/H+7/H+30/H+60 follow-up hanya setelah consent, schedule/opt-out dan message template disetujui. Anonimitas survei dipertahankan sesuai pilihan responden; jumlah agregat kecil perlu suppression untuk mencegah identifikasi. Instrumen versi lama tidak berubah setelah diterbitkan.

# 15. LEARNING ANALYTICS, REPORTING DAN BI
Dashboard per role/tenant: total course, active learners, enrollment status, attendance, completion, pass/fail, grade distribution, learning time yang dapat dipercaya, drop-off, cohort progress, trainer delivery, pre/post delta, certificate issuance dan overdue.
Filter: tenant, organization unit, program, course, content version, batch, instructor, time range dan demographic business field yang sah. Drill down hanya untuk owner authorized. Data exports CSV/XLSX/PDF dengan audited export, formula injection mitigation, PII masking, pagination/server-side streams, timezone dan immutable report timestamp. Mendukung approved report templates dan scheduled reports via jobs; simpan kebijakan penerima dan consent.
Jangan mencampur data klien pada admin dashboard kecuali Super Admin authorized dan tujuan penggunaan sah. Aggregate cross-tenant harus privacy-safe.

# 16. NOTIFICATION, EVENTS, JOBS
Outbox/event-driven minimal: enroll/invite, course assignment, batch start, exam deadline, grade publication, completion/certificate, follow-up approved. Setiap event punya idempotency key, delivery status, retry with exponential backoff, DLQ/manual replay, tenant-aware template, language, rate limits, opt-out dan error log terredaksi. Email sending hanya setelah domain/sender diverifikasi. Jangan menaruh provider API keys dalam DB plain text atau source.
Scheduled jobs harus survive restart; implement worker/queue sesuai infrastruktur yang benar-benar digunakan. Tidak menjanjikan background processing yang belum di-deploy.

# 17. API, SCHEMA, TRANSACTIONS DAN MIGRASI
Utamakan reuse apps/trainlive/src, PostgreSQL trainlive schema, existing grants, SECURITY DEFINER authorization functions, Zod validation, repo tests dan CI. Pisahkan domain modules dengan typed service layer; konsisten Next.js route handlers yang sudah ada. Pastikan role runtime non-owner, table-level deny + RLS + authorized functions. Uji SECURITY DEFINER search_path, privileges, cross-tenant references dan SQL injection.
Model minimal (reuse existing bila ada): tenant_setting_revision, tenant_membership, learner_account, learner_identity_link, course_version, course_section, lms_module, lms_lesson, media_asset, assessment_bank, question_version, assessment_blueprint, assessment_attempt, answer, grading, assignment, submission, enrollment, enrollment_history, module_progress, activity_event, certificate_template, certificate, survey, survey_response, attendance, notification_outbox, audit_log, integration_connection.
Setiap table transactional harus mengikat tenant melalui kunci dan constraint komposit; index pada tenant_id+foreign keys; soft-delete policy dan unique constraints; freeze published versions. Pertimbangkan separate DB schema/physical partition hanya bila terbukti perlu; jangan refactor disruptive tanpa alasan.
Migrasi: additive + backward compatible → dual-read/write jika perlu → backfill verified → cutover → cleanup belakangan. Buat nomor migration berikutnya dari kondisi aktual, jangan re-use 018 jika sedang konflik PR. Semua migration harus transaksi atau memiliki recovery plan, checksum, seed synthetic non-PII, forward-safe, replay-safe, dan pengujian real PostgreSQL. Nunca destructive migration terhadap kelas/peserta aktif.

# 18. ROUTING DAN UI/UX
Buat navigasi adaptif role dan tenant, dengan grouping:
- Home / Dashboard
- My Learning / Learning Path
- Course Catalog / Content
- Classes / Live Sessions
- Assessments / Assignments
- Certificates / Evaluations
- Reports / Analytics
- Client / Identity / Parameters
- Audit / System Operations
Tampilan enterprise modern, bukan poster: navy/indigo/cyan sebagai default, terang dan dark-mode opsional, configurable accent per tenant, typography ≥16 px untuk konten pokok, jelas untuk trainer/peserta, responsive desktop/tablet/mobile. Penyusunan layout menggunakan reusable UI components, skeleton/loading/empty/error states, modal accessible, search/filter, breadcrumb, sidebar collapsed, keyboard focus, localization dan text contrast. Audit WCAG 2.2 AA. Jangan tampilkan developer debug UI, hardcoded brand klien, kode contoh, jawaban benar atau kredensial.
Super Admin harus mempunyai preview white label (logo, client title, training title, footer), tidak perlu edit source. Customer Trust Challenge Bank Sulteng tetap tersedia sebagai studi kasus, tidak otomatis muncul pada tenant baru.

# 19. SECURITY, PDP, RESILIENCE DAN AUDIT
Kontrol minimum: OIDC + MFA untuk staf, secure httpOnly SameSite cookies, CSRF/origin protection, tenant-scoped RBAC/ABAC, least privilege, RLS, rate limit, brute-force protection, session revocation, protected environment secrets, encryption in transit/at rest, tamper-evident audit trail, logs tanpa PII sensitif, file malware scan, signed URLs, CSP dan security headers, backups + PITR, restore drill, incident response. Review OWASP ASVS/Top 10 dan API authorization.
UU PDP Indonesia: tujuan pengolahan, privacy notice, consent jika diperlukan, data minimization, retention schedule dan penghapusan/anonymization sah, subprocessor inventory, data subject requests, cross-border assessment bila ada, dokumen pemrosesan per tenant. Patuhi persyaratan tambahan dari klien FSI apabila dikontrakkan; jangan mengklaim sertifikasi ISO atau regulatory compliance hanya karena checklist.
Audit immutable semantic events: WHO/WHEN/TENANT/RESOURCE/ACTION/BEFORE-AFTER non-secret/SOURCE/REQUEST-ID; akses audit logs dibatasi. Segregation of Duties untuk author vs publisher dan grade override; setiap privileged operation traceable.

# 20. PERFORMANCE, SCALE, AVAILABILITY, DR
Baseline beban: simulasi minimum 3 kelas paralel × 30 peserta, lalu load test staging sintetis sampai ≥600 concurrent sessions (bukan production tanpa izin). Sasaran awal non-kontraktual: server-side p95 API reads <1s, writes <2s pada kapasitas yang disepakati, tanpa error authorization/race; ukur dan revisi berdasarkan load evidence. UI Core Web Vitals dan bandwidth pada jaringan Indonesia mobile diperhatikan. Optimasi indeks dan query N+1, pagination, media CDN private, caching aman per tenant (key isolation), queue backpressure dan connection pooling Postgres.
Tentukan RTO/RPO secara eksplisit dengan owner berdasarkan backup/restore test; jangan mengiklankan 99.9% SLA tanpa desain/kontrak/monitoring yang mendukung. Observability meliputi health, tracing, structured logs, auth failures, error budgets, migration drift, job backlog, tenant-safe metrics dan alerts. Simulasikan database failure, provider failure, restore, duplicate webhooks, disconnect/reconnect, rate limiting serta concurrent assessment submissions.

# 21. INTEGRASI DAN PORTABILITAS
Jaga kompatibilitas deploy Vercel + PostgreSQL/Neon, dan opsi Hostinger VPS tanpa mengubah domain utama tanpa approval. Zoom/Teams: meeting link manual terlebih dahulu, API dan attendance-sync hanya jika izin & secret terkelola. SSO integrasi OIDC enterprise; SAML via identity broker bila dibutuhkan. CSV/XLSX first-class; webhook/outbound API dengan scoped token, signature, rotation dan replay protection.
SCORM 1.2/2004, xAPI, cmi5 dan LTI dicatat sebagai future adapters (feasibility + compatibility + conformance testing); JANGAN mengklaim dukungan standar ini jika belum diimplementasikan dan diuji. Optional LMS-to-HRIS, CRM, ERP integration harus tenant-opt-in dan least privilege. Payment/e-commerce tidak masuk core scope kecuali product owner menyetujui roadmap terpisah.

# 22. WORKFLOWS BISNIS UJUNG KE UJUNG
J01 Tenant Onboarding: Super Admin buat tenant → verify branding/policy → assign Tenant Admin → audit & tenant isolation.
J02 Training Provider: template program → course → curriculum → assessment → publish → batch → instructor → roster → invitation.
J03 Corporate L&D: upload employee roster → assign courses → enrollment → schedule → reminders → compliance dashboard.
J04 Self-Paced: learner login → enroll → lessons → prerequisite → quiz → remedial → completion → certificate.
J05 Live Session: join via code → attendance → pre-test → polls → scenario quiz → worksheet → score → post-test → close → report.
J06 Blended: prework → webinar → worksheet → asynchronous assignment → final assessment → evaluate → certificate.
J07 Course Governance: author creates draft → reviewer checks → publisher approves → course version locked → publish → clone new revision.
J08 Exam Governance: question review → blueprint → timed attempt → autosave → grading → grade publication → regrade reason.
J09 Learner Support: passwordless/SSO → enrollment transfer → access exception approval → continuity of progress.
J10 Certificate: graduation eligibility → PDF issue → learner download → external QR verification → revoke/reissue.
J11 Reporting: manager filters unit/batch → aggregate → reviewed export → evidence audit.
J12 Compliance: privacy request → locate tenant-person data → validate policy → export/delete/anonymize → evidence.
J13 Notification: trigger → outbox → send/retry/opt-out → delivery audit.
J14 Failure Recovery: migration backup → release → failure detection → rollback app / compensating data migration → reconciliation.
J15 White-Label: tenant updates logo/title/color → preview → approve/publish → all authorized surfaces display new theme.
Masing-masing harus memiliki langkah UI/API/DB/role, negative paths, concurrency, audit, verifiable acceptance evidence.

# 23. ROADMAP P0–P4 DAN DEPENDENCIES
P0 — Discovery & Hardening: inspect main/PRs/deploy/DB; map existing routes/tables/roles/feature flags; confirm production migration 001–015 vs status kini; retain existing live app; run baseline test; identify P0 defects; resolve 018 PR conflict; design canonical tenant boundaries and architecture ADRs.
P1 — Parameterized Core: tenant CRUD + role membership, versioned/approved parameter inheritance, branding editor, tenant dashboard, program/course metadata, course template, curricular module/lesson UI and tests. Connect existing 016/017 APIs, no duplicate engine.
P2 — Learning Operations: durable learner identity, enrollment and bulk invites, private media, lesson delivery, learning path prerequisites, assignment, attendance/engagement, branded participant dashboard, notification jobs, explicit completion policy.
P3 — Assessment & Credential: question bank/authoring/import, exams, attempts/grading, rubrics, pre/post mapping, gradebook, manual moderation, certificate/QR/revoke, evaluations, tenant reports.
P4 — Enterprise & Production: integration layer, webhooks, advanced analytics, optional standards, accessibility and performance hardening, security review, privacy controls, backup/restore, operational manuals, staged rollout and formal production acceptance.
Dalam tiap fase gunakan vertical slices yang dapat diuji; jangan membuat 24 menu kosong. Gap matrix harus membedakan IMPLEMENTED, PARTIAL, MISSING, BLOCKED, NOT VERIFIED dengan rujukan file/line atau test evidence. Kerjakan tanpa berhenti di dokumen desain selama tool memungkinkan implementasi. Jika ada external dependency/approval, selesaikan semua pekerjaan lain yang independen sambil melaporkan blocker dengan jelas.

# 24. UAT MATRIX — TARGET 420 SKENARIO
Buat ≥420 skenario UAT yang dibagi sebagai berikut:
- Identity, RBAC, tenant isolation dan unauthorized access: 65
- Tenant management, branding dan parameter inheritance: 40
- Course/curriculum/media/versioning: 70
- Batch, enrollment, scheduling dan learner progress: 45
- Existing live TrainLive regression: 50
- Assessments, submissions, grading, attempts dan remedial: 60
- Certificates, evaluations, analytics dan export: 40
- Security, performance, accessibility, resilience dan rollback: 50
Total 420. Tiap skenario wajib memiliki ID, prioritas P0/P1/P2, precondition, actor, tenant/class, langkah, expected result, actual result, evidence link, issue/PR, verdict PASS/FAIL/BLOCKED.
Wajib negative coverage: learner A mengakses course tenant B, class staff tanpa assignment, impersonation, PII leak, direct table access, compromised/expired cookie, fake class code, duplicate enrollment, simultaneous final-submit, bypass prerequisites, modify published exam, answer key API leakage, invalid file, export injection, replayed notification, certificate invalid/revoked, and production feature flag off.
Tambahkan automated unit + Postgres integration + API contract + e2e UI. Gunakan seeded *synthetic* data; jangan mengekstrak data klien produksi untuk QA. CI harus memverifikasi seluruh migrasi urut, DB tests 01–current, Next.js typecheck/build, lint/security checks dan smoke route tests. Dilarang melaporkan PASS tanpa evidence.

# 25. PRODUCTION RELEASE GATES
G0 Architecture & security review: ADR, ERD, tenancy, RLS grants, API contract, threat model.
G1 Repository: PR reviews, GitHub checks all green, branch protection, no conflicts, commits traceable.
G2 Database: staging/QA PostgreSQL backed up; migration checksum verified, restore tested, production migration approved separately; no destructive changes.
G3 Identity: working Super Admin SSO/MFA, tenant admin role, learner auth, session revocation and cross-tenant deny.
G4 Functional: priority P0/P1 tests pass; browser UAT verified on real browsers and simultaneous tenants.
G5 Performance/Accessibility: staging load evidence, WCAG 2.2 AA audit, error-rate thresholds, rate-limit testing.
G6 Privacy/Operations: consent/retention, backup/restore, alerting, documentation, incident runbooks, support workflow.
G7 Deploy: verify exact app build SHA and environment, production DB schema version, feature flag status, /api/health ready, login, class join, self-paced learning, export and rollback.
G8 Hypercare: monitored rollout, issue tracking, data reconciliation, no new tenant leakage. Record formal owner/sign-off.
Jangan merge/deploy/migrate production hanya karena user pernah memberi izin umum; untuk perubahan irreversible, database write, perubahan auth, secrets, hak akses dan promotion yang memerlukan protected approval, ikuti GitHub/environment security gates yang berlaku. Jika Vercel quota tidak tersedia, lanjutkan local/QA/CI/repo serta siapkan Hostinger secara non-disruptive tanpa mengubah website lain. Status produksi hanya READY jika benar-benar verified.

# 26. DELIVERABLE WAJIB DAN FORMAT LAPORAN
Sediakan: 1) inventory current implementation; 2) requirements + gap matrix; 3) architecture ADR + Mermaid diagrams; 4) ERD/migration map; 5) RBAC/SoD matrix; 6) API contracts; 7) UI navigation + component system; 8) configurable parameter catalog incl. inheritance; 9) user journey & use cases; 10) actual code+DB+tests; 11) synthetic seed; 12) 420-case UAT and execution evidence; 13) QA/security/performance reports; 14) admin/facilitator/learner manuals (separate); 15) production deployment/rollback runbook; 16) exact commit SHA/PR/CI/deployment report.
Setiap laporan kemajuan ikuti format ringkas:
- Phase / Work Package
- Baseline SHA → New SHA / branch / PR
- File changed
- Built functions and UI routes
- DB migration status (QA vs production)
- Unit/DB/API/e2e results (PASS/FAIL/BLOCKED with evidence)
- Security/tenant isolation findings
- Vercel/Hostinger deployment SHA and /api/health if actually checked
- Remaining blockers, risk, next executable actions.
Tidak boleh menggunakan placeholder UI, dummy PASS, hardcoded credential, atau klaim deployed tanpa verifikasi. Bila diblokir approval eksternal, lanjutkan pekerjaan terpisah tanpa menunggu pasif.

# 27. PERINTAH EKSEKUSI LANGSUNG
LAKUKAN SEKARANG:
1. Baca AGENTS.md dan audit repository main, open PR #38, migrasi 016/017, test fixtures, CI, serta hosting readiness; ambil HEAD SHA terkini.
2. Buat baseline feature-by-feature dan migration checksum, lalu pilih smallest coherent vertical slice yang menambah fungsi pengguna nyata: P1 Tenant Parameters Super Admin UI/API + effective settings preview + cross-tenant tests. Gunakan PR #38, jangan reimplement 018 jika kompatibel.
3. Implementasikan UI + API + PostgreSQL server authorization + audit + validation + tests secara end-to-end. Jangan menyalakan LMS feature flag produksi.
4. Jalankan lint/typecheck/build, database integration tests dengan PostgreSQL disposable, security negative tests dan UI smoke.
5. Commit/push ke branch, buka/update PR, laporkan SHA, file, test evidence dan blocker. Jika aman dan CI/reviewer/branch protection mengizinkan, lanjutkan work packages berikutnya; jangan melewati production gates.
6. Ulangi secara berkelanjutan dalam sesi eksekusi yang tersedia sampai modul LMS selesai. Untuk bagian yang tidak dapat dieksekusi dengan alat atau izin saat ini, nyatakan jelas dan siapkan artefak yang dapat ditindaklanjuti.

**HASIL AKHIR YANG DIMINTA:** TrainLive berubah secara nyata menjadi LMS Enterprise yang parameterized, tenant-isolated, white-label, secure, extensible, reliable dan usable untuk berbagai klien; semua fitur live training lama tetap berjalan; progres implementasi dibuktikan oleh source code, migrasi, tes dan deployment evidence, bukan hanya desain atau narasi.
