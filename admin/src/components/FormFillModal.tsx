import { useEffect, useState } from 'react';
import * as api from '../api/client';
import { buildFormSubmissionPdf } from '../pdf/formSubmissionPdf';
import FieldRenderer from '../forms/FieldRenderer';
import { defaultAnswersFor, isFieldVisible } from '../forms/formDefaults';
import ReadOnlyAnswers from '../forms/ReadOnlyAnswers';
import RepeatableGroup from '../forms/RepeatableGroup';
import Modal from './Modal';
import type { FormField, FormSubmissionPublic, FormSubmissionRecord } from '../types';

function isEmpty(field: FormField, value: unknown): boolean {
  if (field.type === 'file' || field.type === 'multichoice') {
    return !Array.isArray(value) || value.length === 0;
  }
  if (field.type === 'toggle') return false;
  return value === undefined || value === null || value === '';
}

// Staff-facing fill flow for check-in/check-out -- reuses the same public
// GET .../public + POST .../submit endpoints the customer-facing intake app's
// FormFillPage uses (a @Public() route accepts an authenticated admin caller
// just fine, it just doesn't require one), so no backend changes were needed
// for the fill/submit step itself. On successful submit, calls onSubmitted
// right away (so the caller can link it onto the booking -- recordCheckIn/
// recordCheckOut), then offers "Email a copy to customer" before closing.
export default function FormFillModal({
  submissionId,
  title,
  referenceSubmission,
  referenceLabel,
  presetPetNames,
  onClose,
  onSubmitted,
}: {
  submissionId: string;
  title: string;
  // Shown read-only above the form -- e.g. the linked check-in submission's
  // answers, for context while filling in check-out.
  referenceSubmission?: FormSubmissionRecord | null;
  referenceLabel?: string;
  // The dog(s) already known from context (e.g. the booking this form was
  // opened from) -- any repeatable group whose fields include a "which pet"
  // choice field (optionsSource: 'customerPets') gets pre-populated with one
  // repetition per name here instead of starting empty, so staff aren't
  // re-picking a pet the app already knows.
  presetPetNames?: string[];
  onClose: () => void;
  onSubmitted: (submissionId: string) => void;
}) {
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready' | 'already-completed' | 'submitted'>('loading');
  const [submission, setSubmission] = useState<FormSubmissionPublic | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    api
      .fetchFormSubmissionPublic(submissionId)
      .then((s) => {
        setSubmission(s);
        if (s.status === 'completed') {
          setLoadState('already-completed');
          return;
        }
        const initial: Record<string, unknown> = defaultAnswersFor(s.fields.filter((f) => f.type !== 'group'));
        for (const field of s.fields) {
          if (field.type === 'group') {
            const petNameField = field.fields.find((f) => f.type === 'choice' && f.optionsSource === 'customerPets');
            if (petNameField && presetPetNames && presetPetNames.length > 0) {
              initial[field.id] = presetPetNames.map((name) => ({
                ...defaultAnswersFor(field.fields),
                [petNameField.id]: name,
              }));
            } else {
              initial[field.id] = Array.from({ length: Math.max(field.minRepeats, 0) }, () =>
                defaultAnswersFor(field.fields),
              );
            }
          }
        }
        setAnswers(initial);
        setLoadState('ready');
      })
      .catch(() => setLoadState('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId]);

  function setAnswer(id: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function setGroupFieldAnswer(groupId: string, index: number, fieldId: string, value: unknown) {
    setAnswers((prev) => {
      const current = (prev[groupId] as Record<string, unknown>[]) ?? [];
      const next = current.map((rep, i) => (i === index ? { ...rep, [fieldId]: value } : rep));
      return { ...prev, [groupId]: next };
    });
  }

  function addGroupRepetition(groupId: string, groupFields: FormField[]) {
    setAnswers((prev) => {
      const current = (prev[groupId] as Record<string, unknown>[]) ?? [];
      return { ...prev, [groupId]: [...current, defaultAnswersFor(groupFields)] };
    });
  }

  function removeGroupRepetition(groupId: string, index: number) {
    setAnswers((prev) => {
      const current = (prev[groupId] as Record<string, unknown>[]) ?? [];
      return { ...prev, [groupId]: current.filter((_, i) => i !== index) };
    });
  }

  function validate(): string | null {
    if (!submission) return null;
    for (const field of submission.fields) {
      if (field.type === 'group') {
        const repetitions = (answers[field.id] as Record<string, unknown>[]) ?? [];
        if (repetitions.length < field.minRepeats) {
          return `Please add at least ${field.minRepeats} ${field.label.toLowerCase()}.`;
        }
        for (const repetition of repetitions) {
          for (const child of field.fields) {
            if (!isFieldVisible(child, repetition)) continue;
            if (child.required && isEmpty(child, repetition[child.id])) {
              return `Please fill in "${child.label}" for each ${field.label.toLowerCase()}.`;
            }
          }
        }
      } else {
        if (!isFieldVisible(field, answers)) continue;
        if (field.required && isEmpty(field, answers[field.id])) {
          return `Please fill in "${field.label}".`;
        }
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.submitFormSubmission(submissionId, answers);
      onSubmitted(submissionId);
      setLoadState('submitted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEmailCopy() {
    setEmailing(true);
    setEmailError(null);
    try {
      const full = await api.getFormSubmission(submissionId);
      const doc = await buildFormSubmissionPdf(full);
      const attachmentData = doc.output('datauristring');
      await api.sendFormSubmissionCopy(submissionId, attachmentData, `${full.formName}.pdf`);
      setEmailSent(true);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to email a copy');
    } finally {
      setEmailing(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      {loadState === 'loading' && <p>Loading…</p>}
      {loadState === 'error' && <div className="error-banner">Couldn't load this form.</div>}
      {loadState === 'already-completed' && <p>This form has already been completed.</p>}
      {loadState === 'submitted' && (
        <div>
          <p>Submitted.</p>
          {emailError && <div className="error-banner">{emailError}</div>}
          {emailSent ? (
            <p style={{ color: 'var(--brand-green)', fontWeight: 600 }}>Emailed a copy to the customer.</p>
          ) : (
            <div className="modal-actions" style={{ justifyContent: 'flex-start', gap: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={handleEmailCopy} disabled={emailing}>
                {emailing ? 'Emailing…' : 'Email a copy to customer'}
              </button>
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
      {loadState === 'ready' && submission && (
        <form onSubmit={handleSubmit}>
          {referenceSubmission && (
            <div className="card" style={{ marginBottom: 16, background: 'var(--sage)' }}>
              <div className="section-title" style={{ marginTop: 0 }}>
                {referenceLabel ?? 'Reference'}
              </div>
              <ReadOnlyAnswers fields={referenceSubmission.formFieldsSnapshot} answers={referenceSubmission.answers ?? {}} />
            </div>
          )}
          {submission.formDescription && <p style={{ color: 'var(--muted)' }}>{submission.formDescription}</p>}
          {error && <div className="error-banner">{error}</div>}
          {submission.fields
            .filter((field) => isFieldVisible(field, answers))
            .map((field) =>
              field.type === 'group' ? (
                <RepeatableGroup
                  key={field.id}
                  field={field}
                  value={(answers[field.id] as Record<string, unknown>[]) ?? []}
                  onFieldChange={(index, fieldId, v) => setGroupFieldAnswer(field.id, index, fieldId, v)}
                  onAdd={() => addGroupRepetition(field.id, field.fields)}
                  onRemove={(index) => removeGroupRepetition(field.id, index)}
                />
              ) : (
                <FieldRenderer key={field.id} field={field} value={answers[field.id]} onChange={(v) => setAnswer(field.id, v)} />
              ),
            )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
