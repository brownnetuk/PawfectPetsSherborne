import { jsPDF } from 'jspdf';
import logoUrl from '../assets/logo.png';
import type { ChecklistAssignment } from '../types';

const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4, points
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const HEADER_HEIGHT = 74;
const FOOTER_HEIGHT = 30;
const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT + 14;

// Brand palette -- kept in sync by hand with admin/src/index.css and the
// other PDF builders (no shared token source between them, same as those).
const GREEN: [number, number, number] = [31, 59, 44]; // --brand-green
const ACCENT: [number, number, number] = [232, 150, 60]; // --accent
const MUTED: [number, number, number] = [111, 125, 114]; // --muted
const BORDER: [number, number, number] = [227, 232, 222]; // --border
const INK: [number, number, number] = [35, 44, 38]; // --ink

interface Block {
  height: number;
  draw: (doc: jsPDF, y: number) => void;
}

const FIELD_LABEL_WIDTH = 170;

function fieldBlock(doc: jsPDF, label: string, value: string): Block {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(value || '—', CONTENT_WIDTH - FIELD_LABEL_WIDTH) as string[];
  const height = lines.length * 13 + 6;
  return {
    height,
    draw(doc, y) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(label.toUpperCase(), MARGIN, y);
      doc.setTextColor(...INK);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      lines.forEach((line, i) => doc.text(line, MARGIN + FIELD_LABEL_WIDTH, y + i * 13));
    },
  };
}

// One checklist item -- a drawn checkbox (ticked and green if completed)
// beside the item text, with who completed it as a muted note underneath.
function checklistItemBlock(doc: jsPDF, item: string, completed: boolean, completedBy: string | null): Block {
  const textX = MARGIN + 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(item, CONTENT_WIDTH - 20) as string[];
  const textHeight = Math.max(1, lines.length) * 13;
  const subHeight = completed && completedBy ? 13 : 0;
  const height = textHeight + subHeight + 6;
  return {
    height,
    draw(doc, y) {
      const boxSize = 10;
      const boxY = y - 8;
      doc.setDrawColor(...MUTED);
      doc.setLineWidth(1);
      doc.rect(MARGIN, boxY, boxSize, boxSize);
      if (completed) {
        doc.setDrawColor(...GREEN);
        doc.setLineWidth(1.3);
        doc.line(MARGIN + 1.5, boxY + 5, MARGIN + 4, boxY + 8);
        doc.line(MARGIN + 4, boxY + 8, MARGIN + 8.5, boxY + 1.5);
      }
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(1);
      doc.setTextColor(...(completed ? MUTED : INK));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      lines.forEach((line, i) => doc.text(line, textX, y + i * 13));
      if (completed && completedBy) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(`Completed by ${completedBy}`, textX, y + textHeight + 8);
      }
      doc.setTextColor(...INK);
    },
  };
}

function signatureBlock(dataUrl: string, label: string): Block {
  const w = 200;
  const h = 65;
  return {
    height: h + 36,
    draw(doc, y) {
      try {
        doc.addImage(dataUrl, 'PNG', MARGIN, y, w, h);
      } catch {
        // Malformed/legacy signature data -- skip the image rather than fail the whole PDF.
      }
      doc.setDrawColor(...BORDER);
      doc.line(MARGIN, y + h + 4, MARGIN + w, y + h + 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(label, MARGIN, y + h + 16);
      doc.setTextColor(...INK);
    },
  };
}

function spacerBlock(h: number): Block {
  return { height: h, draw: () => {} };
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

class PdfWriter {
  doc = new jsPDF({ unit: 'pt', format: 'a4' });
  y = MARGIN;
  private pageCount = 1;

  drawHeader(logo: string | null, subtitle: string) {
    const doc = this.doc;
    doc.setFillColor(...GREEN);
    doc.rect(0, 0, PAGE_WIDTH, HEADER_HEIGHT, 'F');

    const badgeCx = MARGIN + 17;
    const badgeCy = HEADER_HEIGHT / 2;
    doc.setFillColor(255, 255, 255);
    doc.circle(badgeCx, badgeCy, 19, 'F');
    if (logo) {
      try {
        doc.addImage(logo, 'PNG', badgeCx - 14, badgeCy - 14, 28, 28);
      } catch {
        // ignore malformed logo data
      }
    }

    doc.setFont('times', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(255, 255, 255);
    doc.text('PawfectPets Sherborne', MARGIN + 46, badgeCy - 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(224, 233, 226);
    const wrapped = doc.splitTextToSize(subtitle, PAGE_WIDTH - MARGIN * 2 - 46) as string[];
    doc.text(wrapped[0] ?? '', MARGIN + 46, badgeCy + 14);

    doc.setTextColor(...INK);
    this.y = HEADER_HEIGHT + 26;
  }

  private newPage() {
    this.doc.addPage();
    this.pageCount += 1;
    this.y = MARGIN;
  }

  private ensureSpace(h: number) {
    if (this.y + h > CONTENT_BOTTOM) {
      this.newPage();
    }
  }

  section(title: string, blocks: Block[]) {
    const preGap = 10;
    const headingHeight = preGap + 23;
    const total = headingHeight + blocks.reduce((sum, b) => sum + b.height, 0);
    const remaining = CONTENT_BOTTOM - this.y;
    const fitsFreshPage = total <= CONTENT_BOTTOM - MARGIN;
    if (total > remaining && fitsFreshPage && this.y > MARGIN) {
      this.newPage();
    }

    this.ensureSpace(headingHeight);
    this.y += preGap;
    const doc = this.doc;
    doc.setFont('times', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...GREEN);
    doc.text(title, MARGIN, this.y);
    doc.setTextColor(...INK);
    this.y += 7;
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(1.6);
    doc.line(MARGIN, this.y, MARGIN + 46, this.y);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.75);
    doc.line(MARGIN + 46, this.y, PAGE_WIDTH - MARGIN, this.y);
    doc.setLineWidth(1);
    this.y += 16;

    for (const block of blocks) {
      this.ensureSpace(block.height);
      block.draw(doc, this.y);
      this.y += block.height;
    }
  }

  finish(generatedNote: string) {
    const total = this.doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      this.doc.setPage(i);
      this.doc.setDrawColor(...BORDER);
      this.doc.setLineWidth(0.75);
      this.doc.line(MARGIN, PAGE_HEIGHT - MARGIN - 16, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN - 16);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(...MUTED);
      this.doc.text(generatedNote, MARGIN, PAGE_HEIGHT - MARGIN - 4);
      this.doc.text(`Page ${i} of ${total}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - MARGIN - 4, { align: 'right' });
      this.doc.setTextColor(...INK);
    }
  }
}

/** Renders one day's checklist assignment (items, notes, sign-off) as a branded PDF. */
export async function buildChecklistPdf(assignment: ChecklistAssignment): Promise<jsPDF> {
  const logo = await loadLogoDataUrl();
  const w = new PdfWriter();
  const doc = w.doc;
  const now = new Date();
  const dateLabel = new Date(assignment.date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  w.drawHeader(logo, dateLabel);

  const blocks: Block[] = [];
  if (assignment.completeByTime) {
    blocks.push(fieldBlock(doc, 'Complete by', assignment.completeByTime));
    blocks.push(spacerBlock(6));
  }
  assignment.items.forEach((item, i) => {
    blocks.push(checklistItemBlock(doc, item, !!assignment.completed[i], assignment.completedBy[i] ?? null));
  });
  if (assignment.notes) {
    blocks.push(spacerBlock(10));
    blocks.push(fieldBlock(doc, 'Notes', assignment.notes));
  }
  if (assignment.signatureImage) {
    blocks.push(spacerBlock(10));
    const signedOn = assignment.signedAt ? ` on ${new Date(assignment.signedAt).toLocaleString('en-GB')}` : '';
    blocks.push(signatureBlock(assignment.signatureImage, `Signed by ${assignment.signedBy ?? 'staff'}${signedOn}`));
  }
  w.section(assignment.name, blocks);

  w.finish(`Generated ${now.toLocaleDateString('en-GB')} · PawfectPets Sherborne`);
  return w.doc;
}
