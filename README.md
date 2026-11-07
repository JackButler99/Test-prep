# ITP Practice Lab

A Next.js full-stack learning app for independent practice in the **TOEFL ITP Level 1 format**. Interface copy is in Indonesian; all 140 questions and explanations are original English practice content. This is an independent study tool, not an ETS test or certificate.

## Run locally

Requires Node.js **24.15+** and npm. SQLite is provided by Node's built-in `node:sqlite` module.

```bash
npm install
npm run dev
```

Open http://localhost:3000, create an account, and choose a practice set or full simulation. Data is stored in `data/app.sqlite` by default. Set `DATA_DIR` to an absolute writable path to move it. `npm run typecheck` and `npm run build` verify the project.

## Included

- Account registration/login with scrypt password hashes and HttpOnly session cookies.
- Three 10-question untimed practices: Listening, Structure & Written Expression, Reading.
- A 140-question simulation with separate 35-, 25-, and 55-minute sections. Deadlines are enforced on the server; previous sections cannot be reopened.
- SQLite persistence for answers, attempts, progress, and review after completion.
- Section summaries, raw correct counts, percentages, transcript review, and explanations.
- Responsive interface, question navigation, and browser speech synthesis that assigns different available voices to `Man:` and `Woman:` dialogue lines when possible.

## Content and scoring boundaries

The question bank is original demonstration content. Listening uses the browser's synthesized English voices. Since the browser does not expose voice gender, the app selects voices by common voice names and uses different pitches as a fallback. Voice availability, pronunciation, and playback differ across devices; a production exam-like experience needs properly licensed, human-recorded audio, an expanded and reviewed question bank, and a secure delivery workflow. Some longer listening and reading stimuli have several questions, as in a test, but the bank has not been psychometrically calibrated.

The app intentionally does **not** calculate an official 310–677 TOEFL ITP score. ETS derives scaled section scores from correct answers using conversions for the test form; percentages from this original bank cannot be converted honestly into a certified score. The app also does not issue certificates. ETS publishes the Level 1 blueprint as Listening 50/35 minutes, Structure 40/25 minutes, and Reading 50/55 minutes: https://www.ets.org/toefl/itp/test-content.html ; scoring background: https://www.ets.org/toefl/itp/scoring.html .

## Deployment

Copy [.env.example](.env.example) to `.env.local` and set `APP_ORIGIN` to the origin users open in their browser. Production bank writes and audit exports require this value. Use HTTPS for public deployment. For a local production build, set `APP_ORIGIN=http://localhost:3000` when opening that exact address.

For public deployments behind a trusted reverse proxy, set `AUTH_CLIENT_IP_HEADER` to the header that the proxy overwrites with a single client IP, for example `X-Real-IP`. Keep the Node server private to the proxy so browsers cannot supply this header directly. With the header configured, registration and login are throttled by client IP. Without it, the local setup uses a shared request budget and does not lock an account by username.

Run on a persistent **Node.js server** with a writable `DATA_DIR`. Do not deploy with an ephemeral filesystem (for example, a default serverless filesystem) because accounts and answers would be lost. For public deployment, use a managed database, backups, email verification/password recovery, authentication rate limits, and a reviewed question/audio catalog. The code is a runnable starting project for local use, not a production security assessment.

## Main files

- `src/lib/questions.ts`: original question bank and exam blueprint.
- `src/lib/db.ts`: SQLite initialization and tables.
- `src/lib/auth.ts`: account and session handling.
- `src/lib/attempts.ts`: section timing, persistence, and raw result calculation.
- `src/app/api`: HTTP endpoints.
- `src/components`: interactive dashboard, exam, and review.

## Kelola kelas dan materi

1. Daftar akun lokal, lalu jalankan `npm run admin:grant -- USERNAME admin` dari folder proyek dengan `DATA_DIR` yang sama seperti server. Jika server memuat `DATA_DIR` dari `.env.local`, ekspor nilai yang sama di terminal sebelum menjalankan perintah.
2. Buka Bank Soal untuk membuat soal atau mengimpor [contoh JSON](examples/questions-import.json). Naskah wajib untuk soal audio. Ajukan draf ke Review, lalu terbitkan dengan catatan pemeriksaan sebagai admin.
3. Buka Paket & Penugasan untuk menyusun paket dari revisi terbit. Admin dapat membuka akses publik untuk paket yang memenuhi syarat. Instruktur dapat membagikan paket terbit ke kelas yang dimilikinya.
4. Peserta bergabung dengan kode kelas di dashboard. Tenggat membatasi waktu mulai pertama. Buka katalog untuk melihat tugas dan riwayat. Instruktur dapat melihat hasil kelasnya dan mengekspor CSV dari halaman Analitik.
5. Admin dapat mengekspor revisi terbaru per soal untuk audit dari Bank Soal dan mengelola eksperimen prompt latihan dari halaman Eksperimen.
