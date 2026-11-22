import { jsPDF } from 'jspdf';
import {
  buildParticipantMatrix,
  formatTimestampId,
  type TrainingPdfSummary,
} from './attendanceLogic';

function sanitizePdfText(value: string): string {
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
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;

  // Bank Jakarta orange top accent bar
  doc.setFillColor(217, 56, 11);
  doc.rect(0, 0, pageWidth, 2.8, 'F');

  let y = 11.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(194, 48, 8);
  doc.text('DAFTAR HADIR RESMI PESERTA PELATIHAN', marginX, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(10, 10, 10);
  const titleLines = doc.splitTextToSize(sanitizePdfText(summary.trainingTitle), contentWidth);
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 5.2 + 0.8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(64, 64, 64);
  const metaText = sanitizePdfText(
    `Waktu Pelatihan: ${summary.scheduleSummary || '-'}   |   Peserta Unik: ${summary.uniqueParticipants}   |   Total Absensi: ${summary.recordCount}   |   Diunduh: ${printedAtText}`,
  );
  const metaLines = doc.splitTextToSize(metaText, contentWidth);
  doc.text(metaLines, marginX, y);
  y += metaLines.length * 4.2 + 1.5;

  doc.setDrawColor(212, 212, 212);
  doc.setLineWidth(0.35);
  doc.line(marginX, y, pageWidth - marginX, y);
  return y + 4.5;
}

function drawMatrixHeader(
  doc: jsPDF,
  marginX: number,
  y: number,
  colWidths: number[],
  headers: string[],
): number {
  const rowHeight = 8;
  const totalWidth = colWidths.reduce((sum, w) => sum + w, 0);

  doc.setFillColor(10, 10, 10);
  doc.rect(marginX, y, totalWidth, rowHeight, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(255, 255, 255);

  let x = marginX;
  headers.forEach((label, idx) => {
    const colW = colWidths[idx];
    const isDateCol = idx >= 4 && idx < headers.length - 1;
    const isTotalCol = idx === headers.length - 1;
    if (isDateCol) {
      doc.text(label, x + colW / 2, y + 5.2, { align: 'center' });
    } else if (isTotalCol) {
      doc.text(label, x + colW - 2, y + 5.2, { align: 'right' });
    } else {
      doc.text(label, x + 2, y + 5.2);
    }
    x += colW;
  });

  return y + rowHeight;
}

function drawRowBorders(
  doc: jsPDF,
  marginX: number,
  y: number,
  rowHeight: number,
  colWidths: number[],
  shaded: boolean,
) {
  const totalWidth = colWidths.reduce((sum, w) => sum + w, 0);
  if (shaded) {
    doc.setFillColor(250, 250, 250);
    doc.rect(marginX, y, totalWidth, rowHeight, 'F');
  }

  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.rect(marginX, y, totalWidth, rowHeight, 'S');

  let x = marginX;
  for (let i = 0; i < colWidths.length - 1; i++) {
    x += colWidths[i];
    doc.line(x, y, x, y + rowHeight);
  }
}

export function downloadTrainingAttendancePdf(summary: TrainingPdfSummary): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const marginX = 12;
  const pageWidth = doc.internal.pageSize.getWidth(); // 297mm in A4 landscape
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm in A4 landscape
  const usableWidth = pageWidth - marginX * 2; // 273mm
  const bottomLimit = pageHeight - 14;
  const printedAtText = formatTimestampId(Date.now());

  const allDates = summary.dates.length > 0 ? summary.dates : ['-'];
  // Chunk up to 8 date columns per landscape table so every signature cell stays legible
  const MAX_DATES_PER_BLOCK = 8;
  const dateChunks: string[][] = [];
  for (let i = 0; i < allDates.length; i += MAX_DATES_PER_BLOCK) {
    dateChunks.push(allDates.slice(i, i + MAX_DATES_PER_BLOCK));
  }

  const matrixRows = buildParticipantMatrix(summary.records, allDates);

  dateChunks.forEach((chunkDates, chunkIndex) => {
    if (chunkIndex > 0) {
      doc.addPage();
    }

    const noColW = 8;
    const nameColW = 38;
    const nrikColW = 20;
    const posColW = 28;
    const totalColW = 13;
    const fixedWidth = noColW + nameColW + nrikColW + posColW + totalColW;
    const dateColW = (usableWidth - fixedWidth) / chunkDates.length;

    const colWidths = [
      noColW,
      nameColW,
      nrikColW,
      posColW,
      ...chunkDates.map(() => dateColW),
      totalColW,
    ];
    const headers = ['No', 'Nama Lengkap', 'NRIK', 'Jabatan', ...chunkDates, 'Total'];

    let y = drawDocumentHeader(doc, summary, printedAtText);
    y = drawMatrixHeader(doc, marginX, y, colWidths, headers);

    if (matrixRows.length === 0) {
      const blankRowHeight = 14;
      for (let i = 0; i < 8; i++) {
        if (y + blankRowHeight > bottomLimit) {
          doc.addPage();
          y = drawDocumentHeader(doc, summary, printedAtText);
          y = drawMatrixHeader(doc, marginX, y, colWidths, headers);
        }
        drawRowBorders(doc, marginX, y, blankRowHeight, colWidths, i % 2 === 1);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(110, 110, 110);
        doc.text(String(i + 1), marginX + 2.5, y + 8.5);
        y += blankRowHeight;
      }
      return;
    }

    const rowHeight = 15;
    matrixRows.forEach((row, idx) => {
      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = drawDocumentHeader(doc, summary, printedAtText);
        y = drawMatrixHeader(doc, marginX, y, colWidths, headers);
      }

      drawRowBorders(doc, marginX, y, rowHeight, colWidths, idx % 2 === 1);

      let x = marginX;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(23, 23, 23);

      // No
      doc.text(String(idx + 1), x + 2, y + 8.5);
      x += noColW;

      // Nama Lengkap
      doc.setFont('helvetica', 'bold');
      const nameLines = doc
        .splitTextToSize(sanitizePdfText(row.fullName), nameColW - 4)
        .slice(0, 2);
      doc.text(nameLines, x + 2, y + 6.5);
      x += nameColW;

      // NRIK
      doc.setFont('helvetica', 'normal');
      doc.text(row.nrik ? sanitizePdfText(row.nrik) : '-', x + 2, y + 8.5);
      x += nrikColW;

      // Jabatan
      doc.setFont('helvetica', 'normal');
      const posLines = doc
        .splitTextToSize(sanitizePdfText(row.position), posColW - 4)
        .slice(0, 2);
      doc.text(posLines, x + 2, y + 6.5);
      x += posColW;

      // Date Signature Columns
      chunkDates.forEach((d) => {
        const session = row.sessions[d];
        if (session && session.signatureDataUrl.startsWith('data:image/png;base64,')) {
          try {
            const imgPadX = 1.5;
            const imgW = Math.max(10, dateColW - imgPadX * 2);
            const imgH = rowHeight - 5.2;
            doc.addImage(
              session.signatureDataUrl,
              'PNG',
              x + imgPadX,
              y + 1,
              imgW,
              imgH,
            );
            const timePart = formatTimestampId(session.submittedAtMs).split(' ')[1] || '';
            if (timePart) {
              doc.setFontSize(6.5);
              doc.setTextColor(120, 120, 120);
              doc.text(timePart, x + dateColW / 2, y + rowHeight - 1.3, {
                align: 'center',
              });
            }
          } catch {
            doc.setFontSize(7.5);
            doc.setTextColor(120, 120, 120);
            doc.text('Hadir', x + dateColW / 2, y + 8.5, { align: 'center' });
          }
        } else {
          doc.setFontSize(8);
          doc.setTextColor(190, 190, 190);
          doc.text('-', x + dateColW / 2, y + 8.5, { align: 'center' });
        }
        x += dateColW;
      });

      // Total Hadir
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(194, 48, 8);
      doc.text(
        `${row.attendedCount}/${allDates.length}`,
        x + totalColW - 2,
        y + 8.5,
        { align: 'right' },
      );

      y += rowHeight;
    });
  });

  // Footer page numbers
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text('Sistem Absensi Digital Pelatihan Karyawan', marginX, pageHeight - 6.5);
    doc.text(`Halaman ${p} dari ${totalPages}`, pageWidth - marginX, pageHeight - 6.5, {
      align: 'right',
    });
  }

  doc.save(summary.filename);
}
