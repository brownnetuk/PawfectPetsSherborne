import type { FormField } from '../types';

// A toggle always renders as a definite on/off switch (never a genuine
// "unanswered" state), so its answer must start as a real `false` rather
// than `undefined` -- otherwise a toggle the customer never touches submits
// as missing entirely, even though the switch visibly shows "off". Same bug
// shape as the one fixed earlier for the real intake wizard's own Vaccinated
// toggle (frontend/src/intake/types.ts's PetDetails.vaccinated).
export function defaultAnswersFor(fields: FormField[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === 'toggle') defaults[field.id] = false;
  }
  return defaults;
}
