import { ChoiceGroup, MultiChoiceField, TextField, ToggleField } from './fields';
import PhotoUpload from '../intake/PhotoUpload';
import SignaturePad from '../intake/SignaturePad';
import type { FormField } from '../types';

interface Props {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
}

// Renders one non-group field for the current answer value -- used both for
// a form's top-level fields and, recursively via RepeatableGroup, for each
// field inside one repetition of a "group" (Pet, etc.).
export default function FieldRenderer({ field, value, onChange }: Props) {
  switch (field.type) {
    case 'display':
      return <p style={{ whiteSpace: 'pre-wrap' }}>{field.label}</p>;
    case 'text':
      return (
        <TextField label={field.label} value={(value as string) ?? ''} onChange={onChange} required={field.required} />
      );
    case 'textarea':
      return (
        <TextField
          label={field.label}
          value={(value as string) ?? ''}
          onChange={onChange}
          required={field.required}
          multiline
        />
      );
    case 'number':
      return (
        <TextField
          label={field.label}
          type="number"
          value={value !== undefined && value !== null ? String(value) : ''}
          onChange={onChange}
          required={field.required}
        />
      );
    case 'date':
      return (
        <TextField
          label={field.label}
          type="date"
          value={(value as string) ?? ''}
          onChange={onChange}
          required={field.required}
        />
      );
    case 'toggle':
      return <ToggleField label={field.label} value={!!value} onChange={onChange} />;
    case 'choice':
      return (
        <ChoiceGroup
          label={field.label}
          value={(value as string) ?? ''}
          options={field.options.map((o) => ({ value: o, label: o }))}
          onChange={onChange}
          required={field.required}
        />
      );
    case 'multichoice':
      return (
        <MultiChoiceField
          label={field.label}
          value={Array.isArray(value) ? (value as string[]) : []}
          options={field.options}
          onChange={onChange}
          required={field.required}
        />
      );
    case 'file':
      return <PhotoUpload value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
    case 'signature':
      return (
        <div className="field">
          <label>
            {field.label} {field.required && <span className="required">*</span>}
          </label>
          <SignaturePad value={value as string | undefined} onChange={onChange} />
        </div>
      );
    default:
      return null;
  }
}
