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
      defaults[field.id] = field.defaultValue;
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
// name -- `name` is that repetition's repetitionLabels entry. A no-op for
// any other group.
export function withPetName<T extends { label: string }>(fields: T[], name: string | undefined): T[] {
  if (!name) return fields;
  return fields.map((f) => (f.label.includes('{{petName}}') ? { ...f, label: f.label.split('{{petName}}').join(name) } : f));
}
