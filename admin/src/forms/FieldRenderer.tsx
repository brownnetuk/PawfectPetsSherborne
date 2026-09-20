import PhotoUpload from '../components/PhotoUpload';
import SignaturePad from '../components/SignaturePad';
import type { FormField } from '../types';

interface Props {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
}

// Admin's own take on frontend/src/forms/FieldRenderer.tsx -- same field
// types, but built on admin's existing `.field`/checkbox conventions instead
// of porting the intake app's bespoke choice-button/toggle-switch CSS, which
// admin doesn't have. Used by the new staff-facing FormFillModal
// (check-in/check-out) and, recursively via RepeatableGroup, inside a group.
export default function FieldRenderer({ field, value, onChange }: Props) {
  switch (field.type) {
    case 'display':
      return <p style={{ whiteSpace: 'pre-wrap' }}>{field.label}</p>;
    case 'today':
      return (
        <div className="field">
          <label>{field.label}</label>
          <input type="text" value={value ? new Date(value as string).toLocaleDateString('en-GB') : ''} disabled />
        </div>
      );
    case 'datetime':
      return (
        <div className="field">
          <label>{field.label}</label>
          <input type="text" value={value ? new Date(value as string).toLocaleString('en-GB') : ''} disabled />
        </div>
      );
    case 'text':
      return (
        <div className="field">
          <label>
            {field.label} {field.required && <span style={{ color: 'var(--error)' }}>*</span>}
          </label>
          <input type="text" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'textarea':
      return (
        <div className="field">
          <label>
            {field.label} {field.required && <span style={{ color: 'var(--error)' }}>*</span>}
          </label>
          <textarea value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'number':
      return (
        <div className="field">
          <label>
            {field.label} {field.required && <span style={{ color: 'var(--error)' }}>*</span>}
          </label>
          <input
            type="number"
            value={value !== undefined && value !== null ? String(value) : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case 'date':
      return (
        <div className="field">
          <label>
            {field.label} {field.required && <span style={{ color: 'var(--error)' }}>*</span>}
          </label>
          <input type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'toggle':
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      );
    case 'choice':
      return (
        <div className="field">
          <label>
            {field.label} {field.required && <span style={{ color: 'var(--error)' }}>*</span>}
          </label>
          <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
            <option value="" disabled>
              Select…
            </option>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      );
    case 'multichoice': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      function toggle(option: string) {
        onChange(selected.includes(option) ? selected.filter((v) => v !== option) : [...selected, option]);
      }
      return (
        <div className="field">
          <label>
            {field.label} {field.required && <span style={{ color: 'var(--error)' }}>*</span>}
          </label>
          {field.options.map((o) => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
              <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case 'file':
      return <PhotoUpload value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />;
    case 'signature':
      return (
        <div className="field">
          <label>
            {field.label} {field.required && <span style={{ color: 'var(--error)' }}>*</span>}
          </label>
          <SignaturePad value={value as string | undefined} onChange={onChange} />
        </div>
      );
    default:
      return null;
  }
}
