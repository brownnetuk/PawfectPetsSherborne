import { jsPDF } from 'jspdf';
import logoUrl from '../assets/logo.png';
import type { FormField, FormSubmissionRecord } from '../types';

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

function paragraphBlock(doc: jsPDF, text: string): Block {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
  const height = lines.length * 12 + 8;
  return {
    height,
    draw(doc, y) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...MUTED);
      lines.forEach((line, i) => doc.text(line, MARGIN, y + i * 12));
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

function photosBlock(label: string, photos: string[]): Block {
  return {
    height: 20,
    draw(doc, y) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(label.toUpperCase(), MARGIN, y);
      doc.setTextColor(...INK);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`${photos.length} photo${photos.length === 1 ? '' : 's'} attached`, MARGIN + FIELD_LABEL_WIDTH, y);
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

function formatAnswer(field: FormField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (field.type === 'toggle') return value ? 'Yes' : 'No';
  if (field.type === 'multichoice' && Array.isArray(value)) return (value as string[]).join(', ');
  return String(value);
}

// One block per non-group, non-display field -- display fields carry no
// answer, and groups are walked separately (each repetition becomes its own
// section) by the caller below.
function fieldBlocksFor(doc: jsPDF, fields: FormField[], answers: Record<string, unknown>): Block[] {
  const blocks: Block[] = [];
  for (const field of fields) {
    if (field.type === 'display' || field.type === 'group') continue;
    const value = answers[field.id];
    if (field.type === 'signature' && typeof value === 'string' && value) {
      blocks.push(signatureBlock(value, field.label));
      continue;
    }
    if (field.type === 'file' && Array.isArray(value) && value.length > 0) {
      blocks.push(photosBlock(field.label, value as string[]));
      continue;
    }
    blocks.push(fieldBlock(doc, field.label, formatAnswer(field, value)));
  }
  return blocks;
}

/** Renders a completed (or in-progress) form submission as a branded PDF, mirroring customerFormPdf.ts's look. */
export async function buildFormSubmissionPdf(submission: FormSubmissionRecord): Promise<jsPDF> {
  const logo = await loadLogoDataUrl();
  const w = new PdfWriter();
  const doc = w.doc;
  const now = new Date();
  const who = submission.recipientName || submission.recipientEmail;
  const subtitle = submission.submittedAt
    ? `${who} — submitted ${new Date(submission.submittedAt).toLocaleDateString('en-GB')}`
    : who;
  w.drawHeader(logo, subtitle);

  const answers = submission.answers ?? {};
  const topLevelFields = submission.formFieldsSnapshot.filter((f) => f.type !== 'group');
  const groupFields = submission.formFieldsSnapshot.filter((f) => f.type === 'group');

  const topLevelBlocks = fieldBlocksFor(doc, topLevelFields, answers);
  if (topLevelBlocks.length > 0) {
    w.section(submission.formName, topLevelBlocks);
  }

  for (const group of groupFields) {
    if (group.type !== 'group') continue;
    const repetitions = (answers[group.id] as Record<string, unknown>[] | undefined) ?? [];
    if (repetitions.length === 0) {
      w.section(group.label, [paragraphBlock(doc, 'None provided.')]);
      continue;
    }
    repetitions.forEach((rep, i) => {
      const blocks = fieldBlocksFor(doc, group.fields, rep);
      w.section(`${group.label} ${i + 1}`, blocks.length > 0 ? blocks : [spacerBlock(0)]);
    });
  }

  w.finish(`Generated ${now.toLocaleDateString('en-GB')} · PawfectPets Sherborne`);
  return w.doc;
}
