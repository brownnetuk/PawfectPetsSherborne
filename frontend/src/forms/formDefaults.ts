import type { FormField } from '../types';

// A toggle always renders as a definite on/off switch (never a genuine
// "unanswered" state), so its answer must start as a real `false` rather
// than `undefined` -- otherwise a toggle the customer never touches submits
// as missing entirely, even though the switch visibly shows "off". Same bug
// shape as the one fixed earlier for the real intake wizard's own Vaccinated
// toggle (frontend/src/intake/types.ts's PetDetails.vaccinated).
// today/datetime fields are stamped once here, at the moment the form (or,
// for a field inside a repeatable group, that repetition) is opened/added --
// not updated again later, and not editable, so the answer can't drift while
// someone's still filling the rest of the form in.
export function defaultAnswersFor(fields: FormField[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  const now = new Date();
  for (const field of fields) {
    if (field.type === 'toggle') defaults[field.id] = false;
    if (field.type === 'today') defaults[field.id] = now.toISOString().slice(0, 10);
    if (field.type === 'datetime') defaults[field.id] = now.toISOString();
  }
  return defaults;
}

// `scopeAnswers` is the answers record at the same level as `field` --
// the form's top-level answers for a top-level field, or one repetition's
// answers for a field inside a repeatable group (never the other level,
// since a condition can only reference a sibling at the same level -- see
// VisibilityRule's doc comment in types.ts). Each condition is compared as
// a string so a toggle's real boolean answer lines up with its condition's
// 'true'/'false'; `mode` combines multiple conditions with AND ('all') or
// OR ('any').
export function isFieldVisible(field: FormField, scopeAnswers: Record<string, unknown>): boolean {
  const rule = field.visibleWhen;
  if (!rule || rule.conditions.length === 0) return true;
  const results = rule.conditions.map(
    (c) => String(scopeAnswers[c.fieldId]) === c.equals,
  );
  return rule.mode === 'any' ? results.some(Boolean) : results.every(Boolean);
}
