import { jsPDF } from 'jspdf';
import { escapeHtml, pdfBrandHeader, pdfFooter, renderHtmlToPdf } from './htmlToPdf';
import type { RiskAssessment, RiskItem } from '../types';

const REVIEW_FREQUENCY_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  '6-monthly': '6-Monthly',
  annually: 'Annually',
};

function reviewFrequencyLabel(value?: string): string {
  return value ? REVIEW_FREQUENCY_LABELS[value] ?? value : '—';
}

function scoreBand(score: number): 'low' | 'medium' | 'high' {
  if (score <= 6) return 'low';
  if (score <= 14) return 'medium';
  return 'high';
}

const BAND_COLORS: Record<'low' | 'medium' | 'high', string> = {
  low: '#2f7d4f',
  medium: '#b8860b',
  high: '#c0392b',
};

function riskBadge(label: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:bold;color:#fff;background:${color};white-space:nowrap;">${escapeHtml(label)}</span>`;
}

function bulletList(items: string[]): string {
  if (items.length === 0) return '—';
  return `<ul style="margin:0;padding-left:16px;">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
}

function riskRow(risk: RiskItem, index: number): string {
  const score = risk.likelihood * risk.severity;
  const band = scoreBand(score);
  return `<tr>
    <td style="padding:8px 6px;border-bottom:1px solid #e3e8de;vertical-align:top;">${index + 1}</td>
    <td style="padding:8px 6px;border-bottom:1px solid #e3e8de;vertical-align:top;"><strong>${escapeHtml(risk.hazard)}</strong></td>
    <td style="padding:8px 6px;border-bottom:1px solid #e3e8de;vertical-align:top;">${risk.whoAtRisk ? escapeHtml(risk.whoAtRisk) : '—'}</td>
    <td style="padding:8px 6px;border-bottom:1px solid #e3e8de;vertical-align:top;">${bulletList(risk.existingControls)}</td>
    <td style="padding:8px 6px;border-bottom:1px solid #e3e8de;vertical-align:top;">${bulletList(risk.furtherActions)}</td>
    <td style="padding:8px 6px;border-bottom:1px solid #e3e8de;vertical-align:top;text-align:center;">${risk.likelihood}</td>
    <td style="padding:8px 6px;border-bottom:1px solid #e3e8de;vertical-align:top;text-align:center;">${risk.severity}</td>
    <td style="padding:8px 6px;border-bottom:1px solid #e3e8de;vertical-align:top;">${riskBadge(`${score} - ${band.toUpperCase()}`, BAND_COLORS[band])}</td>
    <td style="padding:8px 6px;border-bottom:1px solid #e3e8de;vertical-align:top;">${riskBadge(risk.residualRisk.toUpperCase(), BAND_COLORS[risk.residualRisk])}</td>
    <td style="padding:8px 6px;border-bottom:1px solid #e3e8de;vertical-align:top;">${reviewFrequencyLabel(risk.reviewPeriod)}</td>
  </tr>`;
}

/** Renders a risk assessment (header details + full risks table) as a branded, nicely formatted PDF. */
export async function buildRiskAssessmentPdf(assessment: RiskAssessment): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const metaRows: [string, string][] = [
    ['RA ID', assessment.raId],
    ['Assessment Date', new Date(assessment.assessmentDate).toLocaleDateString('en-GB')],
    ['Review Frequency', reviewFrequencyLabel(assessment.reviewFrequency)],
    ['Next Review Date', assessment.nextReviewDate ? new Date(assessment.nextReviewDate).toLocaleDateString('en-GB') : '—'],
    ['Status', assessment.status.charAt(0).toUpperCase() + assessment.status.slice(1)],
    ['Regulation Reference', assessment.regulationReference || '—'],
    ['Scope', assessment.scope || '—'],
  ];

  const metaHtml = metaRows
    .map(
      ([label, value]) => `<div style="margin-bottom:10px;">
        <div style="font-size:10px;letter-spacing:0.05em;text-transform:uppercase;color:#6f7d72;font-weight:bold;margin-bottom:2px;">${escapeHtml(label)}</div>
        <div>${escapeHtml(value)}</div>
      </div>`,
    )
    .join('');

  const risksHtml =
    assessment.risks.length === 0
      ? '<p style="color:#6f7d72;">No risks recorded.</p>'
      : `<table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr>
              ${['#', 'Hazard / Risk', 'Who At Risk', 'Existing Controls', 'Further Actions', 'L', 'S', 'Score', 'Residual', 'Review']
                .map((h) => `<th style="text-align:left;padding:6px;border-bottom:2px solid #1f3b2c;font-size:10px;letter-spacing:0.03em;text-transform:uppercase;color:#1f3b2c;">${h}</th>`)
                .join('')}
            </tr>
          </thead>
          <tbody>${assessment.risks.map((r, i) => riskRow(r, i)).join('')}</tbody>
        </table>`;

  const html = `
    ${pdfBrandHeader()}
    <div style="font-size:11px;letter-spacing:0.05em;text-transform:uppercase;color:#6f7d72;font-weight:bold;margin-bottom:6px;">Risk Assessment</div>
    <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:27px;color:#1f3b2c;margin:0 0 20px;">${escapeHtml(assessment.name)}</h1>
    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:6px 24px;margin-bottom:26px;">${metaHtml}</div>
    <h2 style="font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#1f3b2c;margin:0 0 12px;">Risks</h2>
    ${risksHtml}
    ${pdfFooter()}
  `;

  await renderHtmlToPdf(doc, html);
  return doc;
}
