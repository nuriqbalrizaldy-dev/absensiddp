import { jsPDF } from 'jspdf';
import { formatTimestampId, type TrainingPdfSummary } from './attendanceLogic';

function sanitizePdfText(value: string): string {
  // Replace non-Latin-1 punctuation (e.g. curly dashes/quotes) so built-in Helvetica renders cleanly
  return String(value ?? '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\xFF]/g, ' ');
}

function drawDocumentHeader(
  doc: jsPDF,
  summary: TrainingPdfSummary,
  printedAtText: string,
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  // Bank Jakarta orange top accent bar
  doc.setFillColor(217, 56, 11); // #D9380B
  doc.rect(0, 0, pageWidth, 3, 'F');

  let y = 13;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(194, 48, 8);
  doc.text('DAFTAR HADIR RESMI PESERTA PELATIHAN', marginX, y);
  y += 5.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(10, 10, 10);
  const titleLines = doc.splitTextToSize(sanitizePdfText(summary.trainingTitle), contentWidth);
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 5.8 + 1;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(64, 64, 64);
  const scheduleLines = doc.splitTextToSize(
    sanitizePdfText(`Waktu Pelatihan: ${summary.scheduleSummary || '-'}`),
    contentWidth,
  );
  doc.text(scheduleLines, marginX, y);
  y += scheduleLines.length * 4.5 + 1.5;

  doc.setFontSize(8.5);
  doc.setTextColor(105, 105, 105);
  doc.text(
    sanitizePdfText(
      `Total Catatan: ${summary.recordCount}  |  Peserta Unik: ${summary.uniqueParticipants}  |  Diunduh: ${printedAtText}`,
    ),
    marginX,
    y,
  );
  y += 3.5;

  doc.setDrawColor(212, 212, 212);
  doc.setLineWidth(0.35);
  doc.line(marginX, y, pageWidth - marginX, y);
  return y + 5;
}

const COL_WIDTHS = [10, 44, 36, 24, 38, 30] as const; // Total = 182mm on A4 (210 - 28 margins)
const HEADERS = [
  'No',
  'Nama Lengkap',
  'Jabatan',
  'Tanggal',
  'Tanda Tangan',
  'Waktu Simpan',
] as const;

function drawTableHeader(doc: jsPDF, marginX: number, y: number): number {
  const rowHeight = 8.5;
  const totalWidth = COL_WIDTHS.reduce((sum, w) => sum + w, 0);

  doc.setFillColor(10, 10, 10);
  doc.rect(marginX, y, totalWidth, rowHeight, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(255, 255, 255);

  let x = marginX;
  HEADERS.forEach((label, idx) => {
    const colW = COL_WIDTHS[idx];
    doc.text(label, x + 2, y + 5.6);
    x += colW;
  });

  return y + rowHeight;
}

function drawRowBorders(
  doc: jsPDF,
  marginX: number,
  y: number,
  rowHeight: number,
  shaded: boolean,
) {
  const totalWidth = COL_WIDTHS.reduce((sum, w) => sum + w, 0);
  if (shaded) {
    doc.setFillColor(250, 250, 250);
    doc.rect(marginX, y, totalWidth, rowHeight, 'F');
  }

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.rect(marginX, y, totalWidth, rowHeight, 'S');

  let x = marginX;
  for (let i = 0; i < COL_WIDTHS.length - 1; i++) {
    x += COL_WIDTHS[i];
    doc.line(x, y, x, y + rowHeight);
  }
}

export function downloadTrainingAttendancePdf(summary: TrainingPdfSummary): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const marginX = 14;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const bottomLimit = pageHeight - 16;
  const printedAtText = formatTimestampId(Date.now());

  let y = drawDocumentHeader(doc, summary, printedAtText);
  y = drawTableHeader(doc, marginX, y);

  if (summary.records.length === 0) {
    // Provide clean printable blank attendance sheet ready for the newly named training
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(115, 115, 115);
    doc.text(
      'Belum ada peserta yang mengisi absensi digital untuk pelatihan ini. Lembar siap digunakan:',
      marginX,
      y + 5.5,
    );
    y += 9;

    const blankRowHeight = 14;
    for (let i = 0; i < 10; i++) {
      if (y + blankRowHeight > bottomLimit) {
        doc.addPage();
        y = drawDocumentHeader(doc, summary, printedAtText);
        y = drawTableHeader(doc, marginX, y);
      }
      drawRowBorders(doc, marginX, y, blankRowHeight, i % 2 === 1);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(90, 90, 90);
      doc.text(String(i + 1), marginX + 2.5, y + 8.2);
      y += blankRowHeight;
    }
  } else {
    const rowHeight = 16;

    summary.records.forEach((rec, index) => {
      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = drawDocumentHeader(doc, summary, printedAtText);
        y = drawTableHeader(doc, marginX, y);
      }

      drawRowBorders(doc, marginX, y, rowHeight, index % 2 === 1);

      let x = marginX;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.3);
      doc.setTextColor(23, 23, 23);

      // No
      doc.text(String(index + 1), x + 2, y + 8.5);
      x += COL_WIDTHS[0];

      // Nama Lengkap
      doc.setFont('helvetica', 'bold');
      const nameLines = doc
        .splitTextToSize(sanitizePdfText(rec.fullName), COL_WIDTHS[1] - 4)
        .slice(0, 2);
      doc.text(nameLines, x + 2, y + 6.5);
      x += COL_WIDTHS[1];

      // Jabatan
      doc.setFont('helvetica', 'normal');
      const posLines = doc
        .splitTextToSize(sanitizePdfText(rec.position), COL_WIDTHS[2] - 4)
        .slice(0, 2);
      doc.text(posLines, x + 2, y + 6.5);
      x += COL_WIDTHS[2];

      // Tanggal
      doc.text(sanitizePdfText(rec.sessionDate), x + 2, y + 8.5);
      x += COL_WIDTHS[3];

      // Tanda Tangan (PNG data URL)
      if (rec.signatureDataUrl && rec.signatureDataUrl.startsWith('data:image/png;base64,')) {
        try {
          doc.addImage(
            rec.signatureDataUrl,
            'PNG',
            x + 2,
            y + 1.5,
            COL_WIDTHS[4] - 4,
            rowHeight - 3,
          );
        } catch {
          doc.setFontSize(7.5);
          doc.setTextColor(120, 120, 120);
          doc.text('Tertandatangani', x + 2, y + 8.5);
        }
      } else {
        doc.text('-', x + 2, y + 8.5);
      }
      x += COL_WIDTHS[4];

      // Waktu Simpan
      doc.setFontSize(7.8);
      doc.setTextColor(82, 82, 82);
      doc.text(sanitizePdfText(formatTimestampId(rec.submittedAtMs)), x + 2, y + 8.5);

      y += rowHeight;
    });
  }

  // Page numbers footer
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text('Sistem Absensi Digital Pelatihan Karyawan', marginX, pageHeight - 8);
    doc.text(`Halaman ${p} dari ${totalPages}`, pageWidth - marginX, pageHeight - 8, {
      align: 'right',
    });
  }

  doc.save(summary.filename);
}
