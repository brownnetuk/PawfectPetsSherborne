import { useRef, useState } from 'react';
import * as api from '../api/client';
import type {
  ChoiceFormField,
  FieldTarget,
  FileFormField,
  FormField,
  FormRecord,
  GroupFormField,
  VisibilityRule,
} from '../types';
import { mappingTargetsFor } from '../utils/formFieldCatalog';
import { FORM_PLACEHOLDERS } from '../utils/formPlaceholders';
import FormPreviewModal from './FormPreviewModal';
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
  { type: 'display', label: 'Free text' },
  { type: 'today', label: "Today's date" },
  { type: 'datetime', label: 'Date & time' },
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
    case 'display':
      return { ...base, type: 'display', label: 'Enter your text here…' } as FormField;
    case 'today':
      return { ...base, type: 'today', label: 'Date' } as FormField;
    case 'datetime':
      return { ...base, type: 'datetime', label: 'Date & time' } as FormField;
    case 'group':
      return {
        ...base,
        type: 'group',
        repeatable: true,
        minRepeats: 1,
        createsAnimal: false,
        fields: [],
      } as GroupFormField;
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
  const [showPreview, setShowPreview] = useState(false);

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
    // Drops any condition (in any other field's "only show if" rule) that
    // pointed at the field being removed, so nothing lingers referencing a
    // deleted field. Clears the whole rule if that was its last condition.
    const clearIfDangling = (f: FormField): FormField => {
      if (!f.visibleWhen) return f;
      const conditions = f.visibleWhen.conditions.filter((c) => c.fieldId !== id);
      if (conditions.length === f.visibleWhen.conditions.length) return f;
      return { ...f, visibleWhen: conditions.length ? { ...f.visibleWhen, conditions } : undefined };
    };
    setFields((prev) =>
      prev
        .filter((f) => f.id !== id)
        .map(clearIfDangling)
        .map((f) =>
          f.type === 'group'
            ? { ...f, fields: f.fields.filter((c) => c.id !== id).map(clearIfDangling) }
            : f,
        ),
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
          <button className="btn btn-secondary btn-sm" onClick={() => setShowPreview(true)} disabled={fields.length === 0}>
            Preview
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
            siblings={fields}
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

      {showPreview && (
        <FormPreviewModal name={name} description={description} fields={fields} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}

interface RowProps {
  field: FormField;
  index: number;
  total: number;
  siblings: FormField[];
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

function FieldRow({ field, index, total, siblings, parentGroupId, selectedId, onSelect, onUpdate, onRemove, onMove, onAddField }: RowProps) {
  const isSelected = selectedId === field.id;
  const target: FieldTarget = parentGroupId ? 'animal' : 'customer';
  const labelRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Splices a {{token}} into the label/free-text editor at its current
  // cursor position -- same shape as SettingsPage.tsx's plain-<textarea>
  // "Insert variable" handling for the email-template body, just against
  // whichever of the two label editors (input vs textarea) is showing.
  function insertPlaceholder(token: string) {
    const el = labelRef.current;
    const current = field.label;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    onUpdate(field.id, (f) => ({ ...f, label: next }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong>
            {field.type === 'display'
              ? (field.label || '(empty text)').slice(0, 60) + (field.label.length > 60 ? '…' : '')
              : field.label || '(untitled field)'}
          </strong>
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
          {field.visibleWhen && field.visibleWhen.conditions.length > 0 && (
            <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
              only if{' '}
              {field.visibleWhen.conditions
                .map((c) => {
                  const label = siblings.find((s) => s.id === c.fieldId)?.label || '?';
                  const val = c.equals === 'true' ? 'Yes' : c.equals === 'false' ? 'No' : c.equals;
                  return `"${label}" = ${val}`;
                })
                .join(field.visibleWhen.mode === 'any' ? ' OR ' : ' AND ')}
            </span>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <label>{field.type === 'display' ? 'Text' : 'Label'}</label>
              <select
                className="insert-var-select"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) insertPlaceholder(e.target.value);
                  e.target.value = '';
                }}
              >
                <option value="" disabled>
                  Insert placeholder…
                </option>
                {FORM_PLACEHOLDERS.map((p) => (
                  <option key={p.key} value={`{{${p.key}}}`}>
                    {`{{${p.key}}}`} — {p.hint}
                  </option>
                ))}
              </select>
            </div>
            {field.type === 'display' ? (
              <textarea
                ref={labelRef as React.RefObject<HTMLTextAreaElement>}
                rows={3}
                value={field.label}
                onChange={(e) => onUpdate(field.id, (f) => ({ ...f, label: e.target.value }))}
              />
            ) : (
              <input
                ref={labelRef as React.RefObject<HTMLInputElement>}
                type="text"
                value={field.label}
                onChange={(e) => onUpdate(field.id, (f) => ({ ...f, label: e.target.value }))}
              />
            )}
            <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
              Placeholders only fill in once this form is sent to a known customer -- they show as
              literal text otherwise.
            </div>
          </div>
          {field.type !== 'group' && field.type !== 'display' && field.type !== 'today' && field.type !== 'datetime' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onUpdate(field.id, (f) => ({ ...f, required: e.target.checked }))}
              />
              Required
            </label>
          )}
          {(field.type === 'today' || field.type === 'datetime') && (
            <p className="hint">
              Filled in automatically with {field.type === 'today' ? "today's date" : 'the date and time'} when the
              form is opened -- not editable by whoever fills the form in.
            </p>
          )}

          {(field.type === 'choice' || field.type === 'multichoice') && (
            <div className="field">
              <label>Options</label>
              <select
                value={field.optionsSource ?? 'static'}
                onChange={(e) => {
                  const source = e.target.value as 'static' | 'customerPets';
                  onUpdate(field.id, (f) =>
                    f.type === 'choice' || f.type === 'multichoice'
                      ? { ...f, optionsSource: source, mapping: source === 'customerPets' ? undefined : f.mapping }
                      : f,
                  );
                }}
                style={{ marginBottom: 10 }}
              >
                <option value="static">A fixed list I type in below</option>
                <option value="customerPets">The customer's own pets, automatically</option>
              </select>
            </div>
          )}

          {(field.type === 'choice' || field.type === 'multichoice') &&
            (field.optionsSource ?? 'static') === 'static' && (
              <OptionsEditor
                options={field.options}
                onChange={(options) => onUpdate(field.id, (f) => (f.type === 'choice' || f.type === 'multichoice' ? { ...f, options } : f))}
              />
            )}

          {(field.type === 'choice' || field.type === 'multichoice') && field.optionsSource === 'customerPets' && (
            <p className="hint">
              The options shown will be whichever customer this form is sent to's own pets, by
              name -- only resolved once it's sent to a known customer (empty otherwise). This
              answer is captured as extra info on the submission and can't be mapped to a
              customer/pet field below.
            </p>
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

          {field.type === 'group' && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={field.createsAnimal ?? false}
                onChange={(e) => onUpdate(field.id, (f) => (f.type === 'group' ? { ...f, createsAnimal: e.target.checked } : f))}
              />
              Each repetition creates a new pet record
            </label>
          )}

          {field.type === 'group' && !field.createsAnimal && (
            <p className="hint">
              This group's answers are saved with the submission but won't create a pet record -- any "Map to pet
              field" selections on its fields below are ignored.
            </p>
          )}

          {field.type !== 'group' && (
            <ConditionEditor
              field={field}
              siblings={siblings}
              index={index}
              onUpdate={(updater) => onUpdate(field.id, updater)}
            />
          )}

          {field.type !== 'group' &&
            field.type !== 'display' &&
            field.type !== 'today' &&
            field.type !== 'datetime' &&
            !((field.type === 'choice' || field.type === 'multichoice') && field.optionsSource === 'customerPets') && (
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
                siblings={field.fields}
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

// Only 'toggle'/'choice' siblings are eligible condition sources -- their
// answer is always a single, well-known value, unlike e.g. multichoice
// (multiple values) or text (unbounded). Restricted to siblings *before*
// this field (by builder order) so a condition always depends on something
// already answered, never a later field -- purely a builder-UI restriction
// (runtime lookup in isFieldVisible() doesn't care about order at all, so
// reordering fields afterward can't break an existing condition, it just
// won't be re-offered as a pick here until it's moved above again).
//
// Multiple conditions combine with AND ('all') or OR ('any') -- e.g. "Is
// your dog spayed/neutered = spayed" AND "Sex = female" both having to
// match before "Date of last season" shows.
function ConditionEditor({
  field,
  siblings,
  index,
  onUpdate,
}: {
  field: FormField;
  siblings: FormField[];
  index: number;
  onUpdate: (updater: (f: FormField) => FormField) => void;
}) {
  const eligible = siblings.filter(
    (s, i) => i < index && s.id !== field.id && (s.type === 'toggle' || s.type === 'choice'),
  );
  const rule = field.visibleWhen;
  const conditions = rule?.conditions ?? [];

  if (eligible.length === 0 && conditions.length === 0) return null;

  function setRule(next: VisibilityRule | undefined) {
    onUpdate((f) => ({ ...f, visibleWhen: next }));
  }

  function defaultEqualsFor(source: FormField | undefined): string {
    if (source?.type === 'toggle') return 'true';
    if (source?.type === 'choice') return source.options[0] ?? '';
    return '';
  }

  function addCondition() {
    const source = eligible.find((s) => !conditions.some((c) => c.fieldId === s.id)) ?? eligible[0];
    if (!source) return;
    setRule({
      mode: rule?.mode ?? 'all',
      conditions: [...conditions, { fieldId: source.id, equals: defaultEqualsFor(source) }],
    });
  }

  function updateCondition(i: number, patch: { fieldId?: string; equals?: string }) {
    setRule({
      mode: rule?.mode ?? 'all',
      conditions: conditions.map((c, ci) => (ci === i ? { ...c, ...patch } : c)),
    });
  }

  function removeCondition(i: number) {
    const next = conditions.filter((_, ci) => ci !== i);
    setRule(next.length ? { mode: rule?.mode ?? 'all', conditions: next } : undefined);
  }

  return (
    <div className="field">
      <label>Only show if</label>
      {conditions.length === 0 && (
        <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 6 }}>
          Always shown.
        </div>
      )}
      {conditions.map((condition, i) => {
        const sourceField = siblings.find((s) => s.id === condition.fieldId);
        return (
          <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
            {i > 0 && (
              <select
                value={rule?.mode ?? 'all'}
                onChange={(e) => setRule({ mode: e.target.value as 'all' | 'any', conditions })}
                style={{ width: 72 }}
              >
                <option value="all">AND</option>
                <option value="any">OR</option>
              </select>
            )}
            <select
              value={condition.fieldId}
              onChange={(e) => {
                const source = eligible.find((s) => s.id === e.target.value);
                updateCondition(i, { fieldId: e.target.value, equals: defaultEqualsFor(source) });
              }}
            >
              {eligible.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label || '(untitled field)'}
                </option>
              ))}
            </select>
            <span>equals</span>
            {sourceField?.type === 'toggle' && (
              <select value={condition.equals} onChange={(e) => updateCondition(i, { equals: e.target.value })}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            )}
            {sourceField?.type === 'choice' && (
              <select value={condition.equals} onChange={(e) => updateCondition(i, { equals: e.target.value })}>
                {sourceField.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              className="icon-btn icon-btn-danger"
              title="Remove condition"
              onClick={() => removeCondition(i)}
            >
              <TrashIcon />
            </button>
          </div>
        );
      })}
      {eligible.length > 0 && (
        <button type="button" className="btn-link" onClick={addCondition}>
          + Add condition
        </button>
      )}
      <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
        Hidden fields are never required, and their answers aren't saved.
      </div>
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
