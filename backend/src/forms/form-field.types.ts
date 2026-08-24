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

export type FileFormField = FormFieldBase & {
  type: 'file';
  maxFiles?: number;
};

export type ChoiceFormField = FormFieldBase & {
  type: 'choice' | 'multichoice';
  options: string[];
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
  SimpleFormField | FileFormField | ChoiceFormField | GroupFormField;
