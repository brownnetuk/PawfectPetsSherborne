import { jsPDF } from 'jspdf';
import logoUrl from '../assets/logo.png';
import type { Policy, PolicyVersion } from '../types';

const PAGE_WIDTH_PT = 595.28; // A4
const MARGIN_PT = 40;
const CONTENT_WIDTH_PT = PAGE_WIDTH_PT - MARGIN_PT * 2;
const RENDER_WIDTH_PX = 800; // html2canvas's rendering viewport, scaled down to CONTENT_WIDTH_PT

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Renders a policy's current version as a branded, nicely formatted PDF.
 * Uses jsPDF's html() renderer (backed by html2canvas) rather than the
 * hand-drawn block builders elsewhere in pdf/ -- a policy's content is
 * arbitrary staff-authored rich HTML from RichTextEditor (headings, lists,
 * tables, bold/underline) rather than a fixed set of form fields, so
 * rendering the real HTML directly is far more robust than reimplementing
 * layout for every formatting case those other builders don't need to.
 */
export async function buildPolicyPdf(policy: Policy, version: PolicyVersion): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const meta = [policy.category, policy.reference, `v${version.version}`, `Published ${new Date(version.publishedAt).toLocaleDateString('en-GB')}`]
    .filter(Boolean)
    .join(' &middot; ');

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
  container.style.width = `${RENDER_WIDTH_PX}px`;
  container.style.fontFamily = 'Helvetica, Arial, sans-serif';
  container.style.color = '#232c26';
  container.style.fontSize = '15px';
  container.style.lineHeight = '1.55';
  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;border-bottom:3px solid #e8963c;padding-bottom:16px;margin-bottom:26px;">
      <img src="${logoUrl}" style="height:48px;width:48px;object-fit:contain;" />
      <div style="font-family:Georgia,'Times New Roman',serif;font-weight:bold;font-size:24px;color:#1f3b2c;">PawfectPets Sherborne</div>
    </div>
    <div style="font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#6f7d72;font-weight:bold;margin-bottom:6px;">Policy ${escapeHtml(policy.policyId)}</div>
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:27px;color:#1f3b2c;margin:0 0 8px;">${escapeHtml(policy.name)}</h1>
    <div style="font-size:13px;color:#6f7d72;margin-bottom:26px;">${meta}</div>
    <div>${version.content}</div>
    <div style="margin-top:40px;padding-top:12px;border-top:1px solid #e3e8de;font-size:10px;color:#6f7d72;">
      Generated ${new Date().toLocaleDateString('en-GB')} &middot; PawfectPets Sherborne
    </div>
  `;
  document.body.appendChild(container);
  try {
    const images = Array.from(container.querySelectorAll('img'));
    await Promise.all(
      images.map((img) => (img.complete ? Promise.resolve() : new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      }))),
    );
    await doc.html(container, {
      x: MARGIN_PT,
      y: MARGIN_PT,
      width: CONTENT_WIDTH_PT,
      windowWidth: RENDER_WIDTH_PX,
      // 'text' mode (jsPDF's more elaborate vector-text-reconstruction path)
      // has its own coordinate-transform bug that silently truncates some
      // lines mid-word even though the underlying html2canvas capture is
      // correct (verified directly) -- plain `true` just slices the correct
      // raster capture across pages instead, which is all a branded document
      // like this needs (it doesn't need to be a real text layer).
      autoPaging: true,
      margin: [MARGIN_PT, MARGIN_PT, MARGIN_PT, MARGIN_PT],
      // html2canvas itself defaults its capture width/height to the real
      // browser viewport (window.innerWidth/innerHeight), NOT the container's
      // own width -- jsPDF's own windowWidth/width above only feed its
      // internal scale math, they aren't forwarded to html2canvas's capture
      // dimensions. Without this, content wider than whatever browser window
      // happens to be open gets silently clipped on the right.
      html2canvas: { width: RENDER_WIDTH_PX, windowWidth: RENDER_WIDTH_PX },
    });
  } finally {
    document.body.removeChild(container);
  }
  return doc;
}
