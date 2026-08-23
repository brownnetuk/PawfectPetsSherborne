import type { FormField, FormSubmissionRecord } from '../types';
import Modal from './Modal';

function AnswerValue({ field, value }: { field: FormField; value: unknown }) {
  if (value === undefined || value === null || value === '') {
    return <span style={{ color: 'var(--muted)' }}>—</span>;
  }
  if (field.type === 'signature') {
    return <img src={String(value)} alt="Signature" style={{ maxWidth: 220, border: '1px solid var(--border)', borderRadius: 6 }} />;
  }
  if (field.type === 'file') {
    const photos = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {photos.map((src, i) => (
          <img key={i} src={src} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
        ))}
      </div>
    );
  }
  if (field.type === 'toggle') {
    return <>{value ? 'Yes' : 'No'}</>;
  }
  if (field.type === 'multichoice' && Array.isArray(value)) {
    return <>{(value as string[]).join(', ')}</>;
  }
  return <>{String(value)}</>;
}

function FieldAnswers({ fields, answers }: { fields: FormField[]; answers: Record<string, unknown> }) {
  return (
    <dl className="kv-grid">
      {fields.map((field) => {
        if (field.type === 'group') {
          const repetitions = (answers[field.id] as Record<string, unknown>[] | undefined) ?? [];
          return (
            <div key={field.id} style={{ gridColumn: '1 / -1' }}>
              <div className="section-title" style={{ marginTop: 14 }}>
                {field.label}
              </div>
              {repetitions.length === 0 && <div className="empty-state">None provided.</div>}
              {repetitions.map((rep, i) => (
                <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                  <strong>
                    {field.label} {i + 1}
                  </strong>
                  <FieldAnswers fields={field.fields} answers={rep} />
                </div>
              ))}
            </div>
          );
        }
        return (
          <div key={field.id} style={{ display: 'contents' }}>
            <dt>
              {field.label}
              {!field.mapping && (
                <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.75rem' }}> (not mapped)</span>
              )}
            </dt>
            <dd>
              <AnswerValue field={field} value={answers[field.id]} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export default function ViewFormSubmissionModal({
  submission,
  onClose,
}: {
  submission: FormSubmissionRecord;
  onClose: () => void;
}) {
  return (
    <Modal title={submission.formName} onClose={onClose} wide>
      {submission.status === 'pending' ? (
        <div className="empty-state">Not filled in yet.</div>
      ) : (
        <FieldAnswers fields={submission.formFieldsSnapshot} answers={submission.answers ?? {}} />
      )}
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
