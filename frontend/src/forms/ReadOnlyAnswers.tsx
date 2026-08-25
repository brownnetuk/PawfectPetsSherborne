import type { FormField } from '../types';

function formatAnswer(field: FormField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'toggle') return value ? 'Yes' : 'No';
  if (field.type === 'multichoice' && Array.isArray(value)) {
    return (value as string[]).join(', ') || '—';
  }
  if ((field.type === 'date' || field.type === 'today') && typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString('en-GB');
  }
  if (field.type === 'datetime' && typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString('en-GB');
  }
  return String(value);
}

// Renders a completed submission's answers read-only -- used when a resent
// link points at a form that's already been filled in, so the customer (or
// staff previewing the link) can see what was submitted instead of just a
// dead-end "already submitted" message.
export default function ReadOnlyAnswers({
  fields,
  answers,
}: {
  fields: FormField[];
  answers: Record<string, unknown>;
}) {
  return (
    <div>
      {fields.map((field) => {
        if (field.type === 'display') {
          return (
            <p key={field.id} style={{ whiteSpace: 'pre-wrap' }}>
              {field.label}
            </p>
          );
        }
        if (field.type === 'group') {
          const repetitions = (answers[field.id] as Record<string, unknown>[] | undefined) ?? [];
          return (
            <div key={field.id} style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: '1.15rem' }}>{field.label}</h2>
              {repetitions.length === 0 && <p style={{ color: 'var(--muted)' }}>None provided.</p>}
              {repetitions.map((rep, i) => (
                <div
                  key={i}
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 12 }}
                >
                  <strong style={{ fontSize: '0.9rem' }}>
                    {field.label} {i + 1}
                  </strong>
                  <ReadOnlyAnswers fields={field.fields} answers={rep} />
                </div>
              ))}
            </div>
          );
        }

        const value = answers[field.id];
        return (
          <div key={field.id} className="field">
            <label>{field.label}</label>
            {field.type === 'signature' && typeof value === 'string' && value ? (
              <img
                src={value}
                alt="Signature"
                style={{ maxWidth: 220, border: '1px solid var(--border)', borderRadius: 6 }}
              />
            ) : field.type === 'file' && Array.isArray(value) && value.length > 0 ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(value as string[]).map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
                  />
                ))}
              </div>
            ) : (
              <p style={{ margin: 0 }}>{formatAnswer(field, value)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
