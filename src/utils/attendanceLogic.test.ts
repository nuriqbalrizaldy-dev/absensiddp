import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TRAINING_CONFIG,
  DEFAULT_TRAINING_DATES,
  buildParticipantMatrix,
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
