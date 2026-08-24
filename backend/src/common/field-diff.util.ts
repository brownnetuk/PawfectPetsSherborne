// Generic field-by-field "what changed" diffing, shared by
// customers/audit-diff.util.ts and animals/audit-diff.util.ts -- each of
// those owns its own list of {path, label} specs (and any field-specific
// formatting), this just does the walking/comparing/formatting plumbing.

export interface DiffFieldSpec {
  // Dot-path into both the incoming patch and the stored "before" document.
  path: string;
  label: string;
  // Defaults to defaultFormat below (Yes/No for booleans, '—' for empty,
  // String(...) otherwise) -- override for dates, enums, etc.
  format?: (v: unknown) => string;
}

export interface FieldChange {
  label: string;
  oldStr: string;
  newStr: string;
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    return (cur as Record<string, unknown>)[key];
  }, obj);
}

function defaultFormat(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

/**
 * Compares `patch` against `before` for each given field spec. A field
 * missing from `patch` entirely is skipped (it means "not part of this
 * update", not "cleared to empty") -- only fields the caller actually sent,
 * and that genuinely differ from what was stored, are returned.
 */
export function diffFields(
  patch: Record<string, unknown>,
  before: Record<string, unknown>,
  specs: DiffFieldSpec[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const spec of specs) {
    const newRaw = getPath(patch, spec.path);
    if (newRaw === undefined) continue;
    const oldRaw = getPath(before, spec.path);
    const format = spec.format ?? defaultFormat;
    const oldStr = format(oldRaw);
    const newStr = format(newRaw);
    if (oldStr === newStr) continue;
    changes.push({ label: spec.label, oldStr, newStr });
  }
  return changes;
}

export function formatDate(v: unknown): string {
  if (!v) return '—';
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
}

// For TriState ('yes'/'no'/'unsure') and other lowercase-enum fields whose
// stored value is already a fine display string once capitalised.
export function formatCapitalised(v: unknown): string {
  if (v === undefined || v === null || v === '') return '—';
  const s = String(v);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
