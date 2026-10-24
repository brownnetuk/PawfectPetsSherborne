import type { FormField } from '../types';

// Ported from frontend/src/forms/formDefaults.ts (the customer-facing form
// engine) -- pure functions, no UI dependency, so this is a straight copy
// used by the new staff-facing FormFillModal (check-in/check-out) too.
export function defaultAnswersFor(fields: FormField[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  const now = new Date();
  for (const field of fields) {
    if (field.type === 'toggle') defaults[field.id] = false;
    if (field.type === 'today') defaults[field.id] = now.toISOString().slice(0, 10);
    if (field.type === 'datetime') defaults[field.id] = now.toISOString();
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

export function isFieldVisible(field: FormField, scopeAnswers: Record<string, unknown>): boolean {
  const rule = field.visibleWhen;
  if (!rule || rule.conditions.length === 0) return true;
  const results = rule.conditions.map((c) => String(scopeAnswers[c.fieldId]) === c.equals);
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
