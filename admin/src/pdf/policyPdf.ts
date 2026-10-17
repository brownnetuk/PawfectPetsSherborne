import { jsPDF } from 'jspdf';
import { loadContactLine } from './brandPdf';
import {
  BODY_FONT,
  INK,
  MUTED,
  escapeHtml,
  loadBrandFonts,
  pdfBrandHeader,
  pdfFooter,
  renderHtmlToPdf,
  richTextStyles,
} from './htmlToPdf';
import type { Policy, PolicyVersion } from '../types';

/** Renders a policy's current version as a branded PDF in the booking confirmation's style. */
export async function buildPolicyPdf(policy: Policy, version: PolicyVersion): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const meta = [policy.category, policy.reference, `v${version.version}`, `Published ${new Date(version.publishedAt).toLocaleDateString('en-GB')}`]
    .filter((m): m is string => !!m)
    .map((m) => escapeHtml(m))
    .join(' &middot; ');
  const contact = escapeHtml(await loadContactLine());

  const html = `
    ${richTextStyles('pp-policy')}
    <div style="font-family:${BODY_FONT};color:${INK};">
      ${pdfBrandHeader({ title: policy.name, subtitle: `Policy ${policy.policyId}`, badge: { label: 'Version', value: `v${version.version}` } })}
      <div style="margin:14px 2px 16px;font-size:12px;color:${MUTED};">${meta}</div>
      <div class="pp-policy" style="margin:0 2px;">${version.content}</div>
      ${pdfFooter(contact)}
    </div>
  `;

  await loadBrandFonts();
  await renderHtmlToPdf(doc, html);
  return doc;
}
