import { FormField } from '../forms/form-field.types';

// Reads/writes a dot-path into a plain object, with one deliberately narrow
// extra capability: a single trailing `[N]` index per segment (e.g.
// 'medication.medications[0].name'). This isn't a generic nested-repeat
// feature -- the form builder has no UI for a repeatable group nested inside
// another repeatable group -- it exists solely so the seeded "Customer
// Intake" form can capture Animal.medication.medications (a required,
// array-shaped field on CreateAnimalDto) as a handful of ordinary fields
// inside the Pet group, rather than needing a second level of repetition.
const ARRAY_SEGMENT = /^(\w+)\[(\d+)\]$/;

export function setPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = path.split('.');
  let cursor: Record<string, unknown> = target;
  segments.forEach((segment, i) => {
    const isLast = i === segments.length - 1;
    const match = segment.match(ARRAY_SEGMENT);
    if (match) {
      const [, key, indexStr] = match;
      const index = Number(indexStr);
      if (!Array.isArray(cursor[key])) cursor[key] = [];
      const arr = cursor[key] as unknown[];
      if (typeof arr[index] !== 'object' || arr[index] === null) {
        arr[index] = {};
      }
      if (isLast) {
        arr[index] = value;
      } else {
        cursor = arr[index] as Record<string, unknown>;
      }
    } else if (isLast) {
      cursor[segment] = value;
    } else {
      if (typeof cursor[segment] !== 'object' || cursor[segment] === null) {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }
  });
}

function coerceFieldValue(field: FormField, raw: unknown): unknown {
  if (raw === undefined || raw === null || raw === '') return undefined;
  switch (field.type) {
    case 'number':
      return Number(raw);
    case 'toggle':
      return Boolean(raw);
    case 'file':
      return Array.isArray(raw) ? raw : [raw];
    default:
      return raw;
  }
}

/** Builds a CreateCustomerDto/UpdateCustomerDto-shaped patch from a form's top-level (non-group) fields. */
export function buildCustomerPatch(
  fields: FormField[],
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.type === 'group') continue;
    if (!field.mapping || field.mapping.target !== 'customer') continue;
    const value = coerceFieldValue(field, answers[field.id]);
    if (value === undefined) continue;
    setPath(patch, field.mapping.path, value);
  }
  return patch;
}

// Mirrors frontend/src/api/client.ts's animalPayload() exactly -- the real
// intake wizard already has to strip these per species client-side (its UI
// simply never shows them for the inapplicable species); the generic Forms
// builder has no conditional visibility, so every pet-group repetition
// answers all of these regardless of species, and this strips the ones
// AnimalsService.create()'s validateSpeciesFields() would otherwise reject.
function stripSpeciesInapplicableFields(patch: Record<string, unknown>): void {
  const species = patch.species;
  if (species === 'cat') {
    delete patch.aggressionToOtherAnimals;
    delete patch.aggressionToOtherAnimalsDetails;
    delete patch.travelsWellInCar;
    delete patch.chasesLivestock;
    delete patch.chasesLivestockDetails;
  }
  if (species === 'other') {
    delete patch.chasesLivestock;
    delete patch.chasesLivestockDetails;
  }
  if (species !== 'dog') {
    delete patch.offLeadConsent;
  }
}

// A toggle field always answers as a real `false` once touched-or-defaulted
// (see frontend/src/forms/formDefaults.ts), including the two toggles that
// happen to map onto medication.medications[0].vetPrescribed/administeredBy
// PawfectPets (the fixed-index-array escape hatch documented at the top of
// this file). That means those two toggles alone are enough to make
// medications[0] exist even when the customer never touched the medication
// section at all -- an entry with neither toggle touched by intent nor a
// name is meaningless, and Animal.medication.medications[].name is a
// required schema field (not just a DTO decorator, so an incomplete entry
// here would otherwise reach Mongoose's own validation and 500 rather than
// failing cleanly). Treat "no name" as "no real entry" and drop it.
function dropIncompleteMedicationEntry(patch: Record<string, unknown>): void {
  const medication = patch.medication as
    { medications?: unknown[] } | undefined;
  if (!medication?.medications?.length) return;
  const first = medication.medications[0] as
    Record<string, unknown> | undefined;
  if (!first?.name) {
    medication.medications = [];
  }
}

/** Builds a CreateAnimalDto-shaped patch from one repetition of a form's "group" fields. */
export function buildAnimalPatch(
  groupFields: FormField[],
  repetitionAnswers: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const field of groupFields) {
    if (field.type === 'group') continue; // no nested groups -- see setPath's comment above
    if (!field.mapping || field.mapping.target !== 'animal') continue;
    const value = coerceFieldValue(field, repetitionAnswers[field.id]);
    if (value === undefined) continue;
    setPath(patch, field.mapping.path, value);
  }
  stripSpeciesInapplicableFields(patch);
  dropIncompleteMedicationEntry(patch);
  return patch;
}

// Mirrors AnimalsService.validateOffLeadConsent(dto, requireForDogs=true) --
// unlike validateSpeciesFields (a "reject if present" rule, already handled
// by stripping above), this is a "reject if absent" rule, so it can't be
// satisfied just by omitting fields. It's not expressed as a class-validator
// decorator on CreateAnimalDto (checked directly in AnimalsService instead),
// so form-submissions.service.ts's up-front validate() pass would otherwise
// miss it entirely and only discover the problem when AnimalsService.create()
// itself throws -- by which point the customer has already been written.
// Checking it here lets the caller raise it before any DB write happens.
export function validateAnimalBusinessRules(
  patch: Record<string, unknown>,
): string | null {
  if (patch.species === 'dog' && !patch.offLeadConsent) {
    return 'Off-lead consent (on lead / off lead) is required for dogs.';
  }
  return null;
}
