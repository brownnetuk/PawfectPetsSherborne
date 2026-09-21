import type { FormField } from '../types';

// Direct port of frontend/src/forms/ReadOnlyAnswers.tsx -- no CSS
// dependencies beyond .field/var(--border)/var(--muted), which admin
// already has. Used here to show a check-out form's linked check-in
// submission read-only above the check-out fields.
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
          const hasFixedLabels = !!field.repetitionLabels;
          return (
            <div key={field.id} style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
              {!hasFixedLabels && <h3 style={{ fontSize: '1rem' }}>{field.label}</h3>}
              {repetitions.length === 0 && <p style={{ color: 'var(--muted)' }}>None provided.</p>}
              {repetitions.map((rep, i) => (
                <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 12 }}>
                  <strong style={{ fontSize: '0.9rem' }}>{field.repetitionLabels?.[i] ?? `${field.label} ${i + 1}`}</strong>
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
              <img src={value} alt="Signature" style={{ maxWidth: 220, border: '1px solid var(--border)', borderRadius: 6 }} />
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
            ) : field.type === 'multichoice' && Array.isArray(value) && value.length > 0 ? (
              <div>
                {(value as string[]).map((item) => (
                  <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--brand-green)' }}>✓</span>
                    <span>{item}</span>
                  </div>
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
