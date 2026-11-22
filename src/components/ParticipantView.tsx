import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, PenTool, RotateCcw } from 'lucide-react';
import { submitAttendance } from '../services/attendanceService';
import {
  FIELD_LIMITS,
  formatIndonesianShortDate,
  formatTimestampId,
  pickDefaultSessionDate,
  validateAttendanceInput,
  type AttendanceInput,
  type AttendanceValidationResult,
  type TrainingConfig,
} from '../utils/attendanceLogic';
import { SignaturePad } from './SignaturePad';

interface ParticipantViewProps {
  config: TrainingConfig;
  configLoading: boolean;
}

interface SubmittedReceipt {
  id: string;
  record: AttendanceInput;
  submittedAtMs: number;
}

export function ParticipantView({ config, configLoading }: ParticipantViewProps) {
  const [fullName, setFullName] = useState('');
  const [position, setPosition] = useState('');
  const [selectedDate, setSelectedDate] = useState(() =>
    pickDefaultSessionDate(config.dates),
  );
  const [signatureDataUrl, setSignatureDataUrl] = useState('');
  const [fieldErrors, setFieldErrors] = useState<AttendanceValidationResult['errors']>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<SubmittedReceipt | null>(null);

  useEffect(() => {
    if (config.dates.length > 0 && !config.dates.includes(selectedDate)) {
      setSelectedDate(pickDefaultSessionDate(config.dates));
    }
  }, [config.dates, selectedDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const payload: AttendanceInput = {
      fullName,
      position,
      sessionDate: selectedDate,
      signatureDataUrl,
      trainingTitle: config.title,
    };

    const validation = validateAttendanceInput(payload);
    if (!validation.valid) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const saved = await submitAttendance(payload);
      setReceipt(saved);
    } catch (err) {
      let msg = 'Gagal mengirim absensi ke database. Silakan coba lagi.';
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message) as { error?: string };
          msg = parsed.error || err.message;
        } catch {
          msg = err.message;
        }
      }
      setSubmitError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setReceipt(null);
    setFullName('');
    setPosition('');
    setSignatureDataUrl('');
    setFieldErrors({});
    setSubmitError(null);
  };

  if (receipt) {
    return (
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <section
          aria-live="polite"
          className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-10"
        >
          <div className="flex items-start gap-4 pb-6 border-b border-neutral-200">
            <div className="w-11 h-11 rounded-lg bg-orange-50 text-[#D9380B] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold text-[#C23008] mb-1">
                Tercatat di Database
              </p>
              <h1 className="text-xl sm:text-2xl font-bold text-neutral-950">
                Absensi Berhasil Disimpan
              </h1>
              <p className="text-sm text-neutral-600 mt-1">
                {receipt.record.trainingTitle}
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 py-6 border-b border-neutral-200 text-sm">
            <div>
              <dt className="text-xs text-neutral-500 mb-1">Nama Lengkap</dt>
              <dd className="font-semibold text-neutral-950">{receipt.record.fullName}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500 mb-1">Jabatan</dt>
              <dd className="font-semibold text-neutral-950">{receipt.record.position}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500 mb-1">Waktu Pelatihan</dt>
              <dd className="font-mono tabular-nums font-semibold text-[#C23008]">
                {formatIndonesianShortDate(receipt.record.sessionDate)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500 mb-1">Waktu Simpan</dt>
              <dd className="font-mono tabular-nums text-neutral-800">
                {formatTimestampId(receipt.submittedAtMs)}
              </dd>
            </div>
          </dl>

          <div className="py-6">
            <p className="text-xs text-neutral-500 mb-2">Tanda Tangan Digital</p>
            <div className="border border-neutral-200 rounded-lg bg-neutral-50 p-4 inline-flex items-center justify-center">
              <img
                src={receipt.record.signatureDataUrl}
                alt={`Tanda tangan digital ${receipt.record.fullName}`}
                className="h-24 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-neutral-500 font-mono tabular-nums">
              ID: {receipt.id}
            </p>
            <button
              type="button"
              onClick={handleResetForm}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#D9380B] hover:bg-[#B82D07] rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9380B] focus-visible:ring-offset-2"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              Isi Absensi Peserta Lain
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      {/* Training Identity Header */}
      <section className="mb-8">
        <p className="text-xs font-semibold text-[#C23008] mb-2">
          Formulir Daftar Hadir Peserta
        </p>
        {configLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-8 bg-neutral-200 rounded w-3/4" />
          </div>
        ) : (
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950 [text-wrap:balance]">
            {config.title}
          </h1>
        )}
      </section>

      {/* Main Attendance Form */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-7"
      >
        {submitError && (
          <div
            role="alert"
            className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800"
          >
            {submitError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Nama Lengkap */}
          <div>
            <label
              htmlFor="fullName"
              className="block text-sm font-semibold text-neutral-900 mb-2"
            >
              Nama Lengkap <span className="text-[#D9380B]">*</span>
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              required
              maxLength={FIELD_LIMITS.MAX_NAME_LENGTH}
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                if (fieldErrors.fullName) {
                  setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                }
              }}
              placeholder="Contoh: Budi Santoso"
              className={`w-full px-3.5 py-2.5 text-sm text-neutral-950 bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#D9380B]/20 focus:border-[#D9380B] ${
                fieldErrors.fullName ? 'border-red-600' : 'border-neutral-300'
              }`}
            />
            {fieldErrors.fullName && (
              <p role="alert" className="mt-1.5 text-xs text-red-600 font-medium">
                {fieldErrors.fullName}
              </p>
            )}
          </div>

          {/* Jabatan */}
          <div>
            <label
              htmlFor="position"
              className="block text-sm font-semibold text-neutral-900 mb-2"
            >
              Jabatan <span className="text-[#D9380B]">*</span>
            </label>
            <input
              id="position"
              name="position"
              type="text"
              autoComplete="organization-title"
              required
              maxLength={FIELD_LIMITS.MAX_POSITION_LENGTH}
              value={position}
              onChange={(e) => {
                setPosition(e.target.value);
                if (fieldErrors.position) {
                  setFieldErrors((prev) => ({ ...prev, position: undefined }));
                }
              }}
              placeholder="Contoh: Customer Service / Teller"
              className={`w-full px-3.5 py-2.5 text-sm text-neutral-950 bg-white border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#D9380B]/20 focus:border-[#D9380B] ${
                fieldErrors.position ? 'border-red-600' : 'border-neutral-300'
              }`}
            />
            {fieldErrors.position && (
              <p role="alert" className="mt-1.5 text-xs text-red-600 font-medium">
                {fieldErrors.position}
              </p>
            )}
          </div>
        </div>

        {/* Kolom Waktu Pelatihan & Tanda Tangan Digital */}
        <div className="pt-2 border-t border-neutral-200 space-y-5">
          <div>
            <span className="block text-sm font-semibold text-neutral-900 mb-1">
              Waktu Pelatihan &amp; Tanda Tangan Digital <span className="text-[#D9380B]">*</span>
            </span>
            <p className="text-xs text-neutral-500 mb-3">
              Pilih tanggal kehadiran Anda, lalu bubuhkan tanda tangan digital pada kolom di bawah.
            </p>

            <div
              role="group"
              aria-label="Pilih tanggal waktu pelatihan"
              className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2"
            >
              {config.dates.map((dateStr) => {
                const isSelected = selectedDate === dateStr;
                return (
                  <button
                    key={dateStr}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedDate(dateStr);
                      if (fieldErrors.sessionDate) {
                        setFieldErrors((prev) => ({ ...prev, sessionDate: undefined }));
                      }
                    }}
                    className={`px-2 py-2 rounded-lg border text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9380B] ${
                      isSelected
                        ? 'bg-neutral-950 border-neutral-950 text-white'
                        : 'bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-orange-50/60 hover:border-[#D9380B]/40'
                    }`}
                  >
                    <span
                      className={`block text-[11px] ${
                        isSelected ? 'text-[#FF6B3D] font-semibold' : 'text-neutral-500'
                      }`}
                    >
                      {formatIndonesianShortDate(dateStr).split(',')[0]}
                    </span>
                    <span className="block text-[11px] sm:text-xs font-mono tabular-nums font-semibold mt-0.5 whitespace-nowrap">
                      {dateStr}
                    </span>
                  </button>
                );
              })}
            </div>
            {fieldErrors.sessionDate && (
              <p role="alert" className="mt-1.5 text-xs text-red-600 font-medium">
                {fieldErrors.sessionDate}
              </p>
            )}
          </div>

          <SignaturePad
            selectedDate={selectedDate}
            value={signatureDataUrl}
            onChange={(url) => {
              setSignatureDataUrl(url);
              if (url && fieldErrors.signatureDataUrl) {
                setFieldErrors((prev) => ({ ...prev, signatureDataUrl: undefined }));
              }
            }}
            error={fieldErrors.signatureDataUrl}
          />
        </div>

        <div className="pt-4 border-t border-neutral-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-xs text-neutral-500">
            Data kehadiran dan tanda tangan otomatis tersimpan ke database pelatihan.
          </p>
          <button
            type="submit"
            disabled={isSubmitting || configLoading}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-[#D9380B] hover:bg-[#B82D07] disabled:opacity-60 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D9380B] focus-visible:ring-offset-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Menyimpan...
              </>
            ) : (
              <>
                <PenTool className="w-4 h-4" aria-hidden="true" />
                Simpan Absensi
              </>
            )}
          </button>
        </div>
      </form>
    </main>
  );
}
