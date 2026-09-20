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
