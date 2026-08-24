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

// Renders `minRepeats`+ blocks of a group inline on the page (not one per
// wizard step, unlike IntakeForm.tsx's per-pet steps -- this is a single,
// scrollable page) with "+ Add another"/"Remove" controls, closer in spirit
// to MedicationEntriesField.tsx's inline-repeatable-blocks pattern.
//
// Deliberately reports one-field-at-a-time changes up to FormFillPage rather
// than computing "the next array" here from the `value` prop: two clicks in
// different fields of the same repetition within one React batch would both
// read the same (still-stale) `value` prop and each build a next-array from
// it, so the second call's result would silently discard the first's change.
// FormFillPage resolves each change against the actual previous state via a
// functional setState update, which is race-free regardless of batching.
export default function RepeatableGroup({ field, value, onFieldChange, onAdd, onRemove }: Props) {
  const canRemove = value.length > field.minRepeats;
  const canAdd = field.maxRepeats === undefined || value.length < field.maxRepeats;

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
      <h2 style={{ fontSize: '1.15rem' }}>{field.label}</h2>
      {value.map((repetition, index) => (
        <div key={index} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <strong style={{ fontSize: '0.9rem' }}>
              {field.label} {index + 1}
            </strong>
            {canRemove && (
              <button type="button" className="btn-link" onClick={() => onRemove(index)}>
                Remove
              </button>
            )}
          </div>
          {field.fields.filter((child) => isFieldVisible(child, repetition)).map((child) => (
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
