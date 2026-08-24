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

// Only ever set from a sibling 'toggle' or 'choice' field's id (enforced by
// the builder UI, not by this type) -- `equals` is always compared as a
// string (String(answers[fieldId]) === equals), which is why a toggle's
// condition value is the literal string 'true'/'false' rather than a real
// boolean. Scoped to the same level as the field it's on: a top-level
// field can only depend on another top-level field, and a field inside a
// repeatable group can only depend on another field in that same group
// (never a top-level field, never a different group) -- see
// form-submission-mapping.util.ts/FormFillPage.tsx for where this is read.
export interface VisibilityCondition {
  fieldId: string;
  equals: string;
}

export interface FormFieldBase {
  id: string;
  label: string;
  required: boolean;
  mapping?: FieldMapping;
  visibleWhen?: VisibilityCondition;
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

// Repeatable group -- nested fields map only to target: 'animal'; each
// repetition the customer fills in creates one Animal record.
export type GroupFormField = FormFieldBase & {
  type: 'group';
  repeatable: true;
  minRepeats: number;
  maxRepeats?: number;
  fields: FormField[];
};

export type FormField =
  SimpleFormField | FileFormField | ChoiceFormField | GroupFormField;
