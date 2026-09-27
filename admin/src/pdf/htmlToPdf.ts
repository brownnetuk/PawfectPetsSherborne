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

/**
 * Renders a chunk of HTML into `doc` as a branded, nicely formatted,
 * multi-page-aware PDF. Captures the content with html2canvas and places the
 * resulting image onto the page(s) directly via addImage(), rather than
 * jsPDF's own html()/autoPaging (both its 'text' and true modes route
 * through the same context2d-based coordinate transform, which turned out to
 * have two separate bugs of its own -- silently truncating some lines
 * mid-word, and placing the content narrower than the page so the margins
 * came out uneven). addImage() with manually computed placement is simple
 * enough that there's no equivalent transform to get wrong: one
 * drawImage-shaped page when everything fits, otherwise the same image
 * redrawn at a progressively larger negative y on each successive page,
 * relying on the page's own edge to crop whatever doesn't belong on it --
 * the standard "slice a tall image across pages" technique.
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
    canvas = await html2canvas(container, { width: renderWidthPx, windowWidth: renderWidthPx, backgroundColor: '#ffffff' });
  } finally {
    document.body.removeChild(container);
  }

  const imgData = canvas.toDataURL('image/png');
  const imgWidthPt = contentWidthPt;
  const imgHeightPt = (canvas.height / canvas.width) * imgWidthPt;

  if (imgHeightPt <= contentHeightPt) {
    doc.addImage(imgData, 'PNG', MARGIN_PT, MARGIN_PT, imgWidthPt, imgHeightPt);
  } else {
    let shownPt = 0;
    let firstPage = true;
    while (shownPt < imgHeightPt) {
      if (!firstPage) doc.addPage();
      firstPage = false;
      // Redraws the WHOLE image at the same width every time, just shifted
      // further up each page -- content already shown scrolls off above the
      // page's top edge, and content not yet due only starts appearing once
      // this page's own bottom margin would reach it. jsPDF clips drawing to
      // the page bounds automatically, so nothing further needs doing to
      // crop either end.
      doc.addImage(imgData, 'PNG', MARGIN_PT, MARGIN_PT - shownPt, imgWidthPt, imgHeightPt);
      shownPt += contentHeightPt;
    }
  }
}
