import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TRAINING_CONFIG,
  DEFAULT_TRAINING_DATES,
  buildParticipantMatrix,
  buildTrainingPdfFilename,
  buildTrainingPdfSummaries,
  filterAttendances,
  formatScheduleSummary,
  generateAttendanceCsv,
  generateMatrixCsv,
  normalizeDateString,
  pickDefaultSessionDate,
  sortTrainingDates,
  validateAttendanceInput,
  validateTrainingConfigInput,
  type AttendanceRecord,
} from './attendanceLogic';

const VALID_PNG = `data:image/png;base64,${'A'.repeat(120)}`;

test('normalizeDateString converts ISO and single-digit D/M/YYYY to DD/MM/YYYY and rejects invalid calendar dates', () => {
  assert.equal(normalizeDateString('1/12/2026'), '01/12/2026');
  assert.equal(normalizeDateString('2026-11-23'), '23/11/2026');
  assert.equal(normalizeDateString('31/02/2026'), null);
  assert.equal(normalizeDateString('invalid'), null);
});

test('formatScheduleSummary collapses consecutive days into ranges matching training schedule', () => {
  const summary = formatScheduleSummary(DEFAULT_TRAINING_DATES);
  assert.equal(summary, DEFAULT_TRAINING_CONFIG.scheduleSummary);
  assert.equal(summary, '23/11/2026 - 27/11/2026, 30/11/2026 & 01/12/2026');
});

test('sortTrainingDates deduplicates and sorts chronologically across month boundaries', () => {
  const sorted = sortTrainingDates(['01/12/2026', '23/11/2026', '1/12/2026', '30/11/2026']);
  assert.deepEqual(sorted, ['23/11/2026', '30/11/2026', '01/12/2026']);
});

test('pickDefaultSessionDate selects today when inside training dates, otherwise first date', () => {
  const inside = new Date(2026, 10, 25); // 25/11/2026
  assert.equal(pickDefaultSessionDate(DEFAULT_TRAINING_DATES, inside), '25/11/2026');

  const outside = new Date(2026, 10, 21); // 21/11/2026
  assert.equal(pickDefaultSessionDate(DEFAULT_TRAINING_DATES, outside), '23/11/2026');
});

test('validateAttendanceInput enforces required fields and signature format', () => {
  const invalid = validateAttendanceInput({
    fullName: 'A',
    position: '',
    sessionDate: '99/99/2026',
    signatureDataUrl: 'not-a-png',
    trainingTitle: DEFAULT_TRAINING_CONFIG.title,
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.fullName);
  assert.ok(invalid.errors.position);
  assert.ok(invalid.errors.sessionDate);
  assert.ok(invalid.errors.signatureDataUrl);

  const valid = validateAttendanceInput({
    fullName: 'Budi Santoso',
    position: 'Customer Service',
    sessionDate: '23/11/2026',
    signatureDataUrl: VALID_PNG,
    trainingTitle: DEFAULT_TRAINING_CONFIG.title,
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
});

test('validateTrainingConfigInput requires valid title and at least one date', () => {
  const bad = validateTrainingConfigInput({ title: 'AB', dates: [] });
  assert.equal(bad.valid, false);
  assert.ok(bad.errors.title);
  assert.ok(bad.errors.dates);

  const good = validateTrainingConfigInput({
    title: 'Pelatihan Perbankan Angkatan XIII',
    dates: ['02/12/2026', '03/12/2026'],
  });
  assert.equal(good.valid, true);
});

test('filterAttendances and buildParticipantMatrix group signatures by participant and training date', () => {
  const records: AttendanceRecord[] = [
    {
      id: 'att1',
      fullName: 'Siti Aminah',
      position: 'Teller',
      sessionDate: '23/11/2026',
      signatureDataUrl: VALID_PNG,
      trainingTitle: DEFAULT_TRAINING_CONFIG.title,
      submittedAtMs: 1700000000000,
    },
    {
      id: 'att2',
      fullName: 'Siti Aminah',
      position: 'Teller',
      sessionDate: '24/11/2026',
      signatureDataUrl: VALID_PNG,
      trainingTitle: DEFAULT_TRAINING_CONFIG.title,
      submittedAtMs: 1700086400000,
    },
    {
      id: 'att3',
      fullName: 'Andi Wijaya',
      position: 'Account Officer',
      sessionDate: '23/11/2026',
      signatureDataUrl: VALID_PNG,
      trainingTitle: DEFAULT_TRAINING_CONFIG.title,
      submittedAtMs: 1700000500000,
    },
  ];

  const filteredByDate = filterAttendances(records, { sessionDate: '24/11/2026' });
  assert.equal(filteredByDate.length, 1);
  assert.equal(filteredByDate[0].id, 'att2');

  const filteredBySearch = filterAttendances(records, { searchQuery: 'teller' });
  assert.equal(filteredBySearch.length, 2);

  const matrix = buildParticipantMatrix(records, DEFAULT_TRAINING_DATES);
  assert.equal(matrix.length, 2);
  assert.equal(matrix[0].fullName, 'Andi Wijaya');
  assert.equal(matrix[0].attendedCount, 1);
  assert.equal(matrix[1].fullName, 'Siti Aminah');
  assert.equal(matrix[1].attendedCount, 2);
  assert.ok(matrix[1].sessions['23/11/2026']);
  assert.ok(matrix[1].sessions['24/11/2026']);
});

test('CSV exports include UTF-8 BOM, escape formulas, and include all columns', () => {
  const records: AttendanceRecord[] = [
    {
      id: 'att1',
      fullName: '=CMD()',
      position: 'Staff, Ops',
      sessionDate: '23/11/2026',
      signatureDataUrl: VALID_PNG,
      trainingTitle: DEFAULT_TRAINING_CONFIG.title,
      submittedAtMs: 1795400000000,
    },
  ];

  const logCsv = generateAttendanceCsv(records, DEFAULT_TRAINING_CONFIG.title);
  assert.ok(logCsv.startsWith('\uFEFF'));
  assert.ok(logCsv.includes("'=CMD()"));
  assert.ok(logCsv.includes('"Staff, Ops"'));
  assert.ok(logCsv.includes('Tertandatangani Digital'));

  const matrix = buildParticipantMatrix(records, ['23/11/2026', '24/11/2026']);
  const matrixCsv = generateMatrixCsv(matrix, ['23/11/2026', '24/11/2026'], DEFAULT_TRAINING_CONFIG.title);
  assert.ok(matrixCsv.includes('1/2'));
  assert.ok(matrixCsv.includes('Hadir ('));
});

test('buildTrainingPdfFilename and buildTrainingPdfSummaries produce distinct downloadable PDF entries per training title', () => {
  const batch12Title = DEFAULT_TRAINING_CONFIG.title;
  const batch13Title = 'Pelatihan Kredit Mikro Angkatan XIII Tahun 2026';

  const file12 = buildTrainingPdfFilename(batch12Title);
  const file13 = buildTrainingPdfFilename(batch13Title);
  assert.notEqual(file12, file13);
  assert.ok(file12.endsWith('.pdf'));
  assert.ok(file13.endsWith('.pdf'));
  assert.ok(file13.includes('pelatihan-kredit-mikro-angkatan-xiii-tahun-2026'));

  const records: AttendanceRecord[] = [
    {
      id: 'att1',
      fullName: 'Siti Aminah',
      position: 'Teller',
      sessionDate: '23/11/2026',
      signatureDataUrl: VALID_PNG,
      trainingTitle: batch12Title,
      submittedAtMs: 1700000000000,
    },
    {
      id: 'att2',
      fullName: 'Andi Wijaya',
      position: 'AO',
      sessionDate: '02/12/2026',
      signatureDataUrl: VALID_PNG,
      trainingTitle: batch13Title,
      submittedAtMs: 1700086400000,
    },
  ];

  const nextActiveConfig = {
    title: 'Pelatihan Layanan Prima Batch XIV Tahun 2026',
    scheduleSummary: '10/12/2026',
    dates: ['10/12/2026'],
  };

  const summaries = buildTrainingPdfSummaries(records, nextActiveConfig);
  assert.equal(summaries.length, 3);
  assert.equal(summaries[0].trainingTitle, nextActiveConfig.title);
  assert.equal(summaries[0].isActive, true);
  assert.equal(summaries[0].recordCount, 0);

  const batch12Summary = summaries.find((s) => s.trainingTitle === batch12Title);
  assert.ok(batch12Summary);
  assert.equal(batch12Summary.recordCount, 1);
  assert.equal(batch12Summary.filename, file12);

  const onlyBatch13 = filterAttendances(records, { trainingTitle: batch13Title });
  assert.equal(onlyBatch13.length, 1);
  assert.equal(onlyBatch13[0].fullName, 'Andi Wijaya');
});
