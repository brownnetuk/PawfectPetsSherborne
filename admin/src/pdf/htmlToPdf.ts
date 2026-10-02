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

/** The shared branded header every "export as PDF" document opens with. */
export function pdfBrandHeader(): string {
  return `<div style="display:flex;align-items:center;gap:16px;border-bottom:3px solid #e8963c;padding-bottom:16px;margin-bottom:26px;">
    <img src="${logoUrl}" style="height:48px;width:48px;object-fit:contain;" />
    <div style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:24px;color:#1f3b2c;">PawfectPets Sherborne</div>
  </div>`;
}

export function pdfFooter(): string {
  return `<div style="margin-top:40px;padding-top:12px;border-top:1px solid #e3e8de;font-size:10px;color:#6f7d72;">
    Generated ${new Date().toLocaleDateString('en-GB')} &middot; PawfectPets Sherborne
  </div>`;
}

// Vertical extents (CSS px, relative to `container`) of every line that acts as
// a heading -- an h1-h6, or a bold run that sits alone on its own line (the
// rich-text editor writes "OUR DETAILS"-style headings as bold text between
// <br>s rather than real heading tags). A page break must never land straight
// after one of these, or it's stranded at the foot of a page away from the
// text it introduces.
function findHeadingBoxes(container: HTMLElement): { top: number; bottom: number }[] {
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
  return boxes;
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
  container.style.fontFamily = 'Helvetica, Arial, sans-serif';
  container.style.color = '#232c26';
  container.style.fontSize = '15px';
  container.style.lineHeight = '1.55';
  container.innerHTML = html;
  document.body.appendChild(container);
  let canvas: HTMLCanvasElement;
  let headings: { top: number; bottom: number }[] = [];
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
      const keepPx = 34 * scale;
      const stranded = headings
        .map((h) => ({ top: h.top * scale, bottom: h.bottom * scale }))
        .filter((h) => h.bottom > endPx - keepPx && h.top < endPx)
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
