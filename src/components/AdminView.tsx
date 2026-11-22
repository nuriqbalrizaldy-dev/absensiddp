import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus,
  Check,
  Download,
  FileArchive,
  FileSpreadsheet,
  FileText,
  FolderGit2,
  Loader2,
  LogIn,
  LogOut,
  Printer,
  RotateCcw,
  Save,
  Search,
  ShieldAlert,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  deleteAttendanceRecord,
  saveTrainingConfig,
  subscribeAttendances,
  type AppAuthUser,
} from '../services/attendanceService';
import {
  buildParticipantMatrix,
  buildTrainingPdfSummaries,
  DEFAULT_TRAINING_CONFIG,
  FIELD_LIMITS,
  filterAttendances,
  formatIndonesianShortDate,
  formatScheduleSummary,
  formatTimestampId,
  generateAttendanceCsv,
  generateMatrixCsv,
  normalizeDateString,
  sortTrainingDates,
  validateTrainingConfigInput,
  type AttendanceRecord,
  type TrainingConfig,
  type TrainingPdfSummary,
} from '../utils/attendanceLogic';
import { downloadTrainingAttendancePdf } from '../utils/pdfExport';

interface AdminViewProps {
  user: AppAuthUser | null;
  authLoading: boolean;
  isAdmin: boolean;
  config: TrainingConfig;
  onGoogleSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  authError: string | null;
  onBackToParticipant: () => void;
}

type AdminTab = 'records' | 'settings' | 'publish';
type RecordsViewMode = 'log' | 'matrix';

function downloadCsvFile(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AdminView({
  user,
  authLoading,
  isAdmin,
  config,
  onGoogleSignIn,
  onSignOut,
  authError,
  onBackToParticipant,
}: AdminViewProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('records');
  const [viewMode, setViewMode] = useState<RecordsViewMode>('log');

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('ALL');
  const [trainingFilter, setTrainingFilter] = useState('ALL');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savedTrainingsHistory, setSavedTrainingsHistory] = useState<
    Array<{ title: string; scheduleSummary: string }>
  >(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('pic_created_trainings_v1');
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(parsed)
        ? parsed.filter(
            (item): item is { title: string; scheduleSummary: string } =>
              Boolean(item) && typeof (item as { title?: unknown }).title === 'string',
          )
        : [];
    } catch {
      return [];
    }
  });

  // Training settings editor state
  const [editTitle, setEditTitle] = useState(config.title);
  const [editDates, setEditDates] = useState<string[]>(config.dates);
  const [editSummary, setEditSummary] = useState(config.scheduleSummary);
  const [summaryManuallyEdited, setSummaryManuallyEdited] = useState(false);
  const [newDateInput, setNewDateInput] = useState('');
  const [dateAddError, setDateAddError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<{
    saving: boolean;
    error: string | null;
    success: string | null;
    generatedTitle: string | null;
  }>({ saving: false, error: null, success: null, generatedTitle: null });
  const [zipDownloadState, setZipDownloadState] = useState<{
    downloading: boolean;
    error: string | null;
    success: string | null;
  }>({ downloading: false, error: null, success: null });

  useEffect(() => {
    setEditTitle(config.title);
    setEditDates(config.dates);
    setEditSummary(config.scheduleSummary);
    setSummaryManuallyEdited(false);
  }, [config.title, config.dates, config.scheduleSummary]);

  useEffect(() => {
    if (authLoading || !user || !isAdmin) {
      setRecords([]);
      setRecordsLoading(false);
      return;
    }

    setRecordsLoading(true);
    setRecordsError(null);

    const unsubscribe = subscribeAttendances(
      (data) => {
        setRecords(data);
        setRecordsLoading(false);
      },
      (err) => {
        setRecordsLoading(false);
        setRecordsError(
          err.message || 'Gagal memuat data absensi dari Firestore.',
        );
      },
    );

    return () => unsubscribe();
  }, [authLoading, user, isAdmin]);

  const trainingPdfSummaries = useMemo(
    () => buildTrainingPdfSummaries(records, config, savedTrainingsHistory),
    [records, config, savedTrainingsHistory],
  );

  const filteredRecords = useMemo(
    () =>
      filterAttendances(records, {
        searchQuery,
        sessionDate: dateFilter,
        trainingTitle: trainingFilter,
      }),
    [records, searchQuery, dateFilter, trainingFilter],
  );

  const matrixRows = useMemo(
    () => buildParticipantMatrix(filteredRecords, config.dates),
    [filteredRecords, config.dates],
  );

  const uniqueParticipantCount = useMemo(
    () => buildParticipantMatrix(records, config.dates).length,
    [records, config.dates],
  );

  const activeExportSummary: TrainingPdfSummary | null = useMemo(() => {
    if (trainingFilter !== 'ALL') {
      return (
        trainingPdfSummaries.find((s) => s.trainingTitle === trainingFilter) ??
        trainingPdfSummaries[0] ??
        null
      );
    }
    return trainingPdfSummaries[0] ?? null;
  }, [trainingFilter, trainingPdfSummaries]);

  const handleAddDate = () => {
    setDateAddError(null);
    const normalized = normalizeDateString(newDateInput);
    if (!normalized) {
      setDateAddError('Pilih tanggal yang valid terlebih dahulu.');
      return;
    }
    if (editDates.includes(normalized)) {
      setDateAddError(`Tanggal ${normalized} sudah ada dalam daftar.`);
      return;
    }
    if (editDates.length >= FIELD_LIMITS.MAX_DATES_COUNT) {
      setDateAddError(`Maksimal ${FIELD_LIMITS.MAX_DATES_COUNT} tanggal pelatihan.`);
      return;
    }

    const updatedDates = sortTrainingDates([...editDates, normalized]);
    setEditDates(updatedDates);
    if (!summaryManuallyEdited) {
      setEditSummary(formatScheduleSummary(updatedDates));
    }
    setNewDateInput('');
  };

  const handleRemoveDate = (dateToRemove: string) => {
    const updatedDates = editDates.filter((d) => d !== dateToRemove);
    setEditDates(updatedDates);
    if (!summaryManuallyEdited) {
      setEditSummary(formatScheduleSummary(updatedDates));
    }
  };

  const handleResetDefaultConfig = () => {
    setEditTitle(DEFAULT_TRAINING_CONFIG.title);
    setEditDates([...DEFAULT_TRAINING_CONFIG.dates]);
    setEditSummary(DEFAULT_TRAINING_CONFIG.scheduleSummary);
    setSummaryManuallyEdited(false);
    setDateAddError(null);
    setSaveState({ saving: false, error: null, success: null, generatedTitle: null });
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const validation = validateTrainingConfigInput({
      title: editTitle,
      dates: editDates,
      scheduleSummary: editSummary,
    });
    if (!validation.valid) {
      const msg =
        validation.errors.title ||
        validation.errors.dates ||
        validation.errors.scheduleSummary ||
        'Periksa kembali data pelatihan.';
      setSaveState({ saving: false, error: msg, success: null, generatedTitle: null });
      return;
    }

    setSaveState({ saving: true, error: null, success: null, generatedTitle: null });
    try {
      const saved = await saveTrainingConfig(
        {
          title: editTitle,
          dates: editDates,
          scheduleSummary: editSummary,
        },
        user.email || user.uid,
      );
      setSavedTrainingsHistory((prev) => {
        const filtered = prev.filter((item) => item.title.trim() !== saved.title.trim());
        const next = [{ title: saved.title, scheduleSummary: saved.scheduleSummary }, ...filtered];
        try {
          window.localStorage.setItem('pic_created_trainings_v1', JSON.stringify(next));
        } catch {
          // Ignore storage quota errors
        }
        return next;
      });
      setSaveState({
        saving: false,
        error: null,
        success:
          'Pengaturan pelatihan berhasil disimpan dan file PDF baru untuk nama pelatihan ini siap diunduh.',
        generatedTitle: saved.title,
      });
    } catch (err) {
      let msg = 'Gagal menyimpan perubahan pelatihan.';
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message) as { error?: string };
          msg = parsed.error || err.message;
        } catch {
          msg = err.message;
        }
      }
      setSaveState({ saving: false, error: msg, success: null, generatedTitle: null });
    }
  };

  const handleDeleteRecord = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteAttendanceRecord(id);
      setConfirmDeleteId(null);
    } catch (err) {
      setRecordsError(
        err instanceof Error ? err.message : 'Gagal menghapus catatan absensi.',
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadCsv = () => {
    const safeDateTag = new Date().toISOString().slice(0, 10);
    const activeTitle = trainingFilter !== 'ALL' ? trainingFilter : config.title;
    if (viewMode === 'matrix') {
      const csv = generateMatrixCsv(matrixRows, config.dates, activeTitle);
      downloadCsvFile(csv, `matriks-absensi-pelatihan-${safeDateTag}.csv`);
    } else {
      const csv = generateAttendanceCsv(filteredRecords, activeTitle);
      downloadCsvFile(csv, `tarikan-absensi-pelatihan-${safeDateTag}.csv`);
    }
  };

  const handleDownloadGithubZip = async () => {
    setZipDownloadState({ downloading: true, error: null, success: null });
    try {
      const response = await fetch('/absensi-pelatihan-github.zip', { cache: 'no-store' });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || contentType.includes('text/html')) {
        throw new Error(
          'Paket ZIP belum tersedia pada deployment ini. Gunakan file hasil ekstrak dari GitHub atau AI Studio.',
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'absensi-pelatihan-bank-jakarta-github.zip');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setZipDownloadState({
        downloading: false,
        error: null,
        success:
          'File ZIP berhasil diunduh. Ekstrak folder ZIP tersebut, lalu upload isinya ke repository GitHub Anda.',
      });
    } catch (err) {
      setZipDownloadState({
        downloading: false,
        error:
          err instanceof Error
            ? err.message
            : 'Gagal mengunduh paket ZIP untuk GitHub.',
        success: null,
      });
    }
  };

  if (authLoading) {
    return (
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <div className="bg-white border border-neutral-200 rounded-xl p-10 text-center">
          <Loader2
            className="w-6 h-6 animate-spin text-[#D9380B] mx-auto mb-3"
            aria-hidden="true"
          />
          <p className="text-sm text-neutral-600">Memeriksa sesi autentikasi PIC Admin...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-5">
        <section className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8">
          <p className="text-xs font-semibold text-[#C23008] mb-2">
            Akses Khusus Penanggung Jawab
          </p>
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-950">
            Portal Admin PIC Pelatihan
          </h1>
          <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
            Masuk menggunakan akun Google PIC Pelatihan untuk menarik data rekap absensi,
            mengunduh laporan CSV/cetak, serta mengubah judul dan jadwal waktu pelatihan.
          </p>

          {authError && (
            <div
              role="alert"
              className="mt-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
            >
              {authError}
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBackToParticipant}
              className="px-4 py-2.5 text-sm font-medium text-neutral-800 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
            >
              Kembali ke Absen Peserta
            </button>
            <button
              type="button"
              onClick={onGoogleSignIn}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#D9380B] hover:bg-[#B82D07] rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9380B] focus-visible:ring-offset-2"
            >
              <LogIn className="w-4 h-4" aria-hidden="true" />
              Masuk dengan Google
            </button>
          </div>
        </section>

        <section className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-7 space-y-4">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-lg bg-orange-50 text-[#D9380B] flex items-center justify-center shrink-0">
              <FolderGit2 className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-neutral-950">
                Paket File Siap Upload ke GitHub &amp; Vercel
              </h2>
              <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                Unduh arsip ZIP berisi seluruh file proyek yang bersih (tanpa{' '}
                <span className="font-mono">node_modules</span> atau file sementara) untuk
                langsung di-upload ke GitHub.
              </p>
            </div>
          </div>

          {zipDownloadState.error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
            >
              {zipDownloadState.error}
            </div>
          )}

          {zipDownloadState.success && (
            <div
              role="status"
              className="p-3 rounded-lg bg-orange-50 border border-orange-200 text-xs text-[#9A2606] flex items-center gap-2 font-medium"
            >
              <Check className="w-4 h-4 shrink-0 text-[#D9380B]" aria-hidden="true" />
              <span>{zipDownloadState.success}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleDownloadGithubZip}
            disabled={zipDownloadState.downloading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-neutral-950 hover:bg-neutral-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9380B] focus-visible:ring-offset-2"
          >
            {zipDownloadState.downloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Menyiapkan File ZIP...
              </>
            ) : (
              <>
                <FileArchive className="w-4 h-4" aria-hidden="true" />
                Download Paket ZIP untuk GitHub
              </>
            )}
          </button>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <section className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8">
          <div className="w-10 h-10 rounded-lg bg-orange-50 text-[#D9380B] flex items-center justify-center mb-4">
            <ShieldAlert className="w-5 h-5" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-neutral-950">
            Akun Tidak Memiliki Izin Admin PIC
          </h1>
          <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
            Anda masuk sebagai <span className="font-semibold text-neutral-950">{user.email}</span>.
            Akses penarikan data absensi dan perubahan jadwal pelatihan hanya diberikan kepada akun
            PIC terotorisasi ({BOOTSTRAPPED_ADMIN_EMAIL}).
          </p>

          <div className="mt-6 pt-6 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBackToParticipant}
              className="px-4 py-2.5 text-sm font-medium text-neutral-800 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors whitespace-nowrap"
            >
              Halaman Absen Peserta
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-neutral-950 hover:bg-neutral-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Keluar &amp; Ganti Akun
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Print-only formal training header */}
      <div className="hidden print-only mb-6 pb-4 border-b border-neutral-900">
        <p className="text-xs uppercase tracking-wider text-neutral-600 mb-1">
          Daftar Hadir Resmi Peserta Pelatihan
        </p>
        <h1 className="text-xl font-bold text-neutral-950">{config.title}</h1>
        <p className="text-sm text-neutral-700 mt-1 font-mono tabular-nums">
          Waktu Pelatihan: {config.scheduleSummary}
        </p>
      </div>

      {/* Screen Header */}
      <section className="no-print flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 mb-1.5">
            <span className="font-semibold text-[#C23008]">Panel Admin PIC</span>
            <span aria-hidden="true">·</span>
            <span>{user.email}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950 [text-wrap:balance]">
            {config.title}
          </h1>
          <p className="text-sm text-neutral-600 mt-1 font-mono tabular-nums">
            {config.scheduleSummary}
          </p>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="sm:hidden inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-neutral-800 bg-white border border-neutral-300 rounded-lg"
        >
          <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
          Keluar Admin
        </button>
      </section>

      {/* 4-Column KPI Summary Strip */}
      <section
        aria-label="Ringkasan data absensi"
        className="no-print grid grid-cols-2 lg:grid-cols-4 bg-white border border-neutral-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-neutral-200"
      >
        <div className="p-5">
          <p className="text-xs text-neutral-500 mb-1">Total Catatan Absen</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-neutral-950">
            {records.length}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-neutral-500 mb-1">Peserta Unik</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-neutral-950">
            {uniqueParticipantCount}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-neutral-500 mb-1">Hari Pelatihan</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-neutral-950">
            {config.dates.length}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs text-neutral-500 mb-1">Hasil Filter Aktif</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-[#C23008]">
            {filteredRecords.length}
          </p>
        </div>
      </section>

      {/* Primary Section Tabs */}
      <div
        className="no-print border-b border-neutral-200 flex items-center gap-6 overflow-x-auto"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'records'}
          onClick={() => setActiveTab('records')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9380B] ${
            activeTab === 'records'
              ? 'border-[#D9380B] text-neutral-950'
              : 'border-transparent text-neutral-500 hover:text-neutral-950'
          }`}
        >
          Tarikan &amp; Rekap Absen
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'settings'}
          onClick={() => setActiveTab('settings')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9380B] ${
            activeTab === 'settings'
              ? 'border-[#D9380B] text-neutral-950'
              : 'border-transparent text-neutral-500 hover:text-neutral-950'
          }`}
        >
          Edit Nama &amp; Waktu Pelatihan
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'publish'}
          onClick={() => setActiveTab('publish')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9380B] ${
            activeTab === 'publish'
              ? 'border-[#D9380B] text-neutral-950'
              : 'border-transparent text-neutral-500 hover:text-neutral-950'
          }`}
        >
          Publish GitHub &amp; Vercel
        </button>
      </div>

      {/* TAB 1: RECORDS & EXPORT */}
      {activeTab === 'records' && (
        <section className="space-y-4">
          {recordsError && (
            <div
              role="alert"
              className="no-print p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800"
            >
              {recordsError}
            </div>
          )}

          {/* Per-Training Ready-to-Download PDF Files */}
          <div className="no-print bg-white border border-neutral-200 rounded-xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-neutral-950">
                  File PDF Siap Download per Nama Pelatihan ({trainingPdfSummaries.length})
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Setiap nama pelatihan memiliki file PDF dan daftar hadir tersendiri. Mengubah
                  nama pelatihan di tab sebelah akan langsung membuat file PDF baru di sini.
                </p>
              </div>
            </div>

            <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-lg">
              {trainingPdfSummaries.map((summary) => {
                const isSelected = trainingFilter === summary.trainingTitle;
                return (
                  <div
                    key={summary.trainingTitle}
                    className={`p-3.5 sm:px-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${
                      isSelected ? 'bg-orange-50/40' : 'bg-white'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-neutral-950 break-words">
                          {summary.trainingTitle}
                        </span>
                        {summary.isActive && (
                          <span className="px-2 py-0.5 text-[11px] font-semibold bg-orange-50 text-[#C23008] border border-orange-200 rounded">
                            Aktif
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                        <span className="font-mono text-[11px] text-neutral-700 break-all">
                          {summary.filename}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {summary.recordCount} absensi ({summary.uniqueParticipants} peserta)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setTrainingFilter(isSelected ? 'ALL' : summary.trainingTitle)
                        }
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                          isSelected
                            ? 'bg-neutral-950 text-white border-neutral-950'
                            : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                        }`}
                      >
                        {isSelected ? 'Tampilkan Semua' : 'Lihat Data'}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTrainingAttendancePdf(summary)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#D9380B] hover:bg-[#B82D07] rounded-lg transition-colors whitespace-nowrap"
                      >
                        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                        Download PDF
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Toolbar */}
          <div className="no-print bg-white border border-neutral-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search
                  className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Cari nama peserta atau jabatan"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama atau jabatan..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D9380B]/20 focus:border-[#D9380B]"
                />
              </div>

              <select
                aria-label="Filter nama pelatihan"
                value={trainingFilter}
                onChange={(e) => setTrainingFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white text-neutral-900 max-w-xs truncate focus:outline-none focus:ring-2 focus:ring-[#D9380B]/20 focus:border-[#D9380B]"
              >
                <option value="ALL">
                  Semua Nama Pelatihan ({trainingPdfSummaries.length})
                </option>
                {trainingPdfSummaries.map((s) => (
                  <option key={s.trainingTitle} value={s.trainingTitle}>
                    {s.trainingTitle} ({s.recordCount})
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter tanggal waktu pelatihan"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white text-neutral-900 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-[#D9380B]/20 focus:border-[#D9380B]"
              >
                <option value="ALL">Semua Tanggal ({config.dates.length})</option>
                {config.dates.map((d) => (
                  <option key={d} value={d}>
                    {formatIndonesianShortDate(d)}
                  </option>
                ))}
              </select>

              <div
                role="group"
                aria-label="Mode tampilan tabel"
                className="inline-flex items-center p-1 bg-neutral-100 rounded-lg shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('log')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    viewMode === 'log'
                      ? 'bg-neutral-950 text-white'
                      : 'text-neutral-600 hover:text-neutral-950'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                  Log Absensi
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('matrix')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    viewMode === 'matrix'
                      ? 'bg-neutral-950 text-white'
                      : 'text-neutral-600 hover:text-neutral-950'
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Matriks Daftar Hadir
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadCsv}
                disabled={filteredRecords.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#D9380B] hover:bg-[#B82D07] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Unduh CSV (Excel)
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={filteredRecords.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-neutral-800 bg-white border border-neutral-300 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                Cetak / PDF
              </button>
            </div>
          </div>

          {/* Data Table Container */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            {recordsLoading ? (
              <div className="p-6 space-y-3 animate-pulse">
                {[1, 2, 3, 4].map((row) => (
                  <div key={row} className="h-10 bg-neutral-100 rounded" />
                ))}
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm font-semibold text-neutral-900">
                  {records.length === 0
                    ? 'Belum ada data absensi masuk'
                    : 'Tidak ada data yang sesuai filter'}
                </p>
                <p className="text-xs text-neutral-500 mt-1 max-w-md mx-auto">
                  {records.length === 0
                    ? 'Data absensi akan muncul secara otomatis di sini segera setelah peserta mengisi formulir dan menekan tombol Simpan.'
                    : 'Ubah kata kunci pencarian atau pilih "Semua Tanggal" untuk melihat seluruh catatan.'}
                </p>
                {(searchQuery || dateFilter !== 'ALL' || trainingFilter !== 'ALL') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setDateFilter('ALL');
                      setTrainingFilter('ALL');
                    }}
                    className="mt-4 px-4 py-2 text-xs font-medium text-neutral-900 border border-neutral-300 rounded-lg hover:bg-neutral-50"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            ) : viewMode === 'log' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                      <th className="py-3 px-4 w-12 font-mono tabular-nums">No</th>
                      <th className="py-3 px-4">Nama Lengkap</th>
                      <th className="py-3 px-4">Jabatan</th>
                      <th className="py-3 px-4">Waktu Pelatihan</th>
                      <th className="py-3 px-4">Tanda Tangan</th>
                      <th className="py-3 px-4">Waktu Simpan</th>
                      <th className="no-print py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 text-sm">
                    {filteredRecords.map((rec, index) => (
                      <tr
                        key={rec.id}
                        className="hover:bg-neutral-50 transition-colors print-break-inside-avoid"
                      >
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-neutral-500">
                          {index + 1}
                        </td>
                        <td className="py-3 px-4 font-medium text-neutral-950">
                          {rec.fullName}
                        </td>
                        <td className="py-3 px-4 text-neutral-700">{rec.position}</td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-[#C23008] font-semibold whitespace-nowrap">
                          {rec.sessionDate}
                        </td>
                        <td className="py-2 px-4">
                          {rec.signatureDataUrl ? (
                            <img
                              src={rec.signatureDataUrl}
                              alt={`Tanda tangan ${rec.fullName}`}
                              className="h-10 w-28 object-contain bg-white border border-neutral-200 rounded px-1"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-xs text-neutral-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-neutral-600 whitespace-nowrap">
                          {formatTimestampId(rec.submittedAtMs)}
                        </td>
                        <td className="no-print py-3 px-4 text-right whitespace-nowrap">
                          {confirmDeleteId === rec.id ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={deletingId === rec.id}
                                onClick={() => handleDeleteRecord(rec.id)}
                                className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                              >
                                {deletingId === rec.id ? 'Menghapus...' : 'Hapus'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2.5 py-1 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded transition-colors"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Hapus absensi ${rec.fullName} tanggal ${rec.sessionDate}`}
                              onClick={() => setConfirmDeleteId(rec.id)}
                              className="p-1.5 text-neutral-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Matriks Daftar Hadir (Peserta x Tanggal Waktu Pelatihan) */
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                      <th className="py-3 px-3 w-10 font-mono tabular-nums border-r border-neutral-200">
                        No
                      </th>
                      <th className="py-3 px-4 min-w-[160px] border-r border-neutral-200">
                        Nama Lengkap
                      </th>
                      <th className="py-3 px-4 min-w-[130px] border-r border-neutral-200">
                        Jabatan
                      </th>
                      {config.dates.map((d) => (
                        <th
                          key={d}
                          className="py-3 px-2 text-center min-w-[110px] border-r border-neutral-200 font-mono tabular-nums"
                        >
                          {d}
                        </th>
                      ))}
                      <th className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 text-xs">
                    {matrixRows.map((row, index) => (
                      <tr key={row.key} className="print-break-inside-avoid">
                        <td className="py-2.5 px-3 font-mono tabular-nums text-neutral-500 border-r border-neutral-200">
                          {index + 1}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-neutral-950 border-r border-neutral-200">
                          {row.fullName}
                        </td>
                        <td className="py-2.5 px-4 text-neutral-700 border-r border-neutral-200">
                          {row.position}
                        </td>
                        {config.dates.map((d) => {
                          const session = row.sessions[d];
                          return (
                            <td
                              key={d}
                              className="py-2 px-2 text-center border-r border-neutral-200 align-middle"
                            >
                              {session ? (
                                <div className="inline-flex flex-col items-center gap-0.5">
                                  <img
                                    src={session.signatureDataUrl}
                                    alt={`Paraf ${row.fullName} ${d}`}
                                    className="h-9 w-24 object-contain"
                                    referrerPolicy="no-referrer"
                                  />
                                  <span className="text-[10px] font-mono tabular-nums text-neutral-400">
                                    {formatTimestampId(session.submittedAtMs).split(' ')[1]}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-neutral-300">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-[#C23008]">
                          {row.attendedCount}/{config.dates.length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 2: EDIT TRAINING TITLE & SCHEDULE */}
      {activeTab === 'settings' && (
        <section className="no-print max-w-3xl">
          <form
            onSubmit={handleSaveConfig}
            className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-6"
          >
            <div>
              <h2 className="text-lg font-bold text-neutral-950">
                Pengaturan Judul &amp; Waktu Pelatihan
              </h2>
              <p className="text-xs text-neutral-500 mt-1">
                Perubahan yang disimpan akan langsung memperbarui formulir absensi peserta secara otomatis.
              </p>
            </div>

            {saveState.error && (
              <div
                role="alert"
                className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
              >
                {saveState.error}
              </div>
            )}

            {saveState.success && (
              <div
                role="status"
                className="p-4 rounded-lg bg-orange-50 border border-orange-200 text-xs text-[#9A2606] space-y-3 font-medium"
              >
                <div className="flex items-start gap-2">
                  <Check className="w-4 h-4 shrink-0 text-[#D9380B] mt-0.5" aria-hidden="true" />
                  <span>{saveState.success}</span>
                </div>
                {(() => {
                  const targetSummary =
                    trainingPdfSummaries.find(
                      (s) => s.trainingTitle === (saveState.generatedTitle || config.title),
                    ) ?? activeExportSummary;
                  if (!targetSummary) return null;
                  return (
                    <div className="pt-2 border-t border-orange-200/80 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-neutral-800 break-all">
                        {targetSummary.filename}
                      </span>
                      <button
                        type="button"
                        onClick={() => downloadTrainingAttendancePdf(targetSummary)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#D9380B] hover:bg-[#B82D07] rounded-lg transition-colors whitespace-nowrap"
                      >
                        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                        Download PDF Pelatihan Ini
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Edit Judul Pelatihan */}
            <div>
              <label
                htmlFor="editTrainingTitle"
                className="block text-sm font-semibold text-neutral-900 mb-2"
              >
                Judul / Nama Pelatihan
              </label>
              <input
                id="editTrainingTitle"
                type="text"
                maxLength={FIELD_LIMITS.MAX_TITLE_LENGTH}
                value={editTitle}
                onChange={(e) => {
                  setEditTitle(e.target.value);
                  setSaveState((prev) => ({
                    ...prev,
                    success: null,
                    error: null,
                    generatedTitle: null,
                  }));
                }}
                className="w-full px-3.5 py-2.5 text-sm text-neutral-950 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D9380B]/20 focus:border-[#D9380B]"
              />
            </div>

            {/* Daftar Tanggal Waktu Pelatihan */}
            <div className="pt-4 border-t border-neutral-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="addTrainingDateInput"
                  className="block text-sm font-semibold text-neutral-900"
                >
                  Tanggal Waktu Pelatihan ({editDates.length} hari)
                </label>
                <button
                  type="button"
                  onClick={handleResetDefaultConfig}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-950"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  Kembalikan Jadwal Angkatan XII
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="addTrainingDateInput"
                  type="date"
                  value={newDateInput}
                  onChange={(e) => {
                    setNewDateInput(e.target.value);
                    setDateAddError(null);
                  }}
                  className="px-3 py-2 text-sm font-mono tabular-nums border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D9380B]/20 focus:border-[#D9380B]"
                />
                <button
                  type="button"
                  onClick={handleAddDate}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <CalendarPlus className="w-4 h-4 text-[#D9380B]" aria-hidden="true" />
                  Tambah Tanggal
                </button>
              </div>

              {dateAddError && (
                <p role="alert" className="text-xs text-red-600 font-medium">
                  {dateAddError}
                </p>
              )}

              <div className="border border-neutral-200 rounded-lg divide-y divide-neutral-200">
                {editDates.length === 0 ? (
                  <p className="p-4 text-xs text-neutral-500">
                    Belum ada tanggal dipilih. Tambahkan minimal 1 tanggal pelatihan.
                  </p>
                ) : (
                  editDates.map((d, idx) => (
                    <div
                      key={d}
                      className="px-4 py-2.5 flex items-center justify-between gap-4 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono tabular-nums text-neutral-400 w-6">
                          {idx + 1}.
                        </span>
                        <span className="font-mono tabular-nums font-medium text-neutral-900">
                          {formatIndonesianShortDate(d)}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Hapus tanggal ${d}`}
                        onClick={() => handleRemoveDate(d)}
                        className="p-1 text-neutral-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                      >
                        <X className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Ringkasan Teks Waktu Pelatihan */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="editScheduleSummary"
                  className="block text-sm font-semibold text-neutral-900"
                >
                  Teks Ringkasan Waktu Pelatihan
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setEditSummary(formatScheduleSummary(editDates));
                    setSummaryManuallyEdited(false);
                  }}
                  className="text-xs font-medium text-[#C23008] hover:underline"
                >
                  Buat otomatis dari daftar tanggal
                </button>
              </div>
              <input
                id="editScheduleSummary"
                type="text"
                maxLength={FIELD_LIMITS.MAX_SCHEDULE_SUMMARY_LENGTH}
                value={editSummary}
                onChange={(e) => {
                  setEditSummary(e.target.value);
                  setSummaryManuallyEdited(true);
                  setSaveState((prev) => ({ ...prev, success: null, error: null }));
                }}
                className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums text-neutral-950 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D9380B]/20 focus:border-[#D9380B]"
              />
            </div>

            <div className="pt-4 border-t border-neutral-200 flex justify-end">
              <button
                type="submit"
                disabled={saveState.saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#D9380B] hover:bg-[#B82D07] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap"
              >
                {saveState.saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" aria-hidden="true" />
                    Simpan Pengaturan Pelatihan
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* TAB 3: PUBLISH GITHUB & VERCEL */}
      {activeTab === 'publish' && (
        <section className="no-print max-w-3xl space-y-6">
          <div className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-lg bg-orange-50 text-[#D9380B] flex items-center justify-center shrink-0">
                <FolderGit2 className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-neutral-950">
                  Unduh Paket File Siap Upload ke GitHub
                </h2>
                <p className="text-sm text-neutral-600 mt-1 leading-relaxed">
                  File ZIP ini sudah dirapikan khusus untuk upload ke GitHub dan deploy ke Vercel
                  dengan Supabase Realtime (sudah otomatis mengecualikan folder{' '}
                  <span className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded">
                    node_modules
                  </span>{' '}
                  dan{' '}
                  <span className="font-mono text-xs bg-neutral-100 px-1.5 py-0.5 rounded">
                    dist
                  </span>
                  ).
                </p>
              </div>
            </div>

            {zipDownloadState.error && (
              <div
                role="alert"
                className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
              >
                {zipDownloadState.error}
              </div>
            )}

            {zipDownloadState.success && (
              <div
                role="status"
                className="p-3.5 rounded-lg bg-orange-50 border border-orange-200 text-xs text-[#9A2606] flex items-center gap-2 font-medium"
              >
                <Check className="w-4 h-4 shrink-0 text-[#D9380B]" aria-hidden="true" />
                <span>{zipDownloadState.success}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleDownloadGithubZip}
                disabled={zipDownloadState.downloading}
                className="inline-flex items-center gap-2.5 px-5 py-3 text-sm font-semibold text-white bg-[#D9380B] hover:bg-[#B82D07] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9380B] focus-visible:ring-offset-2"
              >
                {zipDownloadState.downloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    Menyiapkan ZIP...
                  </>
                ) : (
                  <>
                    <FileArchive className="w-4 h-4" aria-hidden="true" />
                    Download Paket ZIP untuk GitHub
                  </>
                )}
              </button>
            </div>

            <div className="pt-5 border-t border-neutral-200 space-y-3 text-xs text-neutral-600 leading-relaxed">
              <p className="font-semibold text-neutral-900 text-sm">
                Langkah singkat setelah mengunduh ZIP:
              </p>
              <ol className="list-decimal list-inside space-y-1.5">
                <li>
                  Ekstrak file <span className="font-mono text-neutral-900">absensi-pelatihan-bank-jakarta-github.zip</span> di komputer Anda.
                </li>
                <li>
                  Buka repository baru Anda di <span className="font-semibold text-neutral-900">github.com</span>, klik{' '}
                  <span className="font-semibold text-neutral-900">uploading an existing file</span>, lalu seret seluruh isi folder hasil ekstrak tersebut (atau gunakan GitHub Desktop).
                </li>
                <li>
                  Jalankan isi file <span className="font-mono text-neutral-900">supabase/schema.sql</span> di SQL Editor Supabase, lalu hubungkan repository GitHub ke Vercel dan isi Environment Variables{' '}
                  <span className="font-mono text-neutral-900">VITE_SUPABASE_URL</span>,{' '}
                  <span className="font-mono text-neutral-900">VITE_SUPABASE_ANON_KEY</span>, dan{' '}
                  <span className="font-mono text-neutral-900">VITE_ADMIN_EMAIL</span>.
                </li>
              </ol>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
