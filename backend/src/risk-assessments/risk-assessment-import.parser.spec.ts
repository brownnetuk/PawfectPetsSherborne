import { parseFrequency, parseLooseDate, parseRiskAssessmentHtml, splitItems } from './risk-assessment-import.parser';

const td = (...paras: string[]) => `<td>${paras.map((p) => `<p>${p}</p>`).join('')}</td>`;
const th = (...paras: string[]) => `<th>${paras.map((p) => `<p><strong>${p}</strong></p>`).join('')}</th>`;

// Trimmed copy of what mammoth produces for RA2_Fire_Risk_Assessment.docx.
const RA2_HTML =
  '<p><img src="" /><strong>   Pawfect Pets Sherborne</strong></p>' +
  '<h1>2. Fire Risk Assessment</h1>' +
  '<p><em>Covers fire-related hazards across the premises. For business use of a domestic property, confirm scope with your local fire authority.</em></p>' +
  '<table><thead><tr>' +
  th('Hazard') +
  th('Who might be harmed') +
  th('Existing controls') +
  th('L', '(1-5)') +
  th('S', '(1-5)') +
  th('Risk', '(L×S)') +
  th('Further action needed') +
  th('Action owner') +
  th('Target date') +
  '</tr></thead><tbody><tr>' +
  td('Electrical faults or overloaded sockets') +
  td('Everyone on the premises (people and dogs)') +
  td('Equipment checked regularly; sockets not overloaded; faulty items taken out of use immediately') +
  td('<strong>2</strong>') +
  td('<strong>5</strong>') +
  td('<strong>10 (H)</strong>') +
  td(
    'Arrange a periodic electrical safety check by a qualified electrician (e.g. every 5 years for a business-use property). Fit socket overload protectors where multiple appliances share one circuit.',
  ) +
  td('Licence holder') +
  td('Within 1 month') +
  '</tr><tr>' +
  td('Blocked fire exits or escape routes') +
  td('Everyone on the premises') +
  td('Exits and escape routes checked and kept clear (see Weekly Checklist); doors not obstructed by equipment') +
  td('<strong>1</strong>') +
  td('<strong>5</strong>') +
  td('<strong>5 (M)</strong>') +
  td('Confirm the weekly fire-exit check is actually being completed and signed off, not just listed on the checklist.') +
  td('Licence holder') +
  td('Ongoing') +
  '</tr></tbody></table>' +
  '<p><strong>Assessed by: </strong>James Brown</p>' +
  '<p><strong>Date assessed: </strong>August 2026</p>' +
  '<p><strong>Date of next review (at least annually, or after any incident/change): </strong>February 2027 (6 Monthly)<strong> </strong></p>';

describe('parseRiskAssessmentHtml', () => {
  it('reads the RA2 fire risk assessment layout', () => {
    const draft = parseRiskAssessmentHtml(RA2_HTML, 'RA2_Fire_Risk_Assessment.docx');
    expect(draft).toMatchObject({
      name: 'Fire Risk Assessment',
      scope:
        'Covers fire-related hazards across the premises. For business use of a domestic property, confirm scope with your local fire authority.',
      assessmentDate: '2026-08-01',
      nextReviewDate: '2027-02-01',
      reviewFrequency: '6-monthly',
      assessedBy: 'James Brown',
      warnings: [],
    });
    expect(draft.risks).toHaveLength(2);
    expect(draft.risks[0]).toEqual({
      hazard: 'Electrical faults or overloaded sockets',
      whoAtRisk: 'Everyone on the premises (people and dogs)',
      existingControls: ['Equipment checked regularly', 'Sockets not overloaded', 'Faulty items taken out of use immediately'],
      furtherActions: [
        'Arrange a periodic electrical safety check by a qualified electrician (e.g. every 5 years for a business-use property)',
        'Fit socket overload protectors where multiple appliances share one circuit',
        'Action owner: Licence holder (target: Within 1 month)',
      ],
      likelihood: 2,
      severity: 5,
      // Taken from the document's own "(H)" rating, not recomputed from L×S.
      residualRisk: 'high',
      reviewPeriod: '6-monthly',
    });
    expect(draft.risks[1]).toMatchObject({ likelihood: 1, severity: 5, residualRisk: 'medium' });
  });

  it('copes with a different column order, bullets, a metadata table and a continued table', () => {
    const html =
      '<p>RA5 - Dog Walking Risk Assessment</p>' +
      '<table><tr>' + td('Regulation reference') + td('Schedule 2, paragraph 5.1') + '</tr>' +
      '<tr>' + td('Review frequency') + td('Quarterly') + '</tr>' +
      '<tr>' + td('Assessment date') + td('26/09/2026') + '</tr></table>' +
      '<p>Scope: Walks off the premises.</p>' +
      '<table><tr>' +
      th('#') + th('Hazard / Risk') + th('Existing controls') + th('Who at risk') +
      th('Likelihood') + th('Severity') + th('Residual risk') + th('Review') +
      '</tr><tr>' +
      td('1') + td('Dog slips lead') +
      '<td><ul><li>Double-clip leads</li><li>Harness checked before each walk</li></ul></td>' +
      td('Dogs') + td('3') + td('4') + td('Low') + td('Monthly') +
      '</tr><tr>' + td('Roadside walking') + '<td></td><td></td><td></td><td></td><td></td><td></td><td></td>' +
      '</tr></table>' +
      // Continues after a page break without repeating the header.
      '<table><tr>' +
      td('2') + td('Encounter with livestock') + td('Dogs kept on lead near fields') + td('Dogs, Staff') +
      td('?') + td('5') + td('') + td('') +
      '</tr></table>';
    const draft = parseRiskAssessmentHtml(html);
    expect(draft).toMatchObject({
      name: 'Dog Walking Risk Assessment',
      regulationReference: 'Schedule 2, paragraph 5.1',
      reviewFrequency: 'quarterly',
      assessmentDate: '2026-09-26',
      scope: 'Walks off the premises.',
    });
    // The "Roadside walking" row only fills its first cell -- a section label, not a risk.
    expect(draft.risks.map((r) => r.hazard)).toEqual(['Dog slips lead', 'Encounter with livestock']);
    expect(draft.risks[0]).toMatchObject({
      existingControls: ['Double-clip leads', 'Harness checked before each walk'],
      whoAtRisk: 'Dogs',
      likelihood: 3,
      severity: 4,
      residualRisk: 'low',
      reviewPeriod: 'monthly',
    });
    expect(draft.risks[1]).toMatchObject({ likelihood: null, severity: 5, reviewPeriod: 'quarterly' });
    expect(draft.warnings).toEqual([expect.stringContaining("1 risk doesn't have a readable likelihood/severity")]);
  });

  it('warns when there is no hazards table, and falls back to the file name', () => {
    const draft = parseRiskAssessmentHtml('<p>Just some notes</p>', 'RA7_Lone_Working.docx');
    expect(draft.name).toBe('Lone Working');
    expect(draft.risks).toEqual([]);
    expect(draft.warnings[0]).toMatch(/No hazards table/);
  });
});

describe('helpers', () => {
  it('parses loose dates', () => {
    expect(parseLooseDate('August 2026')).toBe('2026-08-01');
    expect(parseLooseDate('3rd March 2027')).toBe('2027-03-03');
    expect(parseLooseDate('26/09/26')).toBe('2026-09-26');
    expect(parseLooseDate('soon')).toBeUndefined();
  });

  it('parses review frequencies', () => {
    expect(parseFrequency('February 2027 (6 Monthly)')).toBe('6-monthly');
    expect(parseFrequency('Every three months')).toBe('quarterly');
    expect(parseFrequency('Annually')).toBe('annually');
    expect(parseFrequency('Weekly')).toBe('weekly');
    expect(parseFrequency('Ongoing')).toBeUndefined();
  });

  it('splits cells into separate items', () => {
    expect(splitItems(['No further action; continue storing per COSHH Risk Assessment (RA3).'])).toEqual([
      'No further action',
      'Continue storing per COSHH Risk Assessment (RA3)',
    ]);
    expect(splitItems(['• First.', 'Second'])).toEqual(['First', 'Second']);
    expect(splitItems(['N/A'])).toEqual([]);
  });
});
