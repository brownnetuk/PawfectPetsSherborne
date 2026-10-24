import { ResidualRisk, ReviewFrequency } from './schemas/risk-assessment.schema';

// Turns the HTML mammoth produces from a risk assessment .docx (the RA1-RA7
// Word documents: a title, an intro paragraph, a hazards table, then
// "Assessed by / Date assessed / Next review" lines) into a draft the admin
// app shows as an editable preview before anything is saved -- see
// RiskAssessmentsService.previewImport(). Nothing here is strict: columns are
// matched by their header wording rather than position, so a document with
// its columns in a different order, an extra "#" column or a missing one
// still imports, and anything that can't be read is left for staff to fill
// in on the preview (with a warning saying so) rather than failing the upload.

export interface ImportedRiskDraft {
  hazard: string;
  whoAtRisk?: string;
  existingControls: string[];
  furtherActions: string[];
  // null when the cell was missing/unreadable -- the preview makes staff pick one.
  likelihood: number | null;
  severity: number | null;
  residualRisk: ResidualRisk;
  reviewPeriod?: ReviewFrequency;
}

export interface ImportedRiskAssessmentDraft {
  name: string;
  regulationReference?: string;
  reviewFrequency?: ReviewFrequency;
  scope?: string;
  // 'YYYY-MM-DD'
  assessmentDate?: string;
  nextReviewDate?: string;
  assessedBy?: string;
  risks: ImportedRiskDraft[];
  warnings: string[];
}

// --- a tiny reader for mammoth's HTML -------------------------------------
// mammoth only ever emits a small, well-formed subset (p, h1-h6, ul/ol/li,
// table/tr/td/th, strong/em/a/img...), so a full HTML parser isn't needed:
// this flattens it into top-level text blocks and tables of cells, where each
// cell keeps its separate paragraphs/list items (which become separate
// controls/actions). A table nested inside a cell is folded into that cell.

type Block = { kind: 'text'; tag: string; text: string } | { kind: 'table'; rows: string[][][] };

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function clean(s: string): string {
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
}

const PARAGRAPH_TAGS = new Set(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function readBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  // Open tables, innermost last -- only the outermost one becomes a Block.
  const tables: { rows: string[][][] }[] = [];
  let row: string[][] | null = null;
  let cell: string[] | null = null;
  let text = '';
  let textTag = 'p';

  const flush = () => {
    const t = clean(text);
    text = '';
    if (!t) return;
    if (cell) cell.push(t);
    else blocks.push({ kind: 'text', tag: textTag, text: t });
  };

  const re = /<(\/?)([a-zA-Z0-9]+)[^>]*>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[3] !== undefined) {
      text += m[3];
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'br') {
      text += ' ';
    } else if (PARAGRAPH_TAGS.has(tag)) {
      flush();
      if (!closing) textTag = tag;
    } else if (tag === 'table') {
      flush();
      if (!closing) {
        // A nested table's text is folded into the outer cell (see below).
        tables.push({ rows: [] });
      } else {
        const done = tables.pop();
        if (done && tables.length === 0) {
          blocks.push({ kind: 'table', rows: done.rows });
          row = null;
          cell = null;
        }
      }
    } else if (tables.length > 1) {
      // Inside a nested table: keep its text in the outer cell, one item per cell.
      if (tag === 'td' || tag === 'th') flush();
    } else if (tag === 'tr' && tables.length === 1) {
      flush();
      if (!closing) {
        row = [];
        tables[0].rows.push(row);
      } else {
        row = null;
      }
    } else if ((tag === 'td' || tag === 'th') && row) {
      flush();
      if (!closing) {
        cell = [];
        row.push(cell);
      } else {
        cell = null;
      }
    }
  }
  flush();
  return blocks;
}

// --- value parsing ----------------------------------------------------------

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD' from "26/09/2026", "2026-09-26", "26 September 2026", "Sept 2026" or "August 2026" (1st of the month). */
export function parseLooseDate(s: string): string | undefined {
  let m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (+m[2] >= 1 && +m[2] <= 12) return `${year}-${pad(+m[2])}-${pad(+m[1])}`;
  }
  m = s.match(/\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+)?([a-z]{3,9})\.?,?\s+(\d{4})\b/i);
  if (m) {
    const month = MONTHS.findIndex((name) => name.startsWith(m![2].toLowerCase().slice(0, 3)));
    if (month >= 0) return `${m[3]}-${pad(month + 1)}-${pad(m[1] ? +m[1] : 1)}`;
  }
  return undefined;
}

/** Maps wording like "6 Monthly", "every three months", "Annually" onto a review frequency. */
export function parseFrequency(s: string): ReviewFrequency | undefined {
  const t = s.toLowerCase();
  if (/\b(6|six)[\s-]*month|bi-?annual|twice (a|per|each) year|half[\s-]?year/.test(t)) return '6-monthly';
  if (/quarter|\b(3|three)[\s-]*month/.test(t)) return 'quarterly';
  if (/annual|yearly|\b(12|twelve)[\s-]*month|(every|once a|per|each) year/.test(t)) return 'annually';
  if (/week/.test(t)) return 'weekly';
  if (/month/.test(t)) return 'monthly';
  return undefined;
}

function frequencyFromDates(from?: string, to?: string): ReviewFrequency | undefined {
  if (!from || !to) return undefined;
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const months = (ty - fy) * 12 + (tm - fm);
  return ({ 1: 'monthly', 3: 'quarterly', 6: '6-monthly', 12: 'annually' } as Record<number, ReviewFrequency>)[months];
}

function parseRating(s: string): number | null {
  const m = s.match(/\b([1-5])\b/);
  return m ? Number(m[1]) : null;
}

function parseLevel(s: string): ResidualRisk | undefined {
  const t = s.toLowerCase();
  const word = t.match(/\b(very high|extreme|critical|high|medium|med|moderate|low|negligible|trivial)\b/);
  if (word) {
    if (/very high|extreme|critical|high/.test(word[1])) return 'high';
    if (/med|moderate/.test(word[1])) return 'medium';
    return 'low';
  }
  const letter = s.match(/(?:^|[\s(])([HML])(?:[\s)]|$)/);
  if (letter) return ({ H: 'high', M: 'medium', L: 'low' } as const)[letter[1] as 'H' | 'M' | 'L'];
  return undefined;
}

// Same bands the admin app's score badge uses (RiskAssessmentDetailModal scoreBand()).
function bandForScore(score: number): ResidualRisk {
  if (score <= 6) return 'low';
  if (score <= 14) return 'medium';
  return 'high';
}

function sentenceCase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * One cell -> a list of controls/actions. Separate paragraphs or bullets are
 * already separate items; a single run-on paragraph is split on semicolons
 * and sentence breaks ("e.g. every" doesn't split -- the next word must start
 * with a capital).
 */
export function splitItems(paragraphs: string[]): string[] {
  const parts = paragraphs.length > 1 ? paragraphs : paragraphs.flatMap((p) => p.split(/;\s+|(?<=[.!?])\s+(?=[A-Z(])/));
  return parts
    .map((p) => p.replace(/^[\s•▪◦·\-–*]+/, '').replace(/[\s.;,]+$/, '').trim())
    .filter((p) => p && !/^(n\/?a|none|-|—)$/i.test(p))
    .map(sentenceCase);
}

// --- the risks table ----------------------------------------------------------

type Role =
  | 'index'
  | 'hazard'
  | 'who'
  | 'controls'
  | 'likelihood'
  | 'severity'
  | 'score'
  | 'residual'
  | 'further'
  | 'owner'
  | 'target'
  | 'review';

// Checked in order, so the more specific wordings win: "Action owner" before
// "Further action", "Who might be harmed" before a generic "risk", "Risk
// (L×S)" as the score rather than the hazard, and so on.
const ROLE_RULES: [Role, RegExp][] = [
  ['index', /^(#|no\.?|ref\.?|item|number)$/],
  ['residual', /residual/],
  ['likelihood', /^l\b|likelihood|probability/],
  ['severity', /^s\b|severity|impact|consequence/],
  ['score', /score|l\s*[x×*]\s*s|rating|^risk\s*(level)?\s*(\(.*\))?$/],
  ['owner', /owner|responsib|by whom|action by/],
  ['target', /target|by when|due|complet|deadline/],
  ['who', /who|harmed|affected|persons/],
  ['review', /review/],
  ['controls', /existing|control|precaution|in place|current measures/],
  ['further', /further|additional|action|recommend/],
  ['hazard', /hazard|risk|activity|issue|task|area/],
];

function headerRoles(row: string[][]): (Role | null)[] {
  const taken = new Set<Role>();
  return row.map((cell) => {
    const text = cell.join(' ').toLowerCase().trim();
    for (const [role, re] of ROLE_RULES) {
      if (!taken.has(role) && re.test(text)) {
        taken.add(role);
        return role;
      }
    }
    return null;
  });
}

function isHeaderRow(roles: (Role | null)[]): boolean {
  return roles.includes('hazard') && roles.filter((r) => r && r !== 'index').length >= 3;
}

export function parseRiskAssessmentHtml(html: string, fileName?: string): ImportedRiskAssessmentDraft {
  const blocks = readBlocks(html);
  const warnings: string[] = [];
  const risks: ImportedRiskDraft[] = [];
  const meta: Record<string, string> = {};
  const intro: string[] = [];
  let title: string | undefined;
  let seenRiskTable = false;
  let lastRoles: (Role | null)[] | null = null;
  let missingRatings = 0;

  // "Label: value" lines, whether a paragraph or a two-cell table row.
  const takeMeta = (label: string, value: string): boolean => {
    const l = label.toLowerCase();
    const key = /assessed by|assessor|completed by|carried out by/.test(l)
      ? 'assessedBy'
      : /next review|review date|date of (next )?review|review due/.test(l)
        ? 'nextReview'
        : /date assessed|assessment date|date of assessment|^date$/.test(l)
          ? 'assessed'
          : /review frequency|review period|frequency/.test(l)
            ? 'frequency'
            : /regulation|legislation|legal ref|^reference$/.test(l)
              ? 'regulation'
              : /^scope$/.test(l)
                ? 'scope'
                : /^(title|assessment( name)?|name)$/.test(l)
                  ? 'title'
                  : null;
    if (!key || meta[key] !== undefined) return false;
    meta[key] = value.trim();
    if (key === 'nextReview') meta.nextReviewLabel = label;
    return true;
  };

  for (const block of blocks) {
    if (block.kind === 'text') {
      const kv = block.text.match(/^([^:]{2,80}):\s*(.*)$/);
      if (kv && takeMeta(kv[1], kv[2])) continue;
      const isHeading = /^h[1-6]$/.test(block.tag);
      // The first heading, or line saying "risk assessment", is the title --
      // which skips a letterhead line (the business name) above it.
      if (!title && (isHeading || /risk assessment/i.test(block.text))) {
        title = block.text;
        continue;
      }
      if (title && !seenRiskTable && !isHeading) intro.push(block.text);
      continue;
    }

    let roles: (Role | null)[] | null = null;
    let start = 0;
    const headerAt = block.rows.findIndex((r) => isHeaderRow(headerRoles(r)));
    if (headerAt >= 0) {
      roles = headerRoles(block.rows[headerAt]);
      start = headerAt + 1;
    } else if (lastRoles && block.rows[0]?.length === lastRoles.length) {
      // A table carried on after a page break without repeating its header.
      roles = lastRoles;
    }

    if (!roles) {
      for (const r of block.rows) {
        if (r.length === 2) takeMeta(r[0].join(' ').replace(/:$/, ''), r[1].join(' '));
      }
      continue;
    }
    seenRiskTable = true;
    lastRoles = roles;

    for (const r of block.rows.slice(start)) {
      const get = (role: Role): string[] => {
        const i = roles!.indexOf(role);
        return i >= 0 && r[i] ? r[i] : [];
      };
      const text = (role: Role) => get(role).join(' ').trim();
      const hazard = text('hazard');
      if (!hazard) continue;
      // Repeated header row, or a section-label row that only fills the first cell.
      if (isHeaderRow(headerRoles(r))) continue;
      if (r.filter((c) => c.join('').trim()).length <= 1 && r.length > 2) continue;

      const likelihood = parseRating(text('likelihood'));
      const severity = parseRating(text('severity'));
      if (likelihood === null || severity === null) missingRatings++;
      const residualRisk =
        parseLevel(text('residual')) ??
        parseLevel(text('score')) ??
        (likelihood !== null && severity !== null ? bandForScore(likelihood * severity) : 'medium');

      const furtherActions = splitItems(get('further'));
      const owner = text('owner');
      const target = text('target');
      if (owner || target) {
        // RiskItem has no owner/target fields of its own, so they're kept as
        // a final further-action line rather than dropped.
        furtherActions.push(
          owner && target
            ? `Action owner: ${owner} (target: ${target})`
            : owner
              ? `Action owner: ${owner}`
              : `Target: ${target}`,
        );
      }

      risks.push({
        hazard,
        whoAtRisk: text('who') || undefined,
        existingControls: splitItems(get('controls')),
        furtherActions,
        likelihood,
        severity,
        residualRisk,
        reviewPeriod: parseFrequency(text('review')),
      });
    }
  }

  // --- header fields ---
  const fromFile = fileName
    ?.replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .trim();
  const rawName = meta.title || title || fromFile || 'Imported Risk Assessment';
  const name =
    rawName
      .replace(/^\s*(RA\s*-?\s*)?\d+\s*[.:)\-–]?\s+/i, '')
      .replace(/\s*[-–:]\s*(pawfect pets.*)$/i, '')
      .trim() || rawName;

  const assessmentDate = meta.assessed ? parseLooseDate(meta.assessed) : undefined;
  const nextReviewDate = meta.nextReview ? parseLooseDate(meta.nextReview) : undefined;
  const reviewFrequency =
    (meta.frequency && parseFrequency(meta.frequency)) ||
    (meta.nextReview && parseFrequency(meta.nextReview)) ||
    frequencyFromDates(assessmentDate, nextReviewDate) ||
    (meta.nextReviewLabel && parseFrequency(meta.nextReviewLabel)) ||
    undefined;

  for (const risk of risks) {
    if (!risk.reviewPeriod && reviewFrequency) risk.reviewPeriod = reviewFrequency;
  }

  if (risks.length === 0) {
    warnings.push(
      "No hazards table was found -- the document needs a table with a header row naming columns like Hazard, Who might be harmed, Existing controls, L and S.",
    );
  }
  if (missingRatings > 0) {
    warnings.push(
      `${missingRatings} risk${missingRatings === 1 ? " doesn't" : "s don't"} have a readable likelihood/severity (1-5) -- set ${missingRatings === 1 ? 'it' : 'them'} below before importing.`,
    );
  }
  if (meta.assessed && !assessmentDate) warnings.push(`Couldn't read the assessment date "${meta.assessed}".`);
  if (meta.nextReview && !nextReviewDate) warnings.push(`Couldn't read the next review date "${meta.nextReview}".`);

  return {
    name,
    regulationReference: meta.regulation || undefined,
    reviewFrequency,
    scope: meta.scope || intro.join(' ') || undefined,
    assessmentDate,
    nextReviewDate,
    assessedBy: meta.assessedBy || undefined,
    risks,
    warnings,
  };
}
