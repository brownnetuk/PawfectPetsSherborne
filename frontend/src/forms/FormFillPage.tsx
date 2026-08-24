import { useEffect, useState } from 'react';
import * as api from '../api/client';
import FieldRenderer from './FieldRenderer';
import { defaultAnswersFor, isFieldVisible } from './formDefaults';
import ReadOnlyAnswers from './ReadOnlyAnswers';
import RepeatableGroup from './RepeatableGroup';
import type { FormField, FormSubmissionPublic } from '../types';

type LoadState = 'loading' | 'not-found' | 'already-completed' | 'ready' | 'submitted';

function isEmpty(field: FormField, value: unknown): boolean {
  if (field.type === 'file' || field.type === 'multichoice') {
    return !Array.isArray(value) || value.length === 0;
  }
  if (field.type === 'toggle') return false;
  return value === undefined || value === null || value === '';
}

export default function FormFillPage({ submissionId }: { submissionId: string }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [submission, setSubmission] = useState<FormSubmissionPublic | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .fetchFormSubmission(submissionId)
      .then((s) => {
        setSubmission(s);
        if (s.status === 'completed') {
          setLoadState('already-completed');
          return;
        }
        const initial: Record<string, unknown> = defaultAnswersFor(s.fields.filter((f) => f.type !== 'group'));
        for (const field of s.fields) {
          if (field.type === 'group') {
            initial[field.id] = Array.from({ length: Math.max(field.minRepeats, 0) }, () =>
              defaultAnswersFor(field.fields),
            );
          }
        }
        setAnswers(initial);
        setLoadState('ready');
      })
      .catch(() => setLoadState('not-found'));
  }, [submissionId]);

  function setAnswer(id: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  // All three resolve against the *previous* state inside the updater, not
  // against a prop/closure snapshot -- see RepeatableGroup's comment for why
  // that distinction matters when multiple fields in the same repetition
  // change within one React batch.
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
      setLoadState('submitted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadState === 'loading') {
    return <div className="center-message">Loading…</div>;
  }

  if (loadState === 'not-found') {
    return (
      <div className="center-message">
        <h2>Link not found</h2>
        <p className="subtitle">
          This link doesn't match a form we have. Please contact PawfectPets Sherborne for a new
          link.
        </p>
      </div>
    );
  }

  if (loadState === 'submitted') {
    return (
      <div className="center-message">
        <h1>Thank you{submission?.recipientName ? `, ${submission.recipientName}` : ''}!</h1>
        <p className="subtitle">This form has been submitted. We'll be in touch if anything further is needed.</p>
      </div>
    );
  }

  if (!submission) return null;

  // A resent link pointing at an already-completed submission -- rather than
  // a dead-end message, show what was actually filled in (read-only; this
  // never re-opens for editing/resubmission).
  if (loadState === 'already-completed') {
    return (
      <div className="card">
        <h1>{submission.formName}</h1>
        <p className="subtitle">This form has already been submitted.</p>
        {submission.formDescription && <p>{submission.formDescription}</p>}
        <ReadOnlyAnswers fields={submission.fields} answers={submission.answers ?? {}} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      <h1>{submission.formName}</h1>
      {submission.formDescription && <p className="subtitle">{submission.formDescription}</p>}
      {error && <div className="error-banner">{error}</div>}
      {submission.fields.filter((field) => isFieldVisible(field, answers)).map((field) =>
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
      <div className="actions">
        <span />
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </form>
  );
}
