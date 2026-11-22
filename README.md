# Aplikasi Absensi Pelatihan Karyawan — Bank Jakarta

Aplikasi web absensi peserta pelatihan dengan tanda tangan digital dan panel Admin PIC untuk penarikan data absensi (CSV/Excel & Cetak PDF) serta pengaturan judul dan jadwal pelatihan.

Mendukung **Supabase Realtime** (untuk deployment GitHub + Vercel) dan **Firebase Firestore** (preview bawaan AI Studio).

---

## Daftar File Penting untuk GitHub, Vercel & Supabase

Semua file berikut sudah disiapkan di proyek ini:

- **`src/`** — Seluruh kode aplikasi React + TypeScript + Tailwind CSS (termasuk `src/lib/supabase.ts` dan `src/services/attendanceService.ts` untuk Supabase Realtime).
- **`public/assets/aistudio/Bank_Jakarta.svg_cf38ce24.webp`** — Logo Bank Jakarta yang ditampilkan di header aplikasi.
- **`index.html`**, **`package.json`**, **`tsconfig.json`**, **`vite.config.ts`**, **`metadata.json`** — Konfigurasi utama build Vite + React.
- **`firebase-applet-config.json`** — Tetap disertakan di repository agar proses `vite build` di Vercel tidak error (diimpor oleh `src/firebase.ts` sebagai fallback non-Supabase).
- **`vercel.json`** — Konfigurasi deployment Vercel (Vite build + SPA rewrite agar rute `/admin` tidak 404).
- **`supabase/schema.sql`** — Script SQL pembuatan tabel, RLS security policy, seed jadwal pelatihan, dan aktivasi Supabase Realtime.
- **`.env.example`** — Template environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAIL`).
- **`.gitignore`** — Memastikan `node_modules/`, `dist/`, `.env*`, dan folder sementara tidak ikut terunggah ke GitHub.

---

## 1. Setup Supabase (Database & Realtime)

1. Buat project baru di [supabase.com](https://supabase.com).
2. Buka **SQL Editor** di dashboard Supabase, lalu salin dan jalankan seluruh isi file `supabase/schema.sql`.
   - Script tersebut otomatis membuat tabel `training_config`, `attendances`, dan `admins`, menerapkan **Row Level Security (RLS)**, serta mengaktifkan **Supabase Realtime**.
   - Jika email Admin PIC berbeda dari `nuriqbalrizaldy@gmail.com`, tambahkan email tersebut ke tabel `public.admins` di SQL Editor (`INSERT INTO public.admins (email) VALUES ('email_pic@anda.com') ON CONFLICT DO NOTHING;`).
3. Untuk login Admin PIC menggunakan Google:
   - Buka **Authentication → Providers → Google**, aktifkan provider Google dan masukkan Client ID / Client Secret OAuth Google Anda.
   - Di **Authentication → URL Configuration**, tambahkan URL Vercel Anda ke **Site URL** dan **Redirect URLs** (contoh: `https://nama-app-anda.vercel.app/admin`).
4. Salin **Project URL** dan **anon public key** dari **Project Settings → API**.

---

## 2. Publish ke GitHub

```bash
git init
git add .
git commit -m "Initial commit: Aplikasi Absensi Pelatihan Bank Jakarta"
git branch -M main
git remote add origin https://github.com/USERNAME_ANDA/NAMA_REPO.git
git push -u origin main
```

---

## 3. Deploy ke Vercel

1. Masuk ke [vercel.com](https://vercel.com), klik **Add New → Project**, lalu pilih repository GitHub Anda.
2. Pada bagian **Build & Development Settings** (otomatis terdeteksi dari `vercel.json`):
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Tambahkan **Environment Variables** di Vercel:
   - `VITE_SUPABASE_URL` = Project URL Supabase Anda
   - `VITE_SUPABASE_ANON_KEY` = Anon Public Key Supabase Anda
   - `VITE_ADMIN_EMAIL` = `nuriqbalrizaldy@gmail.com` *(opsional, sesuai email PIC)*
4. Klik **Deploy**.

---

## Akses Halaman

- **Halaman Absen Peserta (Publik)**: `https://domain-anda.vercel.app/`
- **Halaman Admin PIC (Terproteksi)**: `https://domain-anda.vercel.app/admin` (atau `/?mode=admin`)
