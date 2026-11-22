export interface TrainingConfig {
  title: string;
  scheduleSummary: string;
  dates: string[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface AttendanceRecord {
  id: string;
  fullName: string;
  position: string;
  sessionDate: string;
  signatureDataUrl: string;
  trainingTitle: string;
  submittedAtMs: number;
}

export interface AttendanceInput {
  fullName: string;
  position: string;
  sessionDate: string;
  signatureDataUrl: string;
  trainingTitle: string;
}

export interface AttendanceValidationResult {
  valid: boolean;
  errors: {
    fullName?: string;
    position?: string;
    sessionDate?: string;
    signatureDataUrl?: string;
    trainingTitle?: string;
  };
}

export interface TrainingConfigValidationResult {
  valid: boolean;
  errors: {
    title?: string;
    dates?: string;
    scheduleSummary?: string;
  };
}

export interface ParticipantMatrixRow {
  key: string;
  fullName: string;
  position: string;
  sessions: Record<
    string,
    {
      id: string;
      signatureDataUrl: string;
      submittedAtMs: number;
    }
  >;
  attendedCount: number;
}

export const FIELD_LIMITS = {
  MIN_TITLE_LENGTH: 3,
  MAX_TITLE_LENGTH: 200,
  MIN_SCHEDULE_SUMMARY_LENGTH: 3,
  MAX_SCHEDULE_SUMMARY_LENGTH: 200,
  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 120,
  MIN_POSITION_LENGTH: 2,
  MAX_POSITION_LENGTH: 120,
  MIN_SIGNATURE_LENGTH: 100,
  MAX_SIGNATURE_LENGTH: 180000,
  MAX_DATES_COUNT: 31,
} as const;

export const DATE_REGEX = /^[0-3][0-9]\/[0-1][0-9]\/20[2-9][0-9]$/;
export const SIGNATURE_REGEX = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

export const DEFAULT_TRAINING_DATES: string[] = [
  '23/11/2026',
  '24/11/2026',
  '25/11/2026',
  '26/11/2026',
  '27/11/2026',
  '30/11/2026',
  '01/12/2026',
];

export const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  title: 'Pelatihan Dasar - Dasar Perbankan Reguler Angkatan XII Tahun 2026',
  scheduleSummary: '23/11/2026 - 27/11/2026, 30/11/2026 & 01/12/2026',
  dates: [...DEFAULT_TRAINING_DATES],
};

function parseDdMmYyyyToUtcDate(dateStr: string): Date | null {
  if (!DATE_REGEX.test(dateStr)) {
    return null;
  }
  const [ddStr, mmStr, yyyyStr] = dateStr.split('/');
  const dd = Number(ddStr);
  const mm = Number(mmStr);
  const yyyy = Number(yyyyStr);
  const date = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (
    date.getUTCFullYear() !== yyyy ||
    date.getUTCMonth() !== mm - 1 ||
    date.getUTCDate() !== dd
  ) {
    return null;
  }
  return date;
}

export function normalizeDateString(raw: string): string | null {
  const trimmed = raw.trim();
  // Support YYYY-MM-DD (HTML <input type="date">)
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (isoMatch) {
    const yyyy = isoMatch[1];
    const mm = isoMatch[2].padStart(2, '0');
    const dd = isoMatch[3].padStart(2, '0');
    const formatted = `${dd}/${mm}/${yyyy}`;
    return parseDdMmYyyyToUtcDate(formatted) ? formatted : null;
  }

  // Support D/M/YYYY or DD/MM/YYYY
  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const dd = dmyMatch[1].padStart(2, '0');
    const mm = dmyMatch[2].padStart(2, '0');
    const yyyy = dmyMatch[3];
    const formatted = `${dd}/${mm}/${yyyy}`;
    return parseDdMmYyyyToUtcDate(formatted) ? formatted : null;
  }

  return null;
}

export function toIsoDateInputValue(ddMmYyyy: string): string {
  const normalized = normalizeDateString(ddMmYyyy);
  if (!normalized) return '';
  const [dd, mm, yyyy] = normalized.split('/');
  return `${yyyy}-${mm}-${dd}`;
}

export function sortTrainingDates(dates: string[]): string[] {
  const unique = Array.from(
    new Set(dates.map((d) => normalizeDateString(d)).filter((d): d is string => d !== null)),
  );
  return unique.sort((a, b) => {
    const da = parseDdMmYyyyToUtcDate(a)?.getTime() ?? 0;
    const db = parseDdMmYyyyToUtcDate(b)?.getTime() ?? 0;
    return da - db;
  });
}

export function formatScheduleSummary(dates: string[]): string {
  const sorted = sortTrainingDates(dates);
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return sorted[0];

  const groups: string[][] = [];
  let currentGroup: string[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prevTime = parseDdMmYyyyToUtcDate(sorted[i - 1])!.getTime();
    const currTime = parseDdMmYyyyToUtcDate(sorted[i])!.getTime();
    const diffDays = Math.round((currTime - prevTime) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) {
      currentGroup.push(sorted[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }
  groups.push(currentGroup);

  const tokens: string[] = [];
  for (const group of groups) {
    if (group.length >= 3) {
      tokens.push(`${group[0]} - ${group[group.length - 1]}`);
    } else if (group.length === 2) {
      tokens.push(group[0], group[1]);
    } else {
      tokens.push(group[0]);
    }
  }

  if (tokens.length === 1) return tokens[0];
  const last = tokens[tokens.length - 1];
  const head = tokens.slice(0, -1).join(', ');
  return `${head} & ${last}`;
}

export function pickDefaultSessionDate(dates: string[], now: Date = new Date()): string {
  if (dates.length === 0) return '';
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = String(now.getFullYear());
  const todayStr = `${dd}/${mm}/${yyyy}`;
  if (dates.includes(todayStr)) {
    return todayStr;
  }
  return dates[0];
}

export function formatIndonesianShortDate(ddMmYyyy: string): string {
  const dt = parseDdMmYyyyToUtcDate(ddMmYyyy);
  if (!dt) return ddMmYyyy;
  const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  return `${days[dt.getUTCDay()]}, ${ddMmYyyy}`;
}

export function validateAttendanceInput(input: AttendanceInput): AttendanceValidationResult {
  const errors: AttendanceValidationResult['errors'] = {};

  const fullName = input.fullName.trim();
  const position = input.position.trim();
  const sessionDate = input.sessionDate.trim();
  const signatureDataUrl = input.signatureDataUrl.trim();
  const trainingTitle = input.trainingTitle.trim();

  if (fullName.length < FIELD_LIMITS.MIN_NAME_LENGTH) {
    errors.fullName = 'Nama lengkap minimal 2 karakter.';
  } else if (fullName.length > FIELD_LIMITS.MAX_NAME_LENGTH) {
    errors.fullName = `Nama lengkap maksimal ${FIELD_LIMITS.MAX_NAME_LENGTH} karakter.`;
  }

  if (position.length < FIELD_LIMITS.MIN_POSITION_LENGTH) {
    errors.position = 'Jabatan minimal 2 karakter.';
  } else if (position.length > FIELD_LIMITS.MAX_POSITION_LENGTH) {
    errors.position = `Jabatan maksimal ${FIELD_LIMITS.MAX_POSITION_LENGTH} karakter.`;
  }

  if (!parseDdMmYyyyToUtcDate(sessionDate)) {
    errors.sessionDate = 'Pilih tanggal waktu pelatihan yang valid (DD/MM/YYYY).';
  }

  if (
    !signatureDataUrl ||
    signatureDataUrl.length < FIELD_LIMITS.MIN_SIGNATURE_LENGTH ||
    !SIGNATURE_REGEX.test(signatureDataUrl)
  ) {
    errors.signatureDataUrl = 'Silakan bubuhkan tanda tangan digital terlebih dahulu.';
  } else if (signatureDataUrl.length > FIELD_LIMITS.MAX_SIGNATURE_LENGTH) {
    errors.signatureDataUrl = 'Ukuran tanda tangan melebihi batas maksimal.';
  }

  if (
    trainingTitle.length < FIELD_LIMITS.MIN_TITLE_LENGTH ||
    trainingTitle.length > FIELD_LIMITS.MAX_TITLE_LENGTH
  ) {
    errors.trainingTitle = 'Judul pelatihan tidak valid.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateTrainingConfigInput(input: {
  title: string;
  dates: string[];
  scheduleSummary?: string;
}): TrainingConfigValidationResult {
  const errors: TrainingConfigValidationResult['errors'] = {};
  const title = input.title.trim();

  if (title.length < FIELD_LIMITS.MIN_TITLE_LENGTH) {
    errors.title = 'Judul pelatihan minimal 3 karakter.';
  } else if (title.length > FIELD_LIMITS.MAX_TITLE_LENGTH) {
    errors.title = `Judul pelatihan maksimal ${FIELD_LIMITS.MAX_TITLE_LENGTH} karakter.`;
  }

  const validDates = sortTrainingDates(input.dates);
  if (validDates.length === 0) {
    errors.dates = 'Minimal harus ada 1 tanggal waktu pelatihan.';
  } else if (validDates.length > FIELD_LIMITS.MAX_DATES_COUNT) {
    errors.dates = `Maksimal ${FIELD_LIMITS.MAX_DATES_COUNT} tanggal waktu pelatihan.`;
  }

  const summary = (input.scheduleSummary ?? formatScheduleSummary(validDates)).trim();
  if (
    summary.length < FIELD_LIMITS.MIN_SCHEDULE_SUMMARY_LENGTH ||
    summary.length > FIELD_LIMITS.MAX_SCHEDULE_SUMMARY_LENGTH
  ) {
    errors.scheduleSummary = 'Ringkasan jadwal pelatihan tidak valid (3–200 karakter).';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function filterAttendances(
  records: AttendanceRecord[],
  filter: { searchQuery?: string; sessionDate?: string },
): AttendanceRecord[] {
  const q = (filter.searchQuery ?? '').trim().toLowerCase();
  const dateFilter = (filter.sessionDate ?? '').trim();

  return records.filter((rec) => {
    if (dateFilter && dateFilter !== 'ALL' && rec.sessionDate !== dateFilter) {
      return false;
    }
    if (q) {
      const hay = `${rec.fullName} ${rec.position} ${rec.sessionDate}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function buildParticipantMatrix(
  records: AttendanceRecord[],
  trainingDates: string[],
): ParticipantMatrixRow[] {
  const map = new Map<string, ParticipantMatrixRow>();

  for (const rec of records) {
    const normalizedKey = `${rec.fullName.trim().toLowerCase()}__${rec.position.trim().toLowerCase()}`;
    let row = map.get(normalizedKey);
    if (!row) {
      row = {
        key: normalizedKey,
        fullName: rec.fullName.trim(),
        position: rec.position.trim(),
        sessions: {},
        attendedCount: 0,
      };
      map.set(normalizedKey, row);
    }

    const existing = row.sessions[rec.sessionDate];
    if (!existing || rec.submittedAtMs >= existing.submittedAtMs) {
      row.sessions[rec.sessionDate] = {
        id: rec.id,
        signatureDataUrl: rec.signatureDataUrl,
        submittedAtMs: rec.submittedAtMs,
      };
    }
  }

  const rows = Array.from(map.values()).map((row) => {
    const attendedCount = trainingDates.filter((d) => Boolean(row.sessions[d])).length;
    return {
      ...row,
      attendedCount,
    };
  });

  return rows.sort((a, b) => a.fullName.localeCompare(b.fullName, 'id'));
}

function escapeCsvCell(value: string): string {
  const str = String(value ?? '');
  // Prevent CSV formula injection in Excel
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function formatTimestampId(ms: number): string {
  if (!ms) return '-';
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function generateAttendanceCsv(records: AttendanceRecord[], trainingTitle: string): string {
  const headers = [
    'No',
    'Nama Lengkap',
    'Jabatan',
    'Waktu Pelatihan',
    'Judul Pelatihan',
    'Waktu Simpan',
    'Status Tanda Tangan',
  ];

  const lines: string[] = [headers.map(escapeCsvCell).join(',')];

  records.forEach((rec, index) => {
    const row = [
      String(index + 1),
      rec.fullName,
      rec.position,
      rec.sessionDate,
      rec.trainingTitle || trainingTitle,
      formatTimestampId(rec.submittedAtMs),
      rec.signatureDataUrl ? 'Tertandatangani Digital' : 'Kosong',
    ];
    lines.push(row.map(escapeCsvCell).join(','));
  });

  return '\uFEFF' + lines.join('\r\n');
}

export function generateMatrixCsv(
  rows: ParticipantMatrixRow[],
  dates: string[],
  trainingTitle: string,
): string {
  const titleRow = [trainingTitle].map(escapeCsvCell).join(',');
  const headers = ['No', 'Nama Lengkap', 'Jabatan', ...dates, 'Total Hadir'];
  const lines: string[] = [titleRow, headers.map(escapeCsvCell).join(',')];

  rows.forEach((row, index) => {
    const dateCells = dates.map((d) => {
      const session = row.sessions[d];
      return session ? `Hadir (${formatTimestampId(session.submittedAtMs)})` : '-';
    });
    const csvRow = [
      String(index + 1),
      row.fullName,
      row.position,
      ...dateCells,
      `${row.attendedCount}/${dates.length}`,
    ];
    lines.push(csvRow.map(escapeCsvCell).join(','));
  });

  return '\uFEFF' + lines.join('\r\n');
}
