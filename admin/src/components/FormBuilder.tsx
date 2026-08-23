import { useState } from 'react';
import * as api from '../api/client';
import type {
  ChoiceFormField,
  FieldTarget,
  FileFormField,
  FormField,
  FormRecord,
  GroupFormField,
} from '../types';
import { mappingTargetsFor } from '../utils/formFieldCatalog';
import { PencilIcon, PlusIcon, TrashIcon } from './icons';

const SIMPLE_TYPES: { type: FormField['type']; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'textarea', label: 'Long text' },
  { type: 'number', label: 'Number' },
  { type: 'date', label: 'Date' },
  { type: 'toggle', label: 'Yes / No' },
  { type: 'choice', label: 'Choice' },
  { type: 'multichoice', label: 'Multiple choice' },
  { type: 'file', label: 'File / photo' },
  { type: 'signature', label: 'Signature' },
];

function genId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function newField(type: FormField['type']): FormField {
  const base = { id: genId(type), label: 'New field', required: false };
  switch (type) {
    case 'choice':
    case 'multichoice':
      return { ...base, type, options: ['Option 1', 'Option 2'] } as ChoiceFormField;
    case 'file':
      return { ...base, type: 'file', maxFiles: 2 } as FileFormField;
    case 'group':
      return { ...base, type: 'group', repeatable: true, minRepeats: 1, fields: [] } as GroupFormField;
    default:
      return { ...base, type } as FormField;
  }
}

const REQUIRED_CUSTOMER_PATHS = ['email', 'firstName', 'address1', 'town', 'postcode', 'phoneNumber'];

interface Props {
  form: FormRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function FormBuilder({ form, onClose, onSaved }: Props) {
  const [name, setName] = useState(form?.name ?? '');
  const [description, setDescription] = useState(form?.description ?? '');
  const [fields, setFields] = useState<FormField[]>(form?.fields ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateFieldById(id: string, updater: (f: FormField) => FormField) {
    setFields((prev) =>
      prev.map((f) => {
        if (f.id === id) return updater(f);
        if (f.type === 'group') {
          return { ...f, fields: f.fields.map((c) => (c.id === id ? updater(c) : c)) };
        }
        return f;
      }),
    );
  }

  function removeFieldById(id: string) {
    setFields((prev) =>
      prev
        .filter((f) => f.id !== id)
        .map((f) => (f.type === 'group' ? { ...f, fields: f.fields.filter((c) => c.id !== id) } : f)),
    );
    if (selectedId === id) setSelectedId(null);
  }

  function moveFieldById(id: string, dir: -1 | 1) {
    setFields((prev) => {
      const topIndex = prev.findIndex((f) => f.id === id);
      if (topIndex !== -1) {
        const swapWith = topIndex + dir;
        if (swapWith < 0 || swapWith >= prev.length) return prev;
        const next = [...prev];
        [next[topIndex], next[swapWith]] = [next[swapWith], next[topIndex]];
        return next;
      }
      return prev.map((f) => {
        if (f.type !== 'group') return f;
        const idx = f.fields.findIndex((c) => c.id === id);
        if (idx === -1) return f;
        const swapWith = idx + dir;
        if (swapWith < 0 || swapWith >= f.fields.length) return f;
        const nextChildren = [...f.fields];
        [nextChildren[idx], nextChildren[swapWith]] = [nextChildren[swapWith], nextChildren[idx]];
        return { ...f, fields: nextChildren };
      });
    });
  }

  function addField(type: FormField['type'], parentGroupId: string | null) {
    const field = newField(type);
    if (parentGroupId) {
      setFields((prev) =>
        prev.map((f) => (f.id === parentGroupId && f.type === 'group' ? { ...f, fields: [...f.fields, field] } : f)),
      );
    } else {
      setFields((prev) => [...prev, field]);
    }
    setSelectedId(field.id);
  }

  const mappedCustomerPaths = new Set(
    fields.filter((f) => f.mapping?.target === 'customer').map((f) => f.mapping!.path),
  );
  const hasAnyCustomerMapping = mappedCustomerPaths.size > 0;
  const missingRequired = REQUIRED_CUSTOMER_PATHS.filter((p) => !mappedCustomerPaths.has(p));
  const hasVetMapping = [...mappedCustomerPaths].some((p) => p.startsWith('emergencyVet.'));
  const showMappingWarning =
    hasAnyCustomerMapping && (missingRequired.length > 0 || !hasVetMapping);

  async function handleSave() {
    if (!name.trim()) {
      setError('Give this form a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = { name, description: description || undefined, fields };
      if (form) {
        await api.updateForm(form._id, input);
      } else {
        await api.createForm(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save this form');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>{form ? 'Edit form' : 'New form'}</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            Add fields, optionally map each one to a real customer/pet record field, then save.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>
            Back to list
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save form'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {showMappingWarning && (
        <div
          style={{
            background: 'var(--warn-light)',
            color: 'var(--warn)',
            padding: '10px 14px',
            borderRadius: 8,
            marginTop: 10,
            fontSize: '0.85rem',
          }}
        >
          This form maps some fields to the customer record, but is missing a mapping for one or
          more usually-required fields ({missingRequired.length > 0 ? missingRequired.join(', ') : 'emergency vet details'}).
          A submission that's meant to create a brand-new customer will fail unless enough fields
          are mapped — this is just a heads-up, not a block on saving.
        </div>
      )}

      <div className="field" style={{ marginTop: 16 }}>
        <label>Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
        {fields.map((field, index) => (
          <FieldRow
            key={field.id}
            field={field}
            index={index}
            total={fields.length}
            parentGroupId={null}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onUpdate={updateFieldById}
            onRemove={removeFieldById}
            onMove={moveFieldById}
            onAddField={addField}
          />
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {SIMPLE_TYPES.map((t) => (
          <button key={t.type} type="button" className="btn btn-secondary btn-sm" onClick={() => addField(t.type, null)}>
            <PlusIcon /> {t.label}
          </button>
        ))}
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => addField('group', null)}>
          <PlusIcon /> Repeatable group (e.g. pets)
        </button>
      </div>
    </div>
  );
}

interface RowProps {
  field: FormField;
  index: number;
  total: number;
  parentGroupId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, updater: (f: FormField) => FormField) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onAddField: (type: FormField['type'], parentGroupId: string | null) => void;
}

function typeLabel(type: FormField['type']): string {
  return SIMPLE_TYPES.find((t) => t.type === type)?.label ?? (type === 'group' ? 'Repeatable group' : type);
}

function FieldRow({ field, index, total, parentGroupId, selectedId, onSelect, onUpdate, onRemove, onMove, onAddField }: RowProps) {
  const isSelected = selectedId === field.id;
  const target: FieldTarget = parentGroupId ? 'animal' : 'customer';

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong>{field.label || '(untitled field)'}</strong>
          <span className="badge" style={{ background: 'var(--sage-badge)', color: 'var(--brand-green)' }}>
            {typeLabel(field.type)}
          </span>
          {field.required && (
            <span className="badge" style={{ background: 'var(--accent-light)', color: 'var(--accent-dark)' }}>
              Required
            </span>
          )}
          {field.type !== 'group' && field.mapping && (
            <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>→ {field.mapping.path}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className="icon-btn" title="Move up" disabled={index === 0} onClick={() => onMove(field.id, -1)}>
            ↑
          </button>
          <button type="button" className="icon-btn" title="Move down" disabled={index === total - 1} onClick={() => onMove(field.id, 1)}>
            ↓
          </button>
          <button type="button" className="icon-btn" title="Edit" onClick={() => onSelect(isSelected ? null : field.id)}>
            <PencilIcon />
          </button>
          <button type="button" className="icon-btn icon-btn-danger" title="Delete" onClick={() => onRemove(field.id)}>
            <TrashIcon />
          </button>
        </div>
      </div>

      {isSelected && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div className="field">
            <label>Label</label>
            <input
              type="text"
              value={field.label}
              onChange={(e) => onUpdate(field.id, (f) => ({ ...f, label: e.target.value }))}
            />
          </div>
          {field.type !== 'group' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onUpdate(field.id, (f) => ({ ...f, required: e.target.checked }))}
              />
              Required
            </label>
          )}

          {(field.type === 'choice' || field.type === 'multichoice') && (
            <OptionsEditor
              options={field.options}
              onChange={(options) => onUpdate(field.id, (f) => (f.type === 'choice' || f.type === 'multichoice' ? { ...f, options } : f))}
            />
          )}

          {field.type === 'file' && (
            <div className="field">
              <label>Max files</label>
              <input
                type="number"
                min={1}
                value={field.maxFiles ?? 2}
                onChange={(e) => onUpdate(field.id, (f) => (f.type === 'file' ? { ...f, maxFiles: Number(e.target.value) } : f))}
              />
            </div>
          )}

          {field.type === 'group' && (
            <div className="field-row">
              <div className="field">
                <label>Minimum repeats</label>
                <input
                  type="number"
                  min={0}
                  value={field.minRepeats}
                  onChange={(e) => onUpdate(field.id, (f) => (f.type === 'group' ? { ...f, minRepeats: Number(e.target.value) } : f))}
                />
              </div>
              <div className="field">
                <label>Maximum repeats (optional)</label>
                <input
                  type="number"
                  min={field.minRepeats}
                  value={field.maxRepeats ?? ''}
                  onChange={(e) =>
                    onUpdate(field.id, (f) =>
                      f.type === 'group' ? { ...f, maxRepeats: e.target.value ? Number(e.target.value) : undefined } : f,
                    )
                  }
                />
              </div>
            </div>
          )}

          {field.type !== 'group' && (
            <MappingPicker
              target={target}
              fieldType={field.type}
              value={field.mapping?.path}
              onChange={(path) =>
                onUpdate(field.id, (f) => ({ ...f, mapping: path ? { target, path } : undefined }))
              }
            />
          )}
        </div>
      )}

      {field.type === 'group' && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {field.fields.map((child, childIndex) => (
              <FieldRow
                key={child.id}
                field={child}
                index={childIndex}
                total={field.fields.length}
                parentGroupId={field.id}
                selectedId={selectedId}
                onSelect={onSelect}
                onUpdate={onUpdate}
                onRemove={onRemove}
                onMove={onMove}
                onAddField={onAddField}
              />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {SIMPLE_TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onAddField(t.type, field.id)}
              >
                <PlusIcon /> {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OptionsEditor({ options, onChange }: { options: string[]; onChange: (options: string[]) => void }) {
  return (
    <div className="field">
      <label>Options</label>
      {options.map((opt, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input
            type="text"
            value={opt}
            onChange={(e) => {
              const next = [...options];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            title="Remove option"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
      <button type="button" className="btn-link" onClick={() => onChange([...options, `Option ${options.length + 1}`])}>
        + Add option
      </button>
    </div>
  );
}

function MappingPicker({
  target,
  fieldType,
  value,
  onChange,
}: {
  target: FieldTarget;
  fieldType: FormField['type'];
  value?: string;
  onChange: (path: string) => void;
}) {
  const options = mappingTargetsFor(target, fieldType);
  return (
    <div className="field">
      <label>Map to {target === 'customer' ? 'customer' : 'pet'} field</label>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Don't map (extra info only)</option>
        {options.map((o) => (
          <option key={o.path} value={o.path}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
