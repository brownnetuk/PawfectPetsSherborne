import { jsPDF } from 'jspdf';
import { escapeHtml, pdfBrandHeader, pdfFooter, renderHtmlToPdf } from './htmlToPdf';
import type { Policy, PolicyVersion } from '../types';

/** Renders a policy's current version as a branded, nicely formatted PDF. */
export async function buildPolicyPdf(policy: Policy, version: PolicyVersion): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const meta = [policy.category, policy.reference, `v${version.version}`, `Published ${new Date(version.publishedAt).toLocaleDateString('en-GB')}`]
    .filter(Boolean)
    .join(' &middot; ');

  const html = `
    ${pdfBrandHeader()}
    <div style="font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#6f7d72;font-weight:bold;margin-bottom:6px;">Policy ${escapeHtml(policy.policyId)}</div>
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:27px;color:#1f3b2c;margin:0 0 8px;">${escapeHtml(policy.name)}</h1>
    <div style="font-size:13px;color:#6f7d72;margin-bottom:26px;">${meta}</div>
    <div>${version.content}</div>
    ${pdfFooter()}
  `;

  await renderHtmlToPdf(doc, html);
  return doc;
}
