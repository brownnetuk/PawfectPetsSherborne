// The shape of Form.fields (backend/src/forms/schemas/form.schema.ts) --
// stored as a loosely-validated Mixed array (like BusinessInfo.invoicePdfTemplate),
// but unlike that field, this one *is* interpreted server-side by
// form-submissions (see form-submission-mapping.util.ts), so real TS types
// live here rather than treating it as opaque JSON.

export type FieldTarget = 'customer' | 'animal';

export interface FieldMapping {
  target: FieldTarget;
  // Dot-path into the corresponding Create*Dto shape, e.g. 'firstName',
  // 'emergencyContact.phoneNumber', 'allergies.status'.
  path: string;
}

// `fieldId` only ever points at a sibling 'toggle' or 'choice' field
// (enforced by the builder UI, not by this type) -- `equals` is always
// compared as a string (String(answers[fieldId]) === equals), which is why
// a toggle's condition value is the literal string 'true'/'false' rather
// than a real boolean. Scoped to the same level as the field it's on: a
// top-level field can only depend on another top-level field, and a field
// inside a repeatable group can only depend on another field in that same
// group (never a top-level field, never a different group) -- see
// isFieldVisible (frontend/src/forms/formDefaults.ts) for where this is read.
export interface VisibilityCondition {
  fieldId: string;
  equals: string;
}

// A field is visible when its conditions are satisfied per `mode`: 'all'
// (every condition must match -- AND) or 'any' (at least one must match --
// OR). `mode` is meaningless with a single condition but always present so
// the shape is uniform. An empty `conditions` array behaves the same as no
// visibleWhen at all (always visible) -- FormBuilder.tsx clears visibleWhen
// entirely rather than ever leaving one with zero conditions, but readers
// (isFieldVisible) treat both the same defensively.
export interface VisibilityRule {
  mode: 'all' | 'any';
  conditions: VisibilityCondition[];
}

export interface FormFieldBase {
  id: string;
  label: string;
  required: boolean;
  mapping?: FieldMapping;
  visibleWhen?: VisibilityRule;
}

export type SimpleFormField = FormFieldBase & {
  type: 'text' | 'textarea' | 'number' | 'date' | 'toggle' | 'signature';
};

// Auto-filled, non-editable -- the answer is the date (or date+time) at the
// moment the customer opens the form, set client-side once when it loads
// (never later, so it can't drift while they're still filling it in) rather
// than typed in. Never required (there's nothing for the customer to leave
// blank).
export type AutoDateFormField = FormFieldBase & {
  type: 'today' | 'datetime';
};

// Read-only, non-interactive block of staff-authored text (instructions,
// context, etc.) -- `label` holds the displayed text itself. Never mapped,
// never required, never contributes an answer.
export type DisplayFormField = FormFieldBase & {
  type: 'display';
};

export type FileFormField = FormFieldBase & {
  type: 'file';
  maxFiles?: number;
};

// `optionsSource` defaults to 'static' (the plain, staff-authored `options`
// list) when absent. 'customerPets' instead resolves `options` at
// findOnePublic() time to the recipient's own pet names (see
// form-placeholders.util.ts) -- only meaningful when the FormSubmission is
// tied to a known customer (SendFormModal already captures one whenever
// staff pick an existing customer); `options` itself is still stored (as a
// fallback/placeholder in the builder) but ignored on the wire once a
// customer's real pets are available.
export type ChoiceFormField = FormFieldBase & {
  type: 'choice' | 'multichoice';
  options: string[];
  optionsSource?: 'static' | 'customerPets';
};

// Repeatable group -- nested fields map only to target: 'animal'. When
// `createsAnimal` is true, each repetition the customer fills in creates one
// Animal record (validated against the full CreateAnimalDto -- see
// form-submissions.service.ts). Defaults to true when absent so pre-existing
// groups saved before this flag existed (namely the seeded "Customer
// Intake" form's own Pet group) keep behaving exactly as before; the
// builder explicitly writes `false` on every newly-created group instead,
// since most ad-hoc forms just want a repeatable section of free-form
// answers captured on the submission, not a full new pet record.
export type GroupFormField = FormFieldBase & {
  type: 'group';
  repeatable: true;
  minRepeats: number;
  maxRepeats?: number;
  createsAnimal?: boolean;
  fields: FormField[];
};

export type FormField =
  SimpleFormField | FileFormField | ChoiceFormField | GroupFormField | DisplayFormField | AutoDateFormField;
