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
    // Already {{token}}-resolved server-side (form-placeholders.util.ts) by
    // the time it reaches this app -- seeds the initial answer, still
    // freely editable, same as a toggle/today/datetime default above.
    if (
      (field.type === 'text' || field.type === 'textarea' || field.type === 'number' || field.type === 'date') &&
      field.defaultValue
    ) {
      // {{today}} on a date field starts it as today's (local) date -- still
      // editable, unlike a 'today' field. Never resolved server-side.
      defaults[field.id] =
        field.type === 'date' && field.defaultValue.trim() === '{{today}}'
          ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
          : field.defaultValue;
    }
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

// The pre-check-in form's per-pet pages keep {{petName}} as literal text
// (see backend's groupPlaceholders) so each page can show its OWN pet's
// name -- `name` is that repetition's repetitionLabels entry. Falls back to
// PET_NAME_FALLBACK when there's no name for the page (an older submission
// or a group without fixed labels), so the raw placeholder never shows.
export const PET_NAME_FALLBACK = 'your dog';

export function withPetName<T extends { label: string }>(fields: T[], name: string | undefined): T[] {
  const resolved = name?.trim() || PET_NAME_FALLBACK;
  return fields.map((f) => (f.label.includes('{{petName}}') ? { ...f, label: f.label.split('{{petName}}').join(resolved) } : f));
}
