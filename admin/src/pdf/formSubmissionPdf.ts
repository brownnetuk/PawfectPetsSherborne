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

// Label stacked above its value (not side-by-side columns) -- a long label
// (e.g. "Vaccination record checked and current") has nowhere near enough
// room in a fixed-width label column at readable size, and would otherwise
// run on into the value text next to it. Stacking is robust to any label
// length and matches ReadOnlyAnswers' own on-screen label-above-value layout.
function fieldBlock(doc: jsPDF, label: string, value: string): Block {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(value || '—', CONTENT_WIDTH) as string[];
  const height = 13 + lines.length * 13 + 6;
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
      lines.forEach((line, i) => doc.text(line, MARGIN, y + 13 + i * 13));
    },
  };
}

// Used for a form's "display" (free text) fields -- often the exact wording
// of what the signer consented to, so this renders in normal ink, not muted,
// same as customerFormPdf.ts's own paragraphBlock (e.g. the vet authorisation
// wording that precedes its signature).
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
      doc.setTextColor(...INK);
      lines.forEach((line, i) => doc.text(line, MARGIN, y + i * 12));
    },
  };
}

// A muted aside, e.g. "None provided." for an empty repeatable group --
// distinct from paragraphBlock, which is for real form content.
function mutedNoteBlock(text: string): Block {
  return {
    height: 18,
    draw(doc, y) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      doc.setTextColor(...MUTED);
      doc.text(text, MARGIN, y);
      doc.setTextColor(...INK);
    },
  };
}

// A repeatable group's own heading (e.g. "Medication"), one step down from a
// section title -- mirrors customerFormPdf.ts's subheadingBlock.
function subheadingBlock(text: string): Block {
  return {
    height: 20,
    draw(doc, y) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...ACCENT);
      doc.text(text, MARGIN, y);
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
    height: 33,
    draw(doc, y) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(label.toUpperCase(), MARGIN, y);
      doc.setTextColor(...INK);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`${photos.length} photo${photos.length === 1 ? '' : 's'} attached`, MARGIN, y + 13);
    },
  };
}

function spacerBlock(h: number): Block {
  return { height: h, draw: () => {} };
}

// A multichoice answer's selected items, one per line with a tick -- a
// long comma-joined list (e.g. every belongings item on one wrapped line)
// reads far worse than a short checklist. The tick is drawn as two line
// segments (same technique checklistPdf.ts's checklistItemBlock uses), not
// a "✓" text character -- jsPDF's standard fonts don't reliably have that
// glyph, so text()-ing it can render blank or as the wrong character.
function checklistBlock(label: string, items: string[]): Block {
  const lineHeight = 13;
  const height = 13 + items.length * lineHeight + 6;
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
      items.forEach((item, i) => {
        const lineY = y + 13 + i * lineHeight;
        doc.setDrawColor(...GREEN);
        doc.setLineWidth(1.1);
        doc.line(MARGIN + 1, lineY - 3, MARGIN + 3, lineY - 1);
        doc.line(MARGIN + 3, lineY - 1, MARGIN + 7, lineY - 6);
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(1);
        doc.text(item, MARGIN + 14, lineY);
      });
    },
  };
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
  if ((field.type === 'date' || field.type === 'today') && typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString('en-GB');
  }
  if (field.type === 'datetime' && typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString('en-GB');
  }
  return String(value);
}

// One (non-group) field's answer as a single block -- shared by the
// top-level walk in buildSections and by repetitionBlocks below for a
// group's own per-repetition fields, so the two only ever differ in how they
// handle a *group* itself, not in how they render a plain field.
function singleFieldBlock(doc: jsPDF, field: FormField, value: unknown): Block {
  if (field.type === 'signature' && typeof value === 'string' && value) {
    return signatureBlock(value, field.label);
  }
  if (field.type === 'file' && Array.isArray(value) && value.length > 0) {
    return photosBlock(field.label, value as string[]);
  }
  if (field.type === 'multichoice' && Array.isArray(value) && value.length > 0) {
    return checklistBlock(field.label, value as string[]);
  }
  return fieldBlock(doc, field.label, formatAnswer(field, value));
}

// One repetition's own fields, flat -- a nested "display" field (the Forms
// engine never nests a group inside a group, so this is as deep as it goes)
// is a lighter sub-heading within this section rather than a new top-level
// page section, e.g. the pre-check-in form's "Boarding-specific questions"
// marker inside its "Pet" group. Promoting a *top-level* display field to a
// full section is buildSections' job below.
function repetitionBlocks(doc: jsPDF, fields: FormField[], answers: Record<string, unknown>): Block[] {
  return fields.map((field) =>
    field.type === 'display' ? subheadingBlock(field.label) : singleFieldBlock(doc, field, answers[field.id]),
  );
}

interface PdfSection {
  title: string;
  blocks: Block[];
}

// Splits a form's TOP-LEVEL fields into one PdfSection per conceptual group,
// each rendered as its own w.section() call (own heading, own "keep
// together or start a fresh page" packing) -- mirrors customerFormPdf.ts's
// hand-written w.section() calls (Client details / Emergency contact / one
// per pet / ...), but derived generically from the form's own structure
// since this renders any form built in FormBuilder, not just the fixed
// Customer/Animal shape that one knows about:
//  - A top-level "display" field starts a new section titled with its own
//    (already-{{token}}-resolved) label, instead of being shown as body
//    text -- see default-pre-checkin-form.ts's "Client details"/"Emergency
//    contact"/etc. markers.
//  - A repeatable group becomes one section per repetition, titled
//    "<group label> — <repetition label>" when repetitionLabels are set
//    (matching customerFormPdf.ts's "Pet — <name>"), else "<group label>
//    <n>". An empty group still gets its own (empty, "None provided.")
//    section rather than vanishing.
//  - Everything else accumulates as body content under whichever title is
//    currently active, defaulting to the form's own name until the first
//    display/group marker takes over.
// A form with no display fields and no groups (most simple ones) ends up as
// a single section, same as before this existed.
function buildSections(
  doc: jsPDF,
  fields: FormField[],
  answers: Record<string, unknown>,
  formName: string,
): PdfSection[] {
  const sections: PdfSection[] = [];
  let title: string | null = null;
  let blocks: Block[] = [];
  const flush = () => {
    if (title !== null) sections.push({ title, blocks });
    blocks = [];
  };
  for (const field of fields) {
    if (field.type === 'display') {
      flush();
      title = field.label;
      continue;
    }
    if (field.type === 'group') {
      flush();
      title = null;
      const repetitions = (answers[field.id] as Record<string, unknown>[] | undefined) ?? [];
      if (repetitions.length === 0) {
        sections.push({ title: field.label, blocks: [mutedNoteBlock('None provided.')] });
      } else {
        repetitions.forEach((rep, i) => {
          const repetitionLabel = field.repetitionLabels?.[i];
          sections.push({
            title: repetitionLabel ? `${field.label} — ${repetitionLabel}` : `${field.label} ${i + 1}`,
            blocks: repetitionBlocks(doc, field.fields, rep),
          });
        });
      }
      continue;
    }
    if (title === null) title = formName;
    blocks.push(singleFieldBlock(doc, field, answers[field.id]));
  }
  flush();
  return sections;
}

/** Renders a completed (or in-progress) form submission as a branded, multi-section PDF, mirroring customerFormPdf.ts's look. */
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

  const sections = buildSections(doc, submission.formFieldsSnapshot, submission.answers ?? {}, submission.formName);
  if (submission.formDescription && sections.length > 0) {
    sections[0].blocks.unshift(paragraphBlock(doc, submission.formDescription), spacerBlock(4));
  }
  for (const section of sections) {
    w.section(section.title, section.blocks);
  }

  w.finish(`Generated ${now.toLocaleDateString('en-GB')} · PawfectPets Sherborne`);
  return w.doc;
}
