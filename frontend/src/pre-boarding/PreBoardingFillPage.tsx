import { useEffect, useState } from 'react';
import * as api from '../api/client';
import ProgressBar from '../intake/ProgressBar';
import { ChoiceGroup } from '../intake/fields';
import type { PreBoardingAnswer, PreBoardingPublic, PreBoardingPublicQuestion } from '../types';

type LoadState = 'loading' | 'not-found' | 'already-completed' | 'ready' | 'submitted';
type DogAnswers = Record<string, PreBoardingAnswer>;

function fillDogName(text: string, dogName: string): string {
  return text.replace(/\{\{\s*dogName\s*\}\}/g, dogName);
}

function isVisible(question: PreBoardingPublicQuestion, answers: DogAnswers): boolean {
  if (!question.showWhen || question.showWhen.length === 0) return true;
  return question.showWhen.every((c) => answers[c.questionId]?.value === c.value);
}

function needsDetails(question: PreBoardingPublicQuestion, answer: PreBoardingAnswer | undefined): boolean {
  return !!question.options.find((o) => o.value === answer?.value)?.askDetails;
}

// One page per dog, every question with that dog's name filled in. Follow-up
// questions (showWhen) and "please give details" boxes appear as answers
// are picked.
export default function PreBoardingFillPage({ formId }: { formId: string }) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [form, setForm] = useState<PreBoardingPublic | null>(null);
  const [answers, setAnswers] = useState<DogAnswers[]>([]);
  const [dogIndex, setDogIndex] = useState(0);
  const [dogNames, setDogNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .fetchPreBoardingForm(formId)
      .then((f) => {
        setForm(f);
        setAnswers(Array.from({ length: f.dogCount }, () => ({})));
        setDogNames(Array.from({ length: f.dogCount }, (_, i) => f.dogNames[i] ?? ''));
        setLoadState(f.status === 'completed' ? 'already-completed' : 'ready');
      })
      .catch(() => setLoadState('not-found'));
  }, [formId]);

  // Questions read "Is Autumn neutered?" once the name is typed, and fall
  // back to "your dog" / "Dog 2" until then.
  function displayName(index: number): string {
    const typed = dogNames[index]?.trim();
    if (typed) return typed;
    return (form?.dogCount ?? 1) > 1 ? `Dog ${index + 1}` : 'your dog';
  }

  function setAnswer(questionId: string, patch: Partial<PreBoardingAnswer>) {
    setAnswers((prev) =>
      prev.map((dog, i) =>
        i === dogIndex ? { ...dog, [questionId]: { ...(dog[questionId] ?? { value: '' }), ...patch } } : dog,
      ),
    );
  }

  function validateDog(index: number): string | null {
    if (!form) return null;
    if (!dogNames[index]?.trim()) return "Please fill in your dog's name";
    const dogName = displayName(index);
    const dog = answers[index] ?? {};
    for (const question of form.questions) {
      if (!isVisible(question, dog)) continue;
      const answer = dog[question.id];
      if (question.required && !answer?.value?.trim()) {
        return `Please answer "${fillDogName(question.text, dogName)}"`;
      }
    }
    return null;
  }

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const validationError = validateDog(dogIndex);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (dogIndex < form.dogCount - 1) {
      setError(null);
      setDogIndex(dogIndex + 1);
      scrollTop();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // Only send answers to questions that are still showing, and details
      // only where the picked answer asks for them.
      const cleaned = answers.map((dog) => {
        const out: DogAnswers = {};
        for (const question of form.questions) {
          const answer = dog[question.id];
          if (!answer?.value || !isVisible(question, out)) continue;
          out[question.id] = {
            value: answer.value,
            details: needsDetails(question, answer) ? answer.details : undefined,
          };
        }
        return out;
      });
      await api.submitPreBoardingForm(
        formId,
        dogNames.map((n) => n.trim()),
        cleaned,
      );
      setLoadState('submitted');
      scrollTop();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loadState === 'loading') return <div className="center-message">Loading…</div>;

  if (loadState === 'not-found') {
    return (
      <div className="center-message">
        <h2>Link not found</h2>
        <p className="subtitle">
          This link doesn't match a questionnaire we have. Please contact PawfectPets Sherborne for a new link.
        </p>
      </div>
    );
  }

  if (loadState === 'submitted') {
    return (
      <div className="center-message">
        <h1>Thank you{form?.firstName ? `, ${form.firstName}` : ''}!</h1>
        <p className="subtitle">We've got your answers and will be in touch soon.</p>
      </div>
    );
  }

  if (loadState === 'already-completed') {
    return (
      <div className="center-message">
        <h2>Already submitted</h2>
        <p className="subtitle">This questionnaire has already been filled in. Thank you!</p>
      </div>
    );
  }

  if (!form) return null;

  const dogName = displayName(dogIndex);
  const dog = answers[dogIndex] ?? {};
  const visible = form.questions.filter((q) => isVisible(q, dog));
  const sections = [...new Set(visible.map((q) => q.section))];
  const isLast = dogIndex === form.dogCount - 1;

  return (
    <form onSubmit={handleSubmit} className="card">
      {form.dogCount > 1 && (
        <ProgressBar current={dogIndex + 1} total={form.dogCount} label={dogName} />
      )}
      <h1>Pre-boarding questionnaire</h1>
      <p className="subtitle">
        {dogIndex === 0
          ? `Hi ${form.firstName}, please answer these questions about ${form.dogCount > 1 ? 'each of your dogs' : 'your dog'} so we can make sure boarding with us is a good fit.`
          : 'Now a few questions about your next dog.'}
      </p>
      <div className="field">
        <label>
          {form.dogCount > 1 ? `Dog ${dogIndex + 1}'s name` : "Your dog's name"} <span className="required">*</span>
        </label>
        <input
          type="text"
          value={dogNames[dogIndex] ?? ''}
          onChange={(e) => setDogNames((prev) => prev.map((n, i) => (i === dogIndex ? e.target.value : n)))}
        />
      </div>
      {sections.map((section) => (
        <div key={section}>
          <h2>{section}</h2>
          {visible
            .filter((q) => q.section === section)
            .map((question) => {
              const answer = dog[question.id];
              const label = fillDogName(question.text, dogName);
              return (
                <div key={question.id}>
                  {question.type === 'text' ? (
                    <div className="field">
                      <label>
                        {label} {question.required && <span className="required">*</span>}
                      </label>
                      <textarea
                        value={answer?.value ?? ''}
                        onChange={(e) => setAnswer(question.id, { value: e.target.value })}
                      />
                    </div>
                  ) : (
                    <ChoiceGroup
                      label={label}
                      value={answer?.value ?? ''}
                      options={question.options.map((o) => ({ value: o.value, label: o.label }))}
                      onChange={(v) => setAnswer(question.id, { value: v })}
                      required={question.required}
                    />
                  )}
                  {needsDetails(question, answer) && (
                    <div className="field">
                      <label>{question.detailsPrompt || 'Please give details'}</label>
                      <textarea
                        value={answer?.details ?? ''}
                        onChange={(e) => setAnswer(question.id, { details: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      ))}
      {error && <div className="error-banner">{error}</div>}
      <div className="actions">
        {dogIndex > 0 ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setError(null);
              setDogIndex(dogIndex - 1);
              scrollTop();
            }}
          >
            Back
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : isLast ? 'Submit' : 'Next dog'}
        </button>
      </div>
    </form>
  );
}
