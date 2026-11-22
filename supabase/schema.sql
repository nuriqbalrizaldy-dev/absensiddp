-- Schema & Realtime Setup untuk Aplikasi Absensi Pelatihan Bank Jakarta
-- Jalankan seluruh script ini di Supabase Dashboard -> SQL Editor

-- 1. Tabel Konfigurasi Pelatihan Aktif
CREATE TABLE IF NOT EXISTS public.training_config (
  id TEXT PRIMARY KEY CHECK (id = 'current'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  schedule_summary TEXT NOT NULL CHECK (char_length(schedule_summary) BETWEEN 3 AND 200),
  dates TEXT[] NOT NULL CHECK (cardinality(dates) BETWEEN 1 AND 31),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NOT NULL DEFAULT 'system' CHECK (char_length(updated_by) <= 128)
);

-- Seed data awal sesuai jadwal pelatihan
INSERT INTO public.training_config (id, title, schedule_summary, dates, updated_by)
VALUES (
  'current',
  'Pelatihan Dasar - Dasar Perbankan Reguler Angkatan XII Tahun 2026',
  '23/11/2026 - 27/11/2026, 30/11/2026 & 01/12/2026',
  ARRAY['23/11/2026', '24/11/2026', '25/11/2026', '26/11/2026', '27/11/2026', '30/11/2026', '01/12/2026'],
  'nuriqbalrizaldy@gmail.com'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Tabel Absensi Peserta
CREATE TABLE IF NOT EXISTS public.attendances (
  id TEXT PRIMARY KEY CHECK (id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  full_name TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
  position TEXT NOT NULL CHECK (char_length(position) BETWEEN 2 AND 120),
  session_date TEXT NOT NULL CHECK (session_date ~ '^[0-3][0-9]/[0-1][0-9]/20[2-9][0-9]$'),
  signature_data_url TEXT NOT NULL CHECK (
    char_length(signature_data_url) BETWEEN 100 AND 180000
    AND signature_data_url ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'
  ),
  training_title TEXT NOT NULL CHECK (char_length(training_title) BETWEEN 3 AND 200),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendances_submitted_at
  ON public.attendances (submitted_at DESC);

-- 3. Tabel Daftar Admin PIC Terotorisasi
CREATE TABLE IF NOT EXISTS public.admins (
  email TEXT PRIMARY KEY,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.admins (email)
VALUES ('nuriqbalrizaldy@gmail.com')
ON CONFLICT (email) DO NOTHING;

-- 4. Fungsi Helper Verifikasi Admin PIC
CREATE OR REPLACE FUNCTION public.is_pic_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'email') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.admins a
      WHERE lower(a.email) = lower(auth.jwt() ->> 'email')
    ),
    FALSE
  );
$$;

-- 5. Berikan Hak Akses Skema & Tabel (GRANT) lalu Aktifkan Row Level Security (RLS)
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON TABLE public.training_config TO anon, authenticated;
GRANT INSERT, UPDATE ON TABLE public.training_config TO authenticated;

GRANT INSERT ON TABLE public.attendances TO anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.attendances TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admins TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_pic_admin() TO anon, authenticated;

ALTER TABLE public.training_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Kebijakan training_config: semua peserta boleh baca judul & tanggal aktif; hanya Admin PIC boleh ubah
DROP POLICY IF EXISTS "Public read active training config" ON public.training_config;
CREATE POLICY "Public read active training config"
  ON public.training_config
  FOR SELECT
  TO anon, authenticated
  USING (id = 'current');

DROP POLICY IF EXISTS "Admin insert training config" ON public.training_config;
CREATE POLICY "Admin insert training config"
  ON public.training_config
  FOR INSERT
  TO authenticated
  WITH CHECK (id = 'current' AND public.is_pic_admin());

DROP POLICY IF EXISTS "Admin update training config" ON public.training_config;
CREATE POLICY "Admin update training config"
  ON public.training_config
  FOR UPDATE
  TO authenticated
  USING (id = 'current' AND public.is_pic_admin())
  WITH CHECK (id = 'current' AND public.is_pic_admin());

-- Kebijakan attendances: peserta publik hanya boleh INSERT; hanya Admin PIC boleh SELECT & DELETE
DROP POLICY IF EXISTS "Public insert attendance" ON public.attendances;
CREATE POLICY "Public insert attendance"
  ON public.attendances
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admin read attendances" ON public.attendances;
CREATE POLICY "Admin read attendances"
  ON public.attendances
  FOR SELECT
  TO authenticated
  USING (public.is_pic_admin());

DROP POLICY IF EXISTS "Admin delete attendances" ON public.attendances;
CREATE POLICY "Admin delete attendances"
  ON public.attendances
  FOR DELETE
  TO authenticated
  USING (public.is_pic_admin());

-- Kebijakan admins: hanya Admin PIC boleh melihat & mengelola daftar admin
DROP POLICY IF EXISTS "Admin manage admins" ON public.admins;
CREATE POLICY "Admin manage admins"
  ON public.admins
  FOR ALL
  TO authenticated
  USING (public.is_pic_admin())
  WITH CHECK (public.is_pic_admin());

-- 6. Aktifkan Supabase Realtime untuk perubahan langsung (live) secara idempoten
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'training_config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.training_config;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'attendances'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.attendances;
  END IF;
END
$$;
