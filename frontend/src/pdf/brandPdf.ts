import { jsPDF } from 'jspdf';
import { fetchBusinessInfoPublic } from '../api/client';
import logoUrl from '../assets/logo.png';
import archivoBlackUrl from '../assets/fonts/ArchivoBlack-Regular.ttf?url';
import dmSansRegularUrl from '../assets/fonts/DMSans-Regular.ttf?url';
import dmSansBoldUrl from '../assets/fonts/DMSans-Bold.ttf?url';
import dmSansItalicUrl from '../assets/fonts/DMSans-Italic.ttf?url';
import { parseRichLabelRuns } from '../forms/richLabel';

// Copy of admin/src/pdf/brandPdf.ts (the apps don't share code; keep the two
// in step by hand), used here for the registration form PDF -- styled to
// match the branded booking confirmation (bookingConfirmationPdf.ts): a
// rounded blue header band, cream section cards with Archivo Black headings
// over a yellow bar, DM Sans body text and a pink sign-off band. That one is
// an html2canvas capture; these stay as real text so long, multi-page forms
// remain small enough to email and their text stays selectable.

export const MARGIN = 40;
export const PAGE_WIDTH = 595.28; // A4, points
export const PAGE_HEIGHT = 841.89;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_HEIGHT = 22;
const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN - FOOTER_HEIGHT;

// Section cards are padded on both sides; every block draws inside them.
export const CARD_PAD = 14;
export const INNER_X = MARGIN + CARD_PAD;
export const INNER_WIDTH = CONTENT_WIDTH - CARD_PAD * 2;

type Rgb = [number, number, number];
// Same palette as bookingConfirmationPdf.ts (the Pawfect Pets social posts).
export const BLUE: Rgb = [0, 114, 181]; // #0072b5
export const YELLOW: Rgb = [253, 241, 1]; // #fdf101
export const PINK: Rgb = [215, 56, 94]; // #d7385e
export const CREAM: Rgb = [251, 247, 238]; // #fbf7ee
export const INK: Rgb = [29, 42, 51]; // #1d2a33
export const MUTED: Rgb = [95, 111, 122]; // #5f6f7a
export const RULE: Rgb = [217, 230, 239]; // #d9e6ef
const WHITE: Rgb = [255, 255, 255];

export const DISPLAY = 'ArchivoBlack';
export const BODY = 'DMSans';

/** A pre-measured, self-contained chunk of content: know its height before drawing it. */
export interface Block {
  height: number;
  draw: (doc: jsPDF, y: number) => void;
}

async function fetchBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl;
}

let fontCache: Promise<{ file: string; style: string; family: string; data: string }[]> | null = null;

function loadFontFiles() {
  if (!fontCache) {
    const files = [
      { file: 'ArchivoBlack-Regular.ttf', family: DISPLAY, style: 'normal', url: archivoBlackUrl },
      { file: 'DMSans-Regular.ttf', family: BODY, style: 'normal', url: dmSansRegularUrl },
      { file: 'DMSans-Bold.ttf', family: BODY, style: 'bold', url: dmSansBoldUrl },
      { file: 'DMSans-Italic.ttf', family: BODY, style: 'italic', url: dmSansItalicUrl },
    ];
    fontCache = Promise.all(
      files.map(async (f) => ({ ...f, data: (await fetchBase64(f.url)).split(',')[1] ?? '' })),
    ).catch((err) => {
      fontCache = null;
      throw err;
    });
  }
  return fontCache;
}

/**
 * Embeds the brand fonts into `doc`. Falls back to Helvetica (by aliasing
 * the brand family names to it) if they can't be fetched, so a PDF still
 * comes out offline rather than failing outright.
 */
async function registerBrandFonts(doc: jsPDF): Promise<boolean> {
  try {
    for (const f of await loadFontFiles()) {
      doc.addFileToVFS(f.file, f.data);
      doc.addFont(f.file, f.family, f.style);
    }
    return true;
  } catch {
    return false;
  }
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    return await fetchBase64(logoUrl);
  } catch {
    return null;
  }
}

/** "01935 717331 · hello@…" from Settings > Business Info, for the closing band; empty if unavailable. */
export async function loadContactLine(): Promise<string> {
  const info = await fetchBusinessInfoPublic().catch(() => null);
  return [info?.telephone, info?.email].filter(Boolean).join('  ·  ');
}

// --- text helpers -----------------------------------------------------------

let fontsEmbedded = true;

/** Sets the body or display font, quietly using Helvetica if the brand fonts never loaded. */
export function setFont(doc: jsPDF, family: typeof DISPLAY | typeof BODY, style: 'normal' | 'bold' | 'italic' = 'normal') {
  if (fontsEmbedded) {
    doc.setFont(family, family === DISPLAY ? 'normal' : style);
  } else {
    doc.setFont('helvetica', family === DISPLAY ? 'bold' : style);
  }
}

// Word-wraps richLabel.tsx's **bold**/__underline__ markup, which jsPDF's
// splitTextToSize()/text() can't do (they only know plain strings): each
// run is split into words, each word measured at its own weight, then
// greedily packed onto lines up to maxWidth. Styled the way the booking
// confirmation's rich text is -- bold runs in blue, underlined runs as
// bold pink.
interface RichWord {
  text: string;
  bold: boolean;
  underline: boolean;
  width: number;
}

function richWords(doc: jsPDF, raw: string, fontSize: number, allBold = false): RichWord[] {
  const words: RichWord[] = [];
  for (const run of parseRichLabelRuns(raw)) {
    for (const part of run.text.split(/(\s+)/).filter((p) => p.length > 0)) {
      const bold = allBold || run.bold || run.underline;
      setFont(doc, BODY, bold ? 'bold' : 'normal');
      doc.setFontSize(fontSize);
      words.push({ text: part, bold: run.bold, underline: run.underline, width: doc.getTextWidth(part) });
    }
  }
  return words;
}

function wrapRichWords(words: RichWord[], maxWidth: number): RichWord[][] {
  const lines: RichWord[][] = [];
  let current: RichWord[] = [];
  let currentWidth = 0;
  for (const word of words) {
    const isSpace = /^\s+$/.test(word.text);
    if (isSpace && current.length === 0) continue; // never start a line with a space
    if (currentWidth + word.width > maxWidth && current.length > 0) {
      lines.push(current);
      current = [];
      currentWidth = 0;
      if (isSpace) continue;
    }
    current.push(word);
    currentWidth += word.width;
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function drawRichLine(doc: jsPDF, words: RichWord[], x: number, y: number, fontSize: number, color: Rgb, allBold = false) {
  let cursorX = x;
  doc.setFontSize(fontSize);
  for (const word of words) {
    setFont(doc, BODY, allBold || word.bold || word.underline ? 'bold' : 'normal');
    doc.setTextColor(...(word.underline ? PINK : word.bold && !allBold ? BLUE : color));
    doc.text(word.text, cursorX, y);
    cursorX += word.width;
  }
}

/** Wrapped rich text, ready to measure and draw. */
export function richText(doc: jsPDF, text: string, fontSize: number, maxWidth: number, allBold = false) {
  const lines = wrapRichWords(richWords(doc, text, fontSize, allBold), maxWidth);
  return {
    lines: lines.length,
    draw(doc: jsPDF, x: number, y: number, lineHeight: number, color: Rgb) {
      lines.forEach((line, i) => drawRichLine(doc, line, x, y + i * lineHeight, fontSize, color, allBold));
    },
  };
}

function wrapPlain(doc: jsPDF, text: string, fontSize: number, style: 'normal' | 'bold', maxWidth: number): string[] {
  setFont(doc, BODY, style);
  doc.setFontSize(fontSize);
  return text.split('\n').flatMap((para) => (doc.splitTextToSize(para || ' ', maxWidth) as string[]));
}

// --- blocks -----------------------------------------------------------------

const VALUE_SIZE = 9.5;
const VALUE_LEADING = 12.5;
const LABEL_SIZE = 9;
const ROW_PAD = 5;

function divider(doc: jsPDF, y: number) {
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.75);
  doc.line(INNER_X, y, INNER_X + INNER_WIDTH, y);
}

/**
 * A booking-confirmation-style row: muted label on the left, bold value in a
 * column beside it, ruled off underneath. `labelWidth` is sized by the
 * caller to its longest label.
 */
export function fieldRowBlock(doc: jsPDF, label: string, value: string, labelWidth: number): Block {
  const valueLines = wrapPlain(doc, value || '—', VALUE_SIZE, 'bold', INNER_WIDTH - labelWidth);
  const height = ROW_PAD + 9 + (valueLines.length - 1) * VALUE_LEADING + ROW_PAD + 1;
  return {
    height,
    draw(doc, y) {
      const baseline = y + ROW_PAD + 7;
      setFont(doc, BODY, 'normal');
      doc.setFontSize(LABEL_SIZE);
      doc.setTextColor(...MUTED);
      doc.text(label, INNER_X, baseline);
      setFont(doc, BODY, 'bold');
      doc.setFontSize(VALUE_SIZE);
      doc.setTextColor(...INK);
      valueLines.forEach((line, i) => doc.text(line, INNER_X + labelWidth, baseline + i * VALUE_LEADING));
      divider(doc, y + height - 0.5);
    },
  };
}

/**
 * Label stacked above its value -- for forms whose labels are often whole
 * sentences (e.g. "Vaccination record checked and current", or a consent
 * statement with a short "Yes" answer) and would never fit a label column.
 */
export function stackedFieldBlock(doc: jsPDF, label: string, value: string): Block {
  // A short label and answer (most toggles: "Fees paid in full ... Yes")
  // sit on one line instead, label left and answer right, as the booking
  // confirmation's rows do.
  const shown = value || '—';
  setFont(doc, BODY, 'bold');
  doc.setFontSize(VALUE_SIZE);
  const valueWidth = doc.getTextWidth(shown);
  const inlineLabel = richText(doc, label, LABEL_SIZE, INNER_WIDTH - valueWidth - 24);
  if (!shown.includes('\n') && valueWidth < INNER_WIDTH / 2 && inlineLabel.lines === 1) {
    const height = ROW_PAD + 9 + ROW_PAD + 1;
    return {
      height,
      draw(doc, y) {
        const baseline = y + ROW_PAD + 7;
        inlineLabel.draw(doc, INNER_X, baseline, 0, MUTED);
        setFont(doc, BODY, 'bold');
        doc.setFontSize(VALUE_SIZE);
        doc.setTextColor(...INK);
        doc.text(shown, INNER_X + INNER_WIDTH, baseline, { align: 'right' });
        divider(doc, y + height - 0.5);
      },
    };
  }
  const labelText = richText(doc, label, LABEL_SIZE, INNER_WIDTH);
  const valueLines = wrapPlain(doc, value || '—', VALUE_SIZE, 'bold', INNER_WIDTH);
  const labelLeading = 11.5;
  const height = ROW_PAD + 8 + (labelText.lines - 1) * labelLeading + 4 + valueLines.length * VALUE_LEADING + ROW_PAD - 2;
  return {
    height,
    draw(doc, y) {
      let cursor = y + ROW_PAD + 7;
      labelText.draw(doc, INNER_X, cursor, labelLeading, MUTED);
      cursor += (labelText.lines - 1) * labelLeading + 4 + VALUE_LEADING;
      setFont(doc, BODY, 'bold');
      doc.setFontSize(VALUE_SIZE);
      doc.setTextColor(...INK);
      valueLines.forEach((line, i) => doc.text(line, INNER_X, cursor + i * VALUE_LEADING));
      divider(doc, y + height - 0.5);
    },
  };
}

/** Body text (e.g. consent wording ahead of a signature); rich-label aware. */
export function paragraphBlock(doc: jsPDF, text: string, fontSize = 9.5): Block {
  const leading = fontSize * 1.35;
  const body = richText(doc, text, fontSize, INNER_WIDTH);
  return {
    height: body.lines * leading + 6,
    draw(doc, y) {
      body.draw(doc, INNER_X, y + fontSize, leading, INK);
    },
  };
}

/** A blue sub-heading inside a section, wrapping if it's long. */
export function subheadingBlock(doc: jsPDF, text: string): Block {
  const size = 10;
  const leading = 13;
  const body = richText(doc, text, size, INNER_WIDTH, true);
  return {
    height: 8 + body.lines * leading + 2,
    draw(doc, y) {
      body.draw(doc, INNER_X, y + 8 + size, leading, BLUE);
    },
  };
}

/** A numbered or bulleted list (terms and conditions). */
export function listBlock(doc: jsPDF, items: string[], numbered: boolean): Block {
  const size = 9;
  const leading = 12;
  const indent = 14;
  const wrapped = items.map((item) => wrapPlain(doc, item, size, 'normal', INNER_WIDTH - indent));
  const height = wrapped.reduce((sum, lines) => sum + lines.length * leading + 4, 0) + 4;
  return {
    height,
    draw(doc, y) {
      let cursor = y + size + 2;
      wrapped.forEach((lines, i) => {
        setFont(doc, BODY, 'bold');
        doc.setFontSize(size);
        doc.setTextColor(...BLUE);
        if (numbered) {
          doc.text(`${i + 1}.`, INNER_X, cursor);
        } else {
          doc.setFillColor(...PINK);
          doc.circle(INNER_X + 3, cursor - 3, 1.6, 'F');
        }
        setFont(doc, BODY, 'normal');
        doc.setTextColor(...INK);
        lines.forEach((line, j) => doc.text(line, INNER_X + indent, cursor + j * leading));
        cursor += lines.length * leading + 4;
      });
    },
  };
}

/** A muted aside, e.g. "None provided." for an empty repeatable group. */
export function mutedNoteBlock(text: string): Block {
  return {
    height: 20,
    draw(doc, y) {
      setFont(doc, BODY, 'italic');
      doc.setFontSize(9.5);
      doc.setTextColor(...MUTED);
      doc.text(text, INNER_X, y + 13);
    },
  };
}

/** A signature on a white "pad" with its caption underneath. */
export function signatureBlock(dataUrl: string, label: string): Block {
  const w = 200;
  const h = 65;
  return {
    height: 8 + h + 26,
    draw(doc, y) {
      const top = y + 8;
      doc.setFillColor(...WHITE);
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.75);
      doc.roundedRect(INNER_X, top, w, h, 6, 6, 'FD');
      try {
        doc.addImage(dataUrl, 'PNG', INNER_X + 4, top + 2, w - 8, h - 4);
      } catch {
        // Malformed/legacy signature data -- skip the image rather than fail the whole PDF.
      }
      setFont(doc, BODY, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(label, INNER_X, top + h + 12);
    },
  };
}

// A tick drawn as two strokes -- not a "✓" glyph, which isn't in every font.
export function drawTick(doc: jsPDF, x: number, baseline: number, color: Rgb) {
  doc.setDrawColor(...color);
  doc.setLineWidth(1.3);
  doc.line(x + 1, baseline - 3.5, x + 3.5, baseline - 1);
  doc.line(x + 3.5, baseline - 1, x + 8, baseline - 7);
}

/** A multichoice answer's selected items, one ticked line each. */
export function checklistBlock(doc: jsPDF, label: string, items: string[]): Block {
  const labelText = richText(doc, label, LABEL_SIZE, INNER_WIDTH);
  const labelLeading = 11.5;
  const itemLines = items.map((item) => wrapPlain(doc, item, VALUE_SIZE, 'bold', INNER_WIDTH - 16));
  const itemsHeight = itemLines.reduce((sum, lines) => sum + lines.length * VALUE_LEADING + 2, 0);
  const height = ROW_PAD + 8 + (labelText.lines - 1) * labelLeading + 4 + itemsHeight + ROW_PAD - 2;
  return {
    height,
    draw(doc, y) {
      let cursor = y + ROW_PAD + 7;
      labelText.draw(doc, INNER_X, cursor, labelLeading, MUTED);
      cursor += (labelText.lines - 1) * labelLeading + 4 + VALUE_LEADING;
      itemLines.forEach((lines) => {
        drawTick(doc, INNER_X, cursor, BLUE);
        setFont(doc, BODY, 'bold');
        doc.setFontSize(VALUE_SIZE);
        doc.setTextColor(...INK);
        lines.forEach((line, j) => doc.text(line, INNER_X + 16, cursor + j * VALUE_LEADING));
        cursor += lines.length * VALUE_LEADING + 2;
      });
      divider(doc, y + height - 0.5);
    },
  };
}

export function spacerBlock(h: number): Block {
  return { height: h, draw: () => {} };
}

// --- page writer --------------------------------------------------------------

export interface HeaderOptions {
  /** Title, with the last word picked out in yellow like "Booking confirmed". */
  title: string;
  /** Italic line under the title, e.g. "for Caroline Leatherdale". */
  subtitle?: string;
  /** Small caps label and yellow pill on the right, e.g. "Submitted" / "11/10/2026". */
  badge?: { label: string; value: string };
}

const HEADER_HEIGHT = 80;
const SECTION_GAP = 12;
const CARD_TOP_PAD = 12;
const CARD_BOTTOM_PAD = 8;
const HEADING_SIZE = 12;
const HEADING_LEADING = 15;

export class BrandPdfWriter {
  doc = new jsPDF({ unit: 'pt', format: 'a4' });
  y = MARGIN;
  private logo: string | null = null;

  /** Loads the logo and fonts; call before anything else. */
  async init() {
    const [logo, fonts] = await Promise.all([loadLogoDataUrl(), registerBrandFonts(this.doc)]);
    this.logo = logo;
    fontsEmbedded = fonts;
  }

  drawHeader({ title, subtitle, badge }: HeaderOptions) {
    const doc = this.doc;
    const top = MARGIN;
    doc.setFillColor(...BLUE);
    doc.roundedRect(MARGIN, top, CONTENT_WIDTH, HEADER_HEIGHT, 10, 10, 'F');

    const cy = top + HEADER_HEIGHT / 2;
    const badgeR = 27;
    const badgeCx = MARGIN + 16 + badgeR;
    doc.setFillColor(...WHITE);
    doc.circle(badgeCx, cy, badgeR, 'F');
    if (this.logo) {
      try {
        doc.addImage(this.logo, 'PNG', badgeCx - 22, cy - 22, 44, 44);
      } catch {
        // ignore malformed logo data
      }
    }

    // Right-hand badge first, so the title knows how much room it has.
    let rightEdge = MARGIN + CONTENT_WIDTH - 16;
    if (badge) {
      setFont(doc, DISPLAY);
      doc.setFontSize(11.5);
      const pillW = doc.getTextWidth(badge.value) + 20;
      const pillH = 20;
      const pillX = rightEdge - pillW;
      doc.setFillColor(...YELLOW);
      doc.roundedRect(pillX, cy - 4, pillW, pillH, pillH / 2, pillH / 2, 'F');
      doc.setTextColor(...BLUE);
      doc.text(badge.value, pillX + 10, cy + 10);
      setFont(doc, BODY, 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...CREAM);
      doc.text(badge.label.toUpperCase(), rightEdge, cy - 10, { align: 'right', charSpace: 0.9 });
      rightEdge = pillX - 14;
    }

    const textX = badgeCx + badgeR + 14;
    const maxTitleW = rightEdge - textX;
    setFont(doc, BODY, 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...CREAM);
    doc.text('PAWFECT PETS  ·  SHERBORNE', textX, cy - 17, { charSpace: 1.3 });

    // Shrink a long title to fit rather than wrap it.
    const words = title.trim().split(/\s+/);
    const highlight = words.length > 1 ? words.pop()! : '';
    const lead = words.join(' ');
    setFont(doc, DISPLAY);
    let size = 21;
    const spaceW = () => doc.getTextWidth(' ');
    const widthAt = (s: number) => {
      doc.setFontSize(s);
      return doc.getTextWidth(lead) + (highlight ? spaceW() + doc.getTextWidth(highlight) : 0);
    };
    while (size > 12 && widthAt(size) > maxTitleW) size -= 0.5;
    doc.setFontSize(size);
    const titleY = cy + 6;
    doc.setTextColor(...CREAM);
    doc.text(lead, textX, titleY);
    if (highlight) {
      const hx = textX + doc.getTextWidth(lead) + spaceW();
      const hw = doc.getTextWidth(highlight);
      doc.setTextColor(...YELLOW);
      doc.text(highlight, hx, titleY);
      doc.setFillColor(...YELLOW);
      doc.rect(hx, titleY + 3, hw, 2.6, 'F');
    }

    if (subtitle) {
      setFont(doc, BODY, 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...CREAM);
      const line = (doc.splitTextToSize(subtitle, maxTitleW) as string[])[0] ?? '';
      doc.text(line, textX, cy + 22);
    }

    this.y = top + HEADER_HEIGHT + 16;
  }

  private newPage() {
    this.doc.addPage();
    this.y = MARGIN;
  }

  /** Forces the next section onto a fresh page, unless one's already blank. */
  startNewPage() {
    if (this.y > MARGIN) this.newPage();
  }

  /**
   * A heading and its blocks, in a cream card (or bare, with `card: false`,
   * like the booking confirmation's terms). Kept together on one page when
   * it fits a fresh one; a longer section flows on block by block, never
   * cutting a block in half, with its card continuing onto the next page.
   * An empty title draws no heading at all.
   */
  section(title: string, blocks: Block[], { card = true }: { card?: boolean } = {}) {
    const doc = this.doc;
    setFont(doc, DISPLAY);
    doc.setFontSize(HEADING_SIZE);
    const titleLines = title ? (doc.splitTextToSize(title, INNER_WIDTH) as string[]) : [];
    const headingHeight = titleLines.length > 0 ? CARD_TOP_PAD + titleLines.length * HEADING_LEADING + 8 : CARD_TOP_PAD - 4;
    const firstBlock = blocks[0]?.height ?? 0;
    const total = headingHeight + blocks.reduce((sum, b) => sum + b.height, 0) + CARD_BOTTOM_PAD;

    if (this.y > MARGIN) this.y += SECTION_GAP;
    const fitsFreshPage = total <= CONTENT_BOTTOM - MARGIN;
    if (this.y > MARGIN && ((total > CONTENT_BOTTOM - this.y && fitsFreshPage) || headingHeight + firstBlock > CONTENT_BOTTOM - this.y)) {
      this.newPage();
    }

    // Lay everything out first, so each page's stretch of card can be filled
    // in before the text that sits on it.
    const startPage = doc.getNumberOfPages();
    const segments: { page: number; top: number; bottom: number }[] = [{ page: startPage, top: this.y, bottom: 0 }];
    const headingY = this.y;
    let cursor = this.y + headingHeight;
    let page = startPage;
    const placed: { block: Block; page: number; y: number }[] = [];
    for (const block of blocks) {
      if (cursor + block.height + CARD_BOTTOM_PAD > CONTENT_BOTTOM && cursor > MARGIN + CARD_TOP_PAD) {
        segments[segments.length - 1].bottom = cursor + CARD_BOTTOM_PAD;
        this.newPage();
        page = doc.getNumberOfPages();
        segments.push({ page, top: MARGIN, bottom: 0 });
        cursor = MARGIN + CARD_TOP_PAD - 4;
      }
      placed.push({ block, page, y: cursor });
      cursor += block.height;
    }
    segments[segments.length - 1].bottom = cursor + CARD_BOTTOM_PAD;

    if (card) {
      for (const seg of segments) {
        doc.setPage(seg.page);
        doc.setFillColor(...CREAM);
        doc.roundedRect(MARGIN, seg.top, CONTENT_WIDTH, seg.bottom - seg.top, 9, 9, 'F');
      }
    }

    if (titleLines.length > 0) {
      doc.setPage(startPage);
      setFont(doc, DISPLAY);
      doc.setFontSize(HEADING_SIZE);
      doc.setTextColor(...BLUE);
      const firstBaseline = headingY + CARD_TOP_PAD + HEADING_SIZE - 1;
      titleLines.forEach((line, i) => doc.text(line, INNER_X, firstBaseline + i * HEADING_LEADING));
      doc.setFillColor(...YELLOW);
      doc.roundedRect(INNER_X, firstBaseline + (titleLines.length - 1) * HEADING_LEADING + 5, 24, 3, 1.5, 1.5, 'F');
    }

    for (const p of placed) {
      doc.setPage(p.page);
      p.block.draw(doc, p.y);
    }
    doc.setPage(page);
    this.y = segments[segments.length - 1].bottom;
  }

  /**
   * Closes the document: the pink "Questions? Just get in touch" band (when
   * there's a contact line to show) and a footer on every page.
   */
  finish(contact: string) {
    const doc = this.doc;
    if (contact) {
      const bandH = 30;
      // The band may dip into the footer's top margin rather than be
      // stranded alone on a page of its own.
      if (this.y + SECTION_GAP + bandH > PAGE_HEIGHT - MARGIN - 8) this.newPage();
      const top = this.y > MARGIN ? this.y + SECTION_GAP : this.y;
      doc.setFillColor(...PINK);
      doc.roundedRect(MARGIN, top, CONTENT_WIDTH, bandH, 9, 9, 'F');
      doc.setTextColor(...WHITE);
      setFont(doc, BODY, 'bold');
      doc.setFontSize(10);
      doc.text('Questions? Just get in touch', MARGIN + 16, top + 19);
      setFont(doc, BODY, 'normal');
      doc.setFontSize(8.5);
      doc.text(contact, MARGIN + CONTENT_WIDTH - 16, top + 19, { align: 'right' });
      this.y = top + bandH;
    }

    const total = doc.getNumberOfPages();
    const generated = `Generated ${new Date().toLocaleDateString('en-GB')}  ·  Pawfect Pets Sherborne`;
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      setFont(doc, BODY, 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      const y = PAGE_HEIGHT - MARGIN + 6;
      doc.text(generated, MARGIN, y);
      doc.text(`Page ${i} of ${total}`, MARGIN + CONTENT_WIDTH, y, { align: 'right' });
    }
  }
}
