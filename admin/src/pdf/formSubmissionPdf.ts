import type { jsPDF } from 'jspdf';
import type { FormField, FormSubmissionRecord } from '../types';
import { withPetName } from '../forms/formDefaults';
import { formatMedications } from '../utils/formatMedications';
import { parseRichLabelRuns } from '../utils/richLabel';
import {
  BODY,
  BrandPdfWriter,
  checklistBlock,
  DISPLAY,
  INNER_WIDTH,
  loadContactLine,
  mutedNoteBlock,
  paragraphBlock,
  setFont,
  signatureBlock,
  spacerBlock,
  stackedFieldBlock,
  subheadingBlock,
  type Block,
} from './brandPdf';

// Plain text of a richLabel.tsx-marked-up label, for measuring.
function plainLabel(text: string): string {
  return parseRichLabelRuns(text)
    .map((run) => run.text)
    .join('');
}

// Whether a label fits on one line in the given heading font -- the test
// for whether a "display" field is a short heading (e.g. "Client details")
// or prose (e.g. "I confirm that I have collected Bella..."), which has to
// wrap as a paragraph instead.
function fitsOneLine(doc: jsPDF, text: string, font: typeof DISPLAY | typeof BODY, fontSize: number): boolean {
  setFont(doc, font, 'bold');
  doc.setFontSize(fontSize);
  return doc.getTextWidth(plainLabel(text)) <= INNER_WIDTH;
}

// An inline (not section-opening) "display" field: a short one is a
// sub-heading, anything longer is body text that wraps to the page width.
function displayBlock(doc: jsPDF, text: string): Block {
  return fitsOneLine(doc, text, BODY, 10) ? subheadingBlock(doc, text) : paragraphBlock(doc, text);
}

function fieldBlock(doc: jsPDF, label: string, value: string): Block {
  return stackedFieldBlock(doc, label, value);
}

// A photo field just notes how many were attached -- the images themselves
// stay in the app.
function photosBlock(doc: jsPDF, label: string, photos: string[]): Block {
  return stackedFieldBlock(doc, label, `${photos.length} photo${photos.length === 1 ? '' : 's'} attached`);
}

function formatAnswer(field: FormField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (field.type === 'toggle') return value ? 'Yes' : 'No';
  if (field.type === 'choice' && typeof value === 'string') return field.optionLabels?.[value] ?? value;
  if (field.type === 'medications') return formatMedications(value);
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
    return photosBlock(doc, field.label, value as string[]);
  }
  if (field.type === 'multichoice' && Array.isArray(value) && value.length > 0) {
    return checklistBlock(doc, field.label, value as string[]);
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
    field.type === 'display' ? displayBlock(doc, field.label) : singleFieldBlock(doc, field, answers[field.id]),
  );
}

interface PdfSection {
  title: string;
  blocks: Block[];
  // Set when this section came from a "+ New page" display field
  // (startsNewPage) -- forces a literal page break before it regardless of
  // whether it would otherwise fit in the remaining space on the current
  // page (unlike section()'s own "keep together, else fresh page" packing,
  // which only breaks when content doesn't fit).
  forceNewPage?: boolean;
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
  let forceNewPage = false;
  const flush = () => {
    if (title !== null) sections.push({ title, blocks, forceNewPage });
    blocks = [];
    forceNewPage = false;
  };
  for (const field of fields) {
    if (field.type === 'display') {
      // A section title only when it's actually the marker that opens one --
      // startsNewPage explicitly, or it's the very first display field seen
      // at all (the form's own opening section, which never sets
      // startsNewPage since it's already the first page/section). Any OTHER
      // display field reaching here is inline body text within the section
      // already open (e.g. a disclaimer/terms paragraph ahead of a
      // signature) -- same subheadingBlock() treatment repetitionBlocks()
      // already gives an inline display field inside a group's own
      // repetition, just applied here for a top-level one.
      // A label too long for a one-line heading (e.g. a "+ New page"
      // field holding a whole consent statement) is the section's first
      // paragraph instead -- under the form's name for the opening section,
      // untitled for a new page.
      if (title === null || field.startsNewPage) {
        const opening: boolean = title === null && !field.startsNewPage;
        flush();
        forceNewPage = !!field.startsNewPage;
        if (fitsOneLine(doc, field.label, DISPLAY, 12)) {
          title = field.label;
        } else {
          title = opening ? formName : '';
          blocks.push(paragraphBlock(doc, field.label));
        }
      } else {
        blocks.push(displayBlock(doc, field.label));
      }
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
            blocks: repetitionBlocks(doc, withPetName(field.fields, repetitionLabel), rep),
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

/** Renders a completed (or in-progress) form submission as a branded, multi-section PDF, in the booking confirmation's style. */
export async function buildFormSubmissionPdf(submission: FormSubmissionRecord): Promise<jsPDF> {
  const w = new BrandPdfWriter();
  const [, contact] = await Promise.all([w.init(), loadContactLine()]);
  const doc = w.doc;
  const who = submission.recipientName || submission.recipientEmail;
  w.drawHeader({
    title: submission.formName,
    subtitle: who ? `for ${who}` : undefined,
    badge: submission.submittedAt
      ? { label: 'Submitted', value: new Date(submission.submittedAt).toLocaleDateString('en-GB') }
      : undefined,
  });

  const sections = buildSections(doc, submission.formFieldsSnapshot, submission.answers ?? {}, submission.formName);
  // The form's name is already the page title, so a section buildSections
  // titled with it by default (the opening fields, or the signatures
  // trailing a repeatable group) gets a plainer heading instead.
  sections.forEach((section, i) => {
    if (section.title === submission.formName) {
      section.title = i > 0 && i === sections.length - 1 ? 'Sign-off' : 'Details';
    }
  });
  if (submission.formDescription && sections.length > 0) {
    sections[0].blocks.unshift(paragraphBlock(doc, submission.formDescription), spacerBlock(4));
  }
  for (const section of sections) {
    if (section.forceNewPage) w.startNewPage();
    w.section(section.title, section.blocks);
  }

  w.finish(contact);
  return w.doc;
}
