import { jsPDF } from 'jspdf';
import {
  BLUE,
  BODY_FONT,
  CREAM,
  INK,
  MUTED,
  RULE,
  card,
  escapeHtml,
  fieldRow,
  loadBrandFonts,
  pdfBrandHeader,
  pdfFooter,
  renderHtmlToPdf,
  sectionHeading,
} from './htmlToPdf';
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

// Traffic-light bands, tuned to sit alongside the brand blue/pink.
const BAND_COLORS: Record<'low' | 'medium' | 'high', string> = {
  low: '#2f8a57',
  medium: '#c98a00',
  high: '#d7385e',
};

function riskBadge(label: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#fff;background:${color};white-space:nowrap;">${escapeHtml(label)}</span>`;
}

function bulletList(items: string[]): string {
  if (items.length === 0) return '—';
  return `<ul style="margin:0;padding-left:16px;">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
}

function riskRow(risk: RiskItem, index: number): string {
  const score = risk.likelihood * risk.severity;
  const band = scoreBand(score);
  return `<tr>
    <td style="padding:8px 6px;border-bottom:1px solid ${RULE};vertical-align:top;">${index + 1}</td>
    <td style="padding:8px 6px;border-bottom:1px solid ${RULE};vertical-align:top;"><strong>${escapeHtml(risk.hazard)}</strong></td>
    <td style="padding:8px 6px;border-bottom:1px solid ${RULE};vertical-align:top;">${risk.whoAtRisk ? escapeHtml(risk.whoAtRisk) : '—'}</td>
    <td style="padding:8px 6px;border-bottom:1px solid ${RULE};vertical-align:top;">${bulletList(risk.existingControls)}</td>
    <td style="padding:8px 6px;border-bottom:1px solid ${RULE};vertical-align:top;">${bulletList(risk.furtherActions)}</td>
    <td style="padding:8px 6px;border-bottom:1px solid ${RULE};vertical-align:top;text-align:center;">${risk.likelihood}</td>
    <td style="padding:8px 6px;border-bottom:1px solid ${RULE};vertical-align:top;text-align:center;">${risk.severity}</td>
    <td style="padding:8px 6px;border-bottom:1px solid ${RULE};vertical-align:top;">${riskBadge(`${score} - ${band.toUpperCase()}`, BAND_COLORS[band])}</td>
    <td style="padding:8px 6px;border-bottom:1px solid ${RULE};vertical-align:top;">${riskBadge(risk.residualRisk.toUpperCase(), BAND_COLORS[risk.residualRisk])}</td>
    <td style="padding:8px 6px;border-bottom:1px solid ${RULE};vertical-align:top;">${reviewFrequencyLabel(risk.reviewPeriod)}</td>
  </tr>`;
}

/** Renders a risk assessment (header details + full risks table) as a branded, nicely formatted PDF. */
export async function buildRiskAssessmentPdf(assessment: RiskAssessment): Promise<jsPDF> {
  // Landscape -- the risks table has too many columns (hazard, who's at
  // risk, controls, actions, L/S/score/residual/review) to stay readable at
  // portrait A4's narrower content width.
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });

  const metaRows: [string, string][] = [
    ['RA ID', assessment.raId],
    ['Assessment Date', new Date(assessment.assessmentDate).toLocaleDateString('en-GB')],
    ['Review Frequency', reviewFrequencyLabel(assessment.reviewFrequency)],
    ['Next Review Date', assessment.nextReviewDate ? new Date(assessment.nextReviewDate).toLocaleDateString('en-GB') : '—'],
    ['Status', assessment.status.charAt(0).toUpperCase() + assessment.status.slice(1)],
    ['Regulation Reference', assessment.regulationReference || '—'],
    ['Scope', assessment.scope || '—'],
  ];

  const half = Math.ceil(metaRows.length / 2);
  const metaHtml = [metaRows.slice(0, half), metaRows.slice(half)]
    .map((col, i) => card(i === 0 ? 'Assessment' : 'Review', col.map(([label, value]) => fieldRow(label, value)).join('')))
    .join('');

  const risksHtml =
    assessment.risks.length === 0
      ? `<p style="color:${MUTED};">No risks recorded.</p>`
      : `<table style="width:100%;border-collapse:separate;border-spacing:0;font-size:12px;">
          <thead>
            <tr>
              ${['#', 'Hazard / Risk', 'Who At Risk', 'Existing Controls', 'Further Actions', 'L', 'S', 'Score', 'Residual', 'Review']
                .map(
                  (h, i, all) =>
                    `<th style="text-align:left;padding:7px 6px;background:${BLUE};color:${CREAM};font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;${i === 0 ? 'border-radius:8px 0 0 8px;' : ''}${i === all.length - 1 ? 'border-radius:0 8px 8px 0;' : ''}">${h}</th>`,
                )
                .join('')}
            </tr>
          </thead>
          <tbody>${assessment.risks.map((r, i) => riskRow(r, i)).join('')}</tbody>
        </table>`;

  const html = `
    <div style="font-family:${BODY_FONT};color:${INK};">
      ${pdfBrandHeader({ title: assessment.name, subtitle: 'Risk assessment', badge: { label: 'RA ID', value: assessment.raId } })}
      <div style="display:flex;gap:14px;margin-top:16px;">${metaHtml}</div>
      <div style="margin:18px 2px 0;">
        ${sectionHeading('Risks')}
        ${risksHtml}
      </div>
      ${pdfFooter()}
    </div>
  `;

  await loadBrandFonts();
  await renderHtmlToPdf(doc, html);
  return doc;
}
