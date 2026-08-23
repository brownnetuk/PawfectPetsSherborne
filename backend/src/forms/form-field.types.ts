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

export interface FormFieldBase {
  id: string;
  label: string;
  required: boolean;
  mapping?: FieldMapping;
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
