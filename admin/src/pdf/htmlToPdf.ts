import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import logoUrl from '../assets/logo.png';

export const MARGIN_PT = 40;
// Pixel density html2canvas renders at, tuned against a portrait A4 page
// (595.28pt wide, so a 515.28pt-wide content area) -- kept as a ratio rather
// than a fixed render width so a landscape doc's wider content area renders
// at the same effective resolution instead of coming out blurrier.
const RENDER_PX_PER_PT = 800 / (595.28 - MARGIN_PT * 2);

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Brand palette and type from the Pawfect Pets social posts, shared by every
// html2canvas-captured PDF (booking confirmation, policies, risk
// assessments): a bold blue ground, yellow highlights, a pink call-out band
// and cream lettering, with Archivo Black display headings over DM Sans body
// text (both loaded from Google Fonts in index.html). brandPdf.ts draws the
// same look as vector text for the jsPDF-drawn documents.
export const BLUE = '#0072b5';
export const YELLOW = '#fdf101';
export const PINK = '#d7385e';
export const CREAM = '#fbf7ee';
export const INK = '#1d2a33';
export const MUTED = '#5f6f7a';
export const RULE = '#d9e6ef';
export const DISPLAY_FONT = "'Archivo Black', 'Arial Black', Helvetica, sans-serif";
export const BODY_FONT = "'DM Sans', Helvetica, Arial, sans-serif";

// html2canvas draws with whatever fonts are already loaded, so make sure the
// web fonts have arrived before the capture or it falls back to Helvetica.
export async function loadBrandFonts(): Promise<void> {
  if (!document.fonts) return;
  await Promise.all(
    ['400 20px "Archivo Black"', '400 13px "DM Sans"', '700 13px "DM Sans"', 'italic 400 13px "DM Sans"'].map((f) =>
      document.fonts.load(f).catch(() => undefined),
    ),
  );
}

/** Muted label left, bold value right, ruled off underneath. */
export function fieldRow(label: string, value: string, highlight = false): string {
  const valueStyle = highlight
    ? `background:${PINK};color:#fff;border-radius:999px;padding:1px 10px;`
    : '';
  return `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:5px 0;border-bottom:1px solid ${RULE};font-size:13px;line-height:1.35;">
    <span style="color:${MUTED};white-space:nowrap;">${escapeHtml(label)}</span>
    <span style="font-weight:700;text-align:right;${valueStyle}">${escapeHtml(value)}</span>
  </div>`;
}

/** Archivo Black heading in blue over a short yellow bar. */
export function sectionHeading(title: string): string {
  return `<h2 style="font-family:${DISPLAY_FONT};font-weight:400;font-size:16px;line-height:1.2;color:${BLUE};margin:0 0 6px;">${escapeHtml(title)}<span style="display:block;width:34px;height:4px;background:${YELLOW};border-radius:2px;margin-top:5px;"></span></h2>`;
}

/** A cream, rounded section card with a heading. */
export function card(title: string, body: string): string {
  return `<div style="flex:1;min-width:0;background:${CREAM};border-radius:12px;padding:14px 16px 10px;">
    ${sectionHeading(title)}
    ${body}
  </div>`;
}

/** Styles for staff-written rich text (policies, booking terms) in the brand look. */
export function richTextStyles(className: string): string {
  return `<style>
    .${className} { font-size:13px; line-height:1.45; color:${INK}; }
    .${className} p { margin:0 0 6px; }
    .${className} ul, .${className} ol { margin:4px 0 6px; padding-left:20px; }
    .${className} li { margin:0 0 2px; }
    .${className} h1, .${className} h2, .${className} h3, .${className} h4 { font-family:${DISPLAY_FONT}; font-weight:400; color:${BLUE}; line-height:1.2; margin:14px 0 6px; }
    .${className} h1 { font-size:20px; } .${className} h2 { font-size:17px; } .${className} h3, .${className} h4 { font-size:14px; }
    .${className} b, .${className} strong { color:${BLUE}; }
    .${className} u { text-decoration:none; font-weight:700; color:${PINK}; }
    .${className} a { color:${BLUE}; }
    .${className} table { border-collapse:collapse; width:100%; }
    .${className} td, .${className} th { border-bottom:1px solid ${RULE}; padding:4px 6px; text-align:left; }
  </style>`;
}

export interface BrandHeaderOptions {
  /** Title, with its last word picked out in yellow, e.g. "Booking confirmed". */
  title: string;
  /** Italic line under the title, e.g. "for Caroline Leatherdale". */
  subtitle?: string;
  /** Small caps label and yellow pill on the right, e.g. "Reference" / "BK00010". */
  badge?: { label: string; value: string };
}

/** The blue header band every branded PDF opens with (see bookingConfirmationPdf.ts). */
export function pdfBrandHeader({ title, subtitle, badge }: BrandHeaderOptions): string {
  const words = title.trim().split(/\s+/);
  const highlight = words.length > 1 ? words.pop()! : '';
  const titleHtml = `${escapeHtml(words.join(' '))}${highlight ? ` <span style="color:${YELLOW};border-bottom:4px solid ${YELLOW};">${escapeHtml(highlight)}</span>` : ''}`;
  return `<div style="background:${BLUE};border-radius:14px;padding:18px 22px;display:flex;align-items:center;gap:18px;color:${CREAM};">
    <div style="flex:none;width:78px;height:78px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;">
      <img src="${logoUrl}" style="width:64px;height:64px;object-fit:contain;" />
    </div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Pawfect Pets &middot; Sherborne</div>
      <div style="font-family:${DISPLAY_FONT};font-size:30px;line-height:1.1;letter-spacing:-0.01em;margin:4px 0 4px;">${titleHtml}</div>
      ${subtitle ? `<div style="font-size:13px;font-style:italic;">${escapeHtml(subtitle)}</div>` : ''}
    </div>
    ${
      badge
        ? `<div style="flex:none;text-align:right;">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;opacity:0.85;">${escapeHtml(badge.label)}</div>
      <div style="display:inline-block;margin-top:4px;background:${YELLOW};color:${BLUE};font-family:${DISPLAY_FONT};font-size:18px;padding:4px 12px;border-radius:999px;white-space:nowrap;">${escapeHtml(badge.value)}</div>
    </div>`
        : ''
    }
  </div>`;
}

/**
 * The closing pink "Questions? Just get in touch" band (when there's a
 * contact line) and the generated date, as on the booking confirmation.
 * `contact` is already-escaped HTML.
 */
export function pdfFooter(contact = ''): string {
  return `${
    contact
      ? `<div style="margin-top:18px;background:${PINK};border-radius:12px;padding:11px 18px;display:flex;justify-content:space-between;align-items:center;gap:12px;color:#fff;">
    <div style="font-weight:700;font-size:14px;">Questions? Just get in touch</div>
    <div style="font-size:12px;text-align:right;">${contact}</div>
  </div>`
      : ''
  }
  <div style="margin-top:${contact ? 6 : 18}px;font-size:9.5px;color:${MUTED};text-align:right;">Generated ${new Date().toLocaleDateString('en-GB')}</div>`;
}

// Vertical extents (CSS px, relative to `container`) of every line that acts as
// a heading -- an h1-h6, or a bold run that sits alone on its own line (the
// rich-text editor writes "OUR DETAILS"-style headings as bold text between
// <br>s rather than real heading tags). A page break must never land straight
// after one of these, or it's stranded at the foot of a page away from the
// text it introduces.
type HeadingBox = { top: number; bottom: number; sectionBottom: number };

function findHeadingBoxes(container: HTMLElement): HeadingBox[] {
  const origin = container.getBoundingClientRect().top;
  const boxes: { top: number; bottom: number }[] = [];
  const push = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.height > 0) boxes.push({ top: r.top - origin, bottom: r.bottom - origin });
  };
  container.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(push);
  const isBlank = (n: Node | null) => !!n && n.nodeType === Node.TEXT_NODE && !(n.textContent ?? '').trim();
  const sibling = (n: Node, dir: 'previousSibling' | 'nextSibling'): Node | null => {
    let cur = n[dir];
    while (isBlank(cur)) cur = (cur as Node)[dir];
    return cur;
  };
  container.querySelectorAll('b,strong').forEach((el) => {
    let node: Element = el;
    // Climb out of nested inline wrappers (<strong><span>..</span></strong>) so
    // "alone on its line" is judged against the outermost bold element.
    while (node.parentElement && node.parentElement !== container && ['B', 'STRONG', 'SPAN'].includes(node.parentElement.tagName) && node.parentElement.childNodes.length === 1) {
      node = node.parentElement;
    }
    const prev = sibling(node, 'previousSibling');
    const next = sibling(node, 'nextSibling');
    const startsLine = !prev || (prev as Element).tagName === 'BR';
    const endsLine = !next || (next as Element).tagName === 'BR';
    if (startsLine && endsLine && (el.textContent ?? '').trim().length < 80) push(el);
  });
  // A heading's section runs to the next heading (or the end of the content),
  // so a page break can tell whether it would split a section in two.
  const total = container.getBoundingClientRect().height;
  boxes.sort((a, b) => a.top - b.top);
  return boxes.map((b, i) => ({ ...b, sectionBottom: boxes[i + 1]?.top ?? total }));
}

/**
 * Renders a chunk of HTML into `doc` as a branded, nicely formatted,
 * multi-page-aware PDF. Captures the content with html2canvas and places the
 * resulting image onto the page(s) directly via addImage(), rather than
 * jsPDF's own html()/autoPaging (whose context2d transform truncated lines and
 * misplaced margins). One image when everything fits; otherwise it is cut into
 * page-sized slices at blank rows between lines of text (see below), so no
 * line is split and nothing is repeated or dropped across a page break.
 */
export async function renderHtmlToPdf(doc: jsPDF, html: string): Promise<void> {
  const contentWidthPt = doc.internal.pageSize.getWidth() - MARGIN_PT * 2;
  const contentHeightPt = doc.internal.pageSize.getHeight() - MARGIN_PT * 2;
  const renderWidthPx = Math.round(contentWidthPt * RENDER_PX_PER_PT);

  const container = document.createElement('div');
  // Positioned at the real (0,0) viewport origin but behind everything else
  // and fully transparent -- html2canvas can end up capturing blank content
  // from an element placed off-screen (e.g. left:-9999px), since that's
  // outside any viewport rect it can resolve a layout for.
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.zIndex = '-1';
  container.style.background = '#fff';
  container.style.width = `${renderWidthPx}px`;
  container.style.fontFamily = BODY_FONT;
  container.style.color = INK;
  container.style.fontSize = '15px';
  container.style.lineHeight = '1.55';
  container.innerHTML = html;
  document.body.appendChild(container);
  let canvas: HTMLCanvasElement;
  let headings: HeadingBox[] = [];
  try {
    const images = Array.from(container.querySelectorAll('img'));
    await Promise.all(
      images.map((img) => (img.complete ? Promise.resolve() : new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      }))),
    );
    // width/windowWidth must be given explicitly -- html2canvas otherwise
    // defaults its capture dimensions to the real browser window's
    // innerWidth/innerHeight rather than the container's own width, which
    // silently clips anything past whatever width the browser happens to be
    // open at.
    headings = findHeadingBoxes(container);
    canvas = await html2canvas(container, { width: renderWidthPx, windowWidth: renderWidthPx, backgroundColor: '#ffffff' });
  } finally {
    document.body.removeChild(container);
  }

  const imgWidthPt = contentWidthPt;
  const ptPerPx = imgWidthPt / canvas.width;
  const scale = canvas.width / renderWidthPx;
  const imgHeightPt = canvas.height * ptPerPx;

  if (imgHeightPt <= contentHeightPt) {
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', MARGIN_PT, MARGIN_PT, imgWidthPt, imgHeightPt);
    return;
  }

  // Taller than one page: cut the canvas into page-sized slices, each drawn
  // on its own page inside the margins. Every cut is moved up to the nearest
  // fully blank pixel row (the gap between two lines of text) so a line is
  // never sliced through, and no slice overlaps or skips any content.
  const ctx = canvas.getContext('2d');
  const slicePx = Math.floor(contentHeightPt / ptPerPx);
  const isBlankRow = (y: number): boolean => {
    if (!ctx) return true;
    const row = ctx.getImageData(0, y, canvas.width, 1).data;
    for (let i = 0; i < row.length; i += 4) {
      if (row[i] < 215 || row[i + 1] < 215 || row[i + 2] < 215) return false;
    }
    return true;
  };
  let startPx = 0;
  let firstPage = true;
  while (startPx < canvas.height) {
    let endPx = Math.min(startPx + slicePx, canvas.height);
    if (endPx < canvas.height) {
      const floor = startPx + Math.floor(slicePx * 0.6);
      for (let y = endPx; y > floor; y--) {
        if (isBlankRow(y)) {
          endPx = y;
          break;
        }
      }
    }
    for (let pass = 0; pass < 4 && endPx < canvas.height; pass++) {
      // Never end a page on a heading: if one sits within a line or so above
      // the cut (or straddles it), pull the cut up above it so it travels
      // with the text it introduces -- as long as that leaves a sensible
      // amount of content on this page.
      // Likewise, a section (heading plus its text) that would be split by
      // the cut but fits on a single page is moved wholly to the next page
      // rather than started at the foot of this one.
      const keepPx = 34 * scale;
      const stranded = headings
        .map((h) => ({ top: h.top * scale, bottom: h.bottom * scale, sectionBottom: h.sectionBottom * scale }))
        .filter(
          (h) =>
            h.top > startPx + slicePx * 0.3 &&
            ((h.bottom > endPx - keepPx && h.top < endPx) ||
            (h.top < endPx && h.sectionBottom > endPx && h.sectionBottom - h.top <= slicePx * 0.95)),
        )
        .sort((a, b) => a.top - b.top)[0];
      if (!stranded || stranded.top <= startPx + slicePx * 0.3) break;
      let y = Math.floor(stranded.top);
      while (y > startPx + slicePx * 0.3 && !isBlankRow(y)) y--;
      endPx = y;
    }
    const sliceHeightPx = endPx - startPx;
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = sliceHeightPx;
    const sliceCtx = slice.getContext('2d');
    if (sliceCtx) {
      sliceCtx.fillStyle = '#ffffff';
      sliceCtx.fillRect(0, 0, slice.width, slice.height);
      sliceCtx.drawImage(canvas, 0, startPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
    }
    if (!firstPage) doc.addPage();
    firstPage = false;
    doc.addImage(slice.toDataURL('image/png'), 'PNG', MARGIN_PT, MARGIN_PT, imgWidthPt, sliceHeightPx * ptPerPx);
    startPx = endPx;
  }
}
