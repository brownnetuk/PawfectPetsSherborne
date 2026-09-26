import { useEffect, useState } from 'react';
import * as api from '../api/client';
import FieldRenderer from './FieldRenderer';
import { defaultAnswersFor, isFieldVisible } from './formDefaults';
import ProgressBar from '../intake/ProgressBar';
import ReadOnlyAnswers from './ReadOnlyAnswers';
import RepeatableGroup, { GroupRepetitionFields } from './RepeatableGroup';
import type { FormField, FormSubmissionPublic, GroupFormField } from '../types';

type LoadState = 'loading' | 'not-found' | 'already-completed' | 'ready' | 'submitted';

function isEmpty(field: FormField, value: unknown): boolean {
  if (field.type === 'file' || field.type === 'multichoice') {
    return !Array.isArray(value) || value.length === 0;
  }
  if (field.type === 'toggle') return false;
  return value === undefined || value === null || value === '';
}

type Page =
  | { kind: 'fields'; key: string; fields: FormField[] }
  | { kind: 'groupRepetition'; key: string; field: GroupFormField; index: number; isLast: boolean };

// Splits a form's top-level fields into wizard pages, same look as the
// hardcoded Customer Intake wizard (frontend/src/intake/) -- but purely
// data-driven, so ANY form gets this once staff mark a section with "+ New
// page" in the builder (a top-level `display` field with startsNewPage). A
// `group` (e.g. "Pet") always gets one page per repetition regardless of
// startsNewPage, mirroring intake's own one-step-per-pet pages -- a
// repeatable section split across N pages reads far better than N copies of
// the same block stacked on one page. A form with no startsNewPage fields at
// all keeps rendering as a single scrollable page (see isPaginated below);
// this only ever runs once that's true.
function buildPages(fields: FormField[], answers: Record<string, unknown>): Page[] {
  const pages: Page[] = [];
  let current: FormField[] = [];
  const flush = () => {
    if (current.length > 0) {
      pages.push({ kind: 'fields', key: `fields-${pages.length}`, fields: current });
      current = [];
    }
  };
  for (const field of fields) {
    if (field.type === 'group') {
      flush();
      const value = (answers[field.id] as Record<string, unknown>[]) ?? [];
      const count = Math.max(value.length, 1);
      for (let i = 0; i < count; i++) {
        pages.push({ kind: 'groupRepetition', key: `${field.id}-${i}`, field, index: i, isLast: i === count - 1 });
      }
      continue;
    }
    if (field.type === 'display' && field.startsNewPage && current.length > 0) {
      flush();
    }
    current.push(field);
  }
  flush();
  return pages;
}

// The most recent section heading in a "fields" page reads better as its
// progress-bar label than the form's own name repeated on every page (e.g.
// "Emergency contact" rather than "Pre-Check-In" for every single step).
function pageLabel(page: Page, formName: string): string {
  if (page.kind === 'groupRepetition') {
    return page.field.repetitionLabels?.[page.index] ?? `${page.field.label} ${page.index + 1}`;
  }
  const headings = page.fields.filter((f) => f.type === 'display');
  return headings[headings.length - 1]?.label ?? formName;
}

export default function FormFillPage({ submissionId }: { submissionId: string }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [submission, setSubmission] = useState<FormSubmissionPublic | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    // Resets immediately (not just on the eventual response) so navigating
    // between two different submission links in the same tab -- e.g. a
    // customer with two bookings opening one pre-check-in link right after
    // another -- never shows the *previous* submission's already-completed
    // view (or its answers) for even a moment while the new one loads.
    setLoadState('loading');
    setSubmission(null);
    setAnswers({});
    setError(null);
    setCurrentPage(0);
    api
      .fetchFormSubmission(submissionId)
      .then((s) => {
        setSubmission(s);
        if (s.status === 'completed') {
          setLoadState('already-completed');
          return;
        }
        // A submission can already carry pre-filled answers (e.g. a
        // pre-check-in form pre-populated from the customer's/each booking
        // pet's own record by BoardingBookingsService.sendPreCheckIn()) --
        // layered over defaultAnswersFor()'s usual blank/defaultValue-driven
        // start so a field with nothing pre-filled still gets its normal
        // default. A plain, un-pre-filled submission has answers: {}, so
        // this is a no-op for every other form.
        const provided = s.answers ?? {};
        const initial: Record<string, unknown> = {
          ...defaultAnswersFor(s.fields.filter((f) => f.type !== 'group')),
          ...provided,
        };
        for (const field of s.fields) {
          if (field.type === 'group') {
            const providedRepetitions = provided[field.id] as Record<string, unknown>[] | undefined;
            initial[field.id] = Array.from({ length: Math.max(field.minRepeats, 0) }, (_, i) => ({
              ...defaultAnswersFor(field.fields),
              ...(providedRepetitions?.[i] ?? {}),
            }));
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

  // Validates just the page the customer is currently on -- Submit still
  // runs the full validate() above as a final safety net regardless of how
  // they navigated here, but per-page validation gives an earlier, more
  // specific error right where the problem is instead of only at the very end.
  function validateCurrentPage(page: Page): string | null {
    if (page.kind === 'fields') {
      for (const field of page.fields) {
        if (!isFieldVisible(field, answers)) continue;
        if (field.required && isEmpty(field, answers[field.id])) {
          return `Please fill in "${field.label}".`;
        }
      }
      return null;
    }
    const repetitions = (answers[page.field.id] as Record<string, unknown>[]) ?? [];
    const repetition = repetitions[page.index] ?? {};
    for (const child of page.field.fields) {
      if (!isFieldVisible(child, repetition)) continue;
      if (child.required && isEmpty(child, repetition[child.id])) {
        return `Please fill in "${child.label}".`;
      }
    }
    return null;
  }

  function handleNextPage(page: Page, lastIndex: number) {
    const validationError = validateCurrentPage(page);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setCurrentPage((p) => Math.min(p + 1, lastIndex));
  }

  function handleBackPage() {
    setError(null);
    setCurrentPage((p) => Math.max(p - 1, 0));
  }

  function handleAddRepetitionPage(field: GroupFormField) {
    addGroupRepetition(field.id, field.fields);
    setCurrentPage((p) => p + 1);
  }

  function handleRemoveRepetitionPage(field: GroupFormField, index: number, pagesLength: number) {
    removeGroupRepetition(field.id, index);
    setCurrentPage((p) => Math.min(p, pagesLength - 2));
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

  const visibleFields = submission.fields.filter((field) => isFieldVisible(field, answers));
  // Opt-in: a form only becomes a paginated wizard once it has at least one
  // "+ New page" marker -- every other form keeps rendering exactly as
  // before (see buildPages' comment above for why).
  const isPaginated = submission.fields.some((field) => field.type === 'display' && field.startsNewPage);

  if (!isPaginated) {
    return (
      <form onSubmit={handleSubmit} className="card">
        <h1>{submission.formName}</h1>
        {submission.formDescription && <p className="subtitle">{submission.formDescription}</p>}
        {error && <div className="error-banner">{error}</div>}
        {visibleFields.map((field) =>
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

  const pages = buildPages(visibleFields, answers);
  const pageIndex = Math.min(currentPage, pages.length - 1);
  const page = pages[pageIndex];
  const isLastPage = pageIndex === pages.length - 1;
  const label = page ? pageLabel(page, submission.formName) : submission.formName;

  return (
    <>
      <ProgressBar current={pageIndex + 1} total={pages.length} label={label} />
      <form onSubmit={handleSubmit} className="card">
        {error && <div className="error-banner">{error}</div>}
        {page?.kind === 'fields' &&
          page.fields.map((field) => (
            <FieldRenderer key={field.id} field={field} value={answers[field.id]} onChange={(v) => setAnswer(field.id, v)} />
          ))}
        {page?.kind === 'groupRepetition' &&
          (() => {
            const groupField = page.field;
            const groupIndex = page.index;
            const value = (answers[groupField.id] as Record<string, unknown>[]) ?? [];
            const repetition = value[groupIndex] ?? {};
            const canRemove = value.length > groupField.minRepeats;
            const canAdd = groupField.maxRepeats === undefined || value.length < groupField.maxRepeats;
            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h2 style={{ fontSize: '1.15rem', margin: 0 }}>{label}</h2>
                  {canRemove && (
                    <button type="button" className="btn-link" onClick={() => handleRemoveRepetitionPage(groupField, groupIndex, pages.length)}>
                      Remove
                    </button>
                  )}
                </div>
                <GroupRepetitionFields
                  field={groupField}
                  repetition={repetition}
                  onFieldChange={(fieldId, v) => setGroupFieldAnswer(groupField.id, groupIndex, fieldId, v)}
                />
                {page.isLast && canAdd && (
                  <button type="button" className="btn-link" onClick={() => handleAddRepetitionPage(groupField)}>
                    + Add another {groupField.label}
                  </button>
                )}
              </div>
            );
          })()}
        <div className="actions">
          {pageIndex > 0 ? (
            <button className="btn btn-secondary" type="button" onClick={handleBackPage} disabled={submitting}>
              Back
            </button>
          ) : (
            <span />
          )}
          {isLastPage ? (
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          ) : (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => page && handleNextPage(page, pages.length - 1)}
              disabled={submitting}
            >
              Next
            </button>
          )}
        </div>
      </form>
    </>
  );
}
