import FieldRenderer from './FieldRenderer';
import { isFieldVisible } from './formDefaults';
import type { GroupFormField } from '../types';

interface Props {
  field: GroupFormField;
  value: Record<string, unknown>[];
  onFieldChange: (index: number, fieldId: string, value: unknown) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

// Direct port of frontend/src/forms/RepeatableGroup.tsx -- no CSS class
// dependencies beyond .btn-link, which admin already has.
export default function RepeatableGroup({ field, value, onFieldChange, onAdd, onRemove }: Props) {
  const canRemove = value.length > field.minRepeats;
  const canAdd = field.maxRepeats === undefined || value.length < field.maxRepeats;
  const hasFixedLabels = !!field.repetitionLabels;

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      {!hasFixedLabels && <h3 style={{ fontSize: '1rem' }}>{field.label}</h3>}
      {value.map((repetition, index) => (
        <div key={index} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <strong style={{ fontSize: '0.9rem' }}>
              {field.repetitionLabels?.[index] ?? `${field.label} ${index + 1}`}
            </strong>
            {canRemove && (
              <button type="button" className="btn-link" onClick={() => onRemove(index)}>
                Remove
              </button>
            )}
          </div>
          {field.fields
            .filter((child) => isFieldVisible(child, repetition))
            .map((child) => (
              <FieldRenderer
                key={child.id}
                field={child}
                value={repetition[child.id]}
                onChange={(v) => onFieldChange(index, child.id, v)}
              />
            ))}
        </div>
      ))}
      {canAdd && (
        <button type="button" className="btn-link" onClick={onAdd}>
          + Add another {field.label}
        </button>
      )}
    </div>
  );
}
