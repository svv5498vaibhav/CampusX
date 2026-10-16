import { jsPDF } from 'jspdf';
import { pdfFileName } from './format';

/**
 * Writes laid-out resume pages (utils/resume/document.js) to a real PDF: A4, selectable text in the
 * standard PDF fonts, clickable links, vector shapes. It draws exactly the operations the preview draws,
 * so the download matches what the student saw.
 */

function draw(pdf, op) {
  switch (op.t) {
    case 'text':
      pdf.setFont(op.font, op.style);
      pdf.setFontSize(op.size);
      pdf.setTextColor(op.color);
      pdf.setCharSpace(op.cs || 0);
      pdf.text(op.text, op.x, op.y);
      break;
    case 'rect': {
      const mode = op.fill && op.stroke ? 'FD' : op.fill ? 'F' : 'S';
      if (op.fill) pdf.setFillColor(op.fill);
      if (op.stroke) {
        pdf.setDrawColor(op.stroke);
        pdf.setLineWidth(op.lw || 0.6);
      }
      const radius = Math.min(op.r ?? 0, op.w / 2, op.h / 2);
      if (radius > 0) pdf.roundedRect(op.x, op.y, op.w, op.h, radius, radius, mode);
      else pdf.rect(op.x, op.y, op.w, op.h, mode);
      break;
    }
    case 'line':
      pdf.setDrawColor(op.color);
      pdf.setLineWidth(op.lw);
      pdf.line(op.x1, op.y1, op.x2, op.y2);
      break;
    case 'circle':
      pdf.setFillColor(op.fill);
      pdf.circle(op.x, op.y, op.r, 'F');
      break;
    case 'link':
      pdf.link(op.x, op.y, op.w, op.h, { url: op.url });
      break;
    default:
      break;
  }
}

/** A jsPDF document for `layout` ({ pages }). `resume` provides the title and author metadata. */
export function buildPdf(layout, resume) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true, putOnlyUsedFonts: true });
  const name = resume.content?.personal?.fullName?.trim();
  pdf.setProperties({
    title: [name, resume.name].filter(Boolean).join(' - ') || 'Resume',
    subject: resume.targetRoleLabel ? `${resume.targetRoleLabel} resume` : 'Resume',
    author: name || '',
    creator: 'CampusX Resume Builder',
  });
  pdf.setLanguage?.('en-IN');
  layout.pages.forEach((page, index) => {
    if (index) pdf.addPage('a4', 'portrait');
    for (const op of page.bg) draw(pdf, op);
    for (const op of page.fg) draw(pdf, op);
  });
  return pdf;
}

/** The PDF as a Blob, with its suggested file name. */
export function resumePdf(layout, resume) {
  return { blob: buildPdf(layout, resume).output('blob'), fileName: pdfFileName(resume) };
}

/** Saves a Blob to the student's device under `fileName`. */
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
