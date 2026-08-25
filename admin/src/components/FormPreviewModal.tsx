import { useState } from 'react';
import type { FormField, GroupFormField, VisibilityRule } from '../types';
import Modal from './Modal';

interface Props {
  name: string;
  description: string;
  fields: FormField[];
  onClose: () => void;
}

// Mirrors frontend/src/forms/formDefaults.ts's isFieldVisible -- this admin
// app has no shared package with the public intake app, so the (small)
// condition-evaluation logic is duplicated here rather than pulled in.
function isVisible(rule: VisibilityRule | undefined, scopeAnswers: Record<string, unknown>): boolean {
  if (!rule || rule.conditions.length === 0) return true;
  const results = rule.conditions.map((c) => String(scopeAnswers[c.fieldId]) === c.equals);
  return rule.mode === 'any' ? results.some(Boolean) : results.every(Boolean);
}

function defaultAnswersFor(fields: FormField[]): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  const now = new Date();
  for (const field of fields) {
    if (field.type === 'toggle') defaults[field.id] = false;
    if (field.type === 'today') defaults[field.id] = now.toISOString().slice(0, 10);
    if (field.type === 'datetime') defaults[field.id] = now.toISOString();
  }
  return defaults;
}

// This is a staff-facing sanity-check of layout, wording, and visibility
// rules -- not a pixel-accurate render of the public intake app's own CSS.
// File/signature inputs are shown as inert placeholders since there's
// nothing meaningful to preview about a file picker or a signature pad.
export default function FormPreviewModal({ name, description, fields, onClose }: Props) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(() =>
    defaultAnswersFor(fields.filter((f) => f.type !== 'group')),
  );
  const [groupAnswers, setGroupAnswers] = useState<Record<string, Record<string, unknown>[]>>(() => {
    const initial: Record<string, Record<string, unknown>[]> = {};
    for (const field of fields) {
      if (field.type === 'group') {
        initial[field.id] = Array.from({ length: Math.max(field.minRepeats, 0) }, () =>
          defaultAnswersFor(field.fields),
        );
      }
    }
    return initial;
  });

  function setAnswer(id: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function setGroupFieldAnswer(groupId: string, index: number, fieldId: string, value: unknown) {
    setGroupAnswers((prev) => ({
      ...prev,
      [groupId]: (prev[groupId] ?? []).map((rep, i) => (i === index ? { ...rep, [fieldId]: value } : rep)),
    }));
  }

  function addRepetition(group: GroupFormField) {
    setGroupAnswers((prev) => ({
      ...prev,
      [group.id]: [...(prev[group.id] ?? []), defaultAnswersFor(group.fields)],
    }));
  }

  function removeRepetition(groupId: string, index: number) {
    setGroupAnswers((prev) => ({ ...prev, [groupId]: (prev[groupId] ?? []).filter((_, i) => i !== index) }));
  }

  return (
    <Modal title="Preview" onClose={onClose} xl>
      <p className="hint">This is a preview for your own sanity-check -- nothing entered here is saved.</p>
      <div className="card" style={{ background: 'var(--surface-alt, var(--bg))' }}>
        <h2>{name || '(untitled form)'}</h2>
        {description && <p style={{ color: 'var(--muted)' }}>{description}</p>}

        {fields
          .filter((field) => isVisible(field.visibleWhen, answers))
          .map((field) =>
            field.type === 'group' ? (
              <div key={field.id} style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div className="section-title">{field.label}</div>
                {(groupAnswers[field.id] ?? []).map((repetition, index) => (
                  <div
                    key={index}
                    style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 12 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <strong style={{ fontSize: '0.9rem' }}>
                        {field.label} {index + 1}
                      </strong>
                      {(groupAnswers[field.id]?.length ?? 0) > field.minRepeats && (
                        <button type="button" className="btn-link" onClick={() => removeRepetition(field.id, index)}>
                          Remove
                        </button>
                      )}
                    </div>
                    {field.fields
                      .filter((child) => isVisible(child.visibleWhen, repetition))
                      .map((child) => (
                        <PreviewField
                          key={child.id}
                          field={child}
                          value={repetition[child.id]}
                          onChange={(v) => setGroupFieldAnswer(field.id, index, child.id, v)}
                        />
                      ))}
                  </div>
                ))}
                {(field.maxRepeats === undefined || (groupAnswers[field.id]?.length ?? 0) < field.maxRepeats) && (
                  <button type="button" className="btn-link" onClick={() => addRepetition(field)}>
                    + Add another {field.label}
                  </button>
                )}
              </div>
            ) : (
              <PreviewField key={field.id} field={field} value={answers[field.id]} onChange={(v) => setAnswer(field.id, v)} />
            ),
          )}
      </div>

      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

function PreviewField({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (field.type === 'display') {
    return (
      <p style={{ whiteSpace: 'pre-wrap', margin: '14px 0' }}>{field.label}</p>
    );
  }

  const label = (
    <label>
      {field.label} {field.required && <span className="required">*</span>}
    </label>
  );

  switch (field.type) {
    case 'text':
      return (
        <div className="field">
          {label}
          <input type="text" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'textarea':
      return (
        <div className="field">
          {label}
          <textarea value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'number':
      return (
        <div className="field">
          {label}
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
          {label}
          <input type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'today':
      return (
        <div className="field">
          {label}
          <input type="text" value={value ? new Date(value as string).toLocaleDateString('en-GB') : ''} disabled />
        </div>
      );
    case 'datetime':
      return (
        <div className="field">
          {label}
          <input type="text" value={value ? new Date(value as string).toLocaleString('en-GB') : ''} disabled />
        </div>
      );
    case 'toggle':
      return (
        <label className="checkbox-label">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
      );
    case 'choice':
      return (
        <div className="field">
          {label}
          <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
            <option value="">Select…</option>
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
      return (
        <div className="field">
          {label}
          {field.options.map((o) => (
            <label key={o} className="checkbox-label">
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...selected, o] : selected.filter((v) => v !== o))
                }
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case 'file':
      return (
        <div className="field">
          {label}
          <div className="empty-state">📎 File / photo upload (not shown in preview)</div>
        </div>
      );
    case 'signature':
      return (
        <div className="field">
          {label}
          <div className="empty-state">✍️ Signature pad (not shown in preview)</div>
        </div>
      );
    default:
      return null;
  }
}
