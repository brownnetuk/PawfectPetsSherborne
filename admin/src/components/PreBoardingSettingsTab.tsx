import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import { PencilIcon, TrashIcon } from './icons';
import type { PreBoardingOption, PreBoardingQuestion, PreBoardingQuestionType } from '../types';

const TYPE_LABELS: Record<PreBoardingQuestionType, string> = {
  yesno: 'Yes / No',
  choice: 'Multiple choice',
  text: 'Free text (not scored)',
};

function blankOption(value: string, label: string): PreBoardingOption {
  return { value, label, score: 0, askDetails: false, autoFail: false };
}

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'option'
  );
}

function newId(): string {
  return `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// The highest score a dog could get from one question -- shown in the list so
// staff can see at a glance which questions weigh most.
function maxPoints(q: PreBoardingQuestion): number {
  return q.options.reduce((m, o) => Math.max(m, o.score), 0);
}

export default function PreBoardingSettingsTab() {
  const [maxScore, setMaxScore] = useState<number>(10);
  const [questions, setQuestions] = useState<PreBoardingQuestion[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    api
      .getPreBoardingSettings()
      .then((s) => {
        setMaxScore(s.maxScore);
        setQuestions(s.questions);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load settings'));
  }, []);

  function change(next: PreBoardingQuestion[]) {
    setQuestions(next);
    setDirty(true);
    setSaved(false);
  }

  async function save() {
    if (!questions) return;
    setSaving(true);
    setError(null);
    try {
      const s = await api.updatePreBoardingSettings({ maxScore, questions });
      setMaxScore(s.maxScore);
      setQuestions(s.questions);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    setError(null);
    try {
      const s = await api.resetPreBoardingQuestions();
      setQuestions(s.questions);
      setDirty(false);
      setConfirmReset(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset');
    } finally {
      setSaving(false);
    }
  }

  function move(index: number, delta: number) {
    if (!questions) return;
    const target = index + delta;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    // A condition may only point at a question above it -- drop any that a
    // move would break rather than leaving the list unsaveable.
    const position = new Map(next.map((q, i) => [q.id, i]));
    change(
      next.map((q, i) =>
        q.showWhen
          ? { ...q, showWhen: q.showWhen.filter((c) => (position.get(c.questionId) ?? Infinity) < i) }
          : q,
      ),
    );
  }

  function remove(index: number) {
    if (!questions) return;
    const removedId = questions[index].id;
    change(
      questions
        .filter((_, i) => i !== index)
        .map((q) => (q.showWhen ? { ...q, showWhen: q.showWhen.filter((c) => c.questionId !== removedId) } : q)),
    );
  }

  function addQuestion() {
    if (!questions) return;
    const last = questions[questions.length - 1];
    const q: PreBoardingQuestion = {
      id: newId(),
      section: last?.section ?? 'General',
      text: '',
      type: 'yesno',
      options: [blankOption('yes', 'Yes'), blankOption('no', 'No')],
      required: true,
      active: true,
    };
    change([...questions, q]);
    setEditingIndex(questions.length);
  }

  if (error && !questions) return <div className="error-banner">{error}</div>;
  if (!questions) return <div className="empty-state">Loading…</div>;

  const sections = [...new Set(questions.map((q) => q.section))];

  return (
    <div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Scoring</h3>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Each answer can carry concern points. When an owner submits the form, each dog's points are added up. A dog
          is fit for boarding when its total is at or below the pass mark, unless it picked an answer marked as an
          automatic fail.
        </p>
        <div className="field" style={{ maxWidth: 260 }}>
          <label>Pass mark (highest score allowed)</label>
          <input
            type="number"
            min={0}
            value={maxScore}
            onChange={(e) => {
              setMaxScore(Math.max(0, Math.round(Number(e.target.value) || 0)));
              setDirty(true);
              setSaved(false);
            }}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 0, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
          <h3 style={{ margin: 0 }}>Questions</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setConfirmReset(true)}>
              Reset to defaults
            </button>
            <button className="btn btn-secondary btn-sm" onClick={addQuestion}>
              Add question
            </button>
          </div>
        </div>
        <p style={{ color: 'var(--muted)', margin: '0 20px 12px', fontSize: '0.85rem' }}>
          Use {'{{dogName}}'} in a question and it's replaced with each dog's name on the form. Inactive questions
          stay here but aren't put on new forms.
        </p>
        <table>
          <thead>
            <tr>
              <th>Question</th>
              <th>Type</th>
              <th>Max points</th>
              <th>Active</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <SectionRows
                key={section}
                section={section}
                questions={questions}
                onToggleActive={(i) =>
                  change(questions.map((q, j) => (j === i ? { ...q, active: !q.active } : q)))
                }
                onEdit={setEditingIndex}
                onMove={move}
                onRemove={remove}
              />
            ))}
          </tbody>
        </table>
      </div>

      {error && <div className="error-banner" style={{ marginTop: 16 }}>{error}</div>}
      <div className="modal-actions" style={{ marginTop: 16 }}>
        {saved && !dirty && <span style={{ color: 'var(--brand-green)', alignSelf: 'center' }}>Saved</span>}
        <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      {editingIndex !== null && questions[editingIndex] && (
        <QuestionEditor
          question={questions[editingIndex]}
          earlier={questions.slice(0, editingIndex)}
          sections={sections}
          onClose={() => {
            // A brand-new question left blank is discarded rather than saved empty.
            if (!questions[editingIndex].text.trim()) remove(editingIndex);
            setEditingIndex(null);
          }}
          onChange={(q) => change(questions.map((existing, i) => (i === editingIndex ? q : existing)))}
        />
      )}

      {confirmReset && (
        <Modal title="Reset questions to defaults?" onClose={() => setConfirmReset(false)}>
          <p>
            This replaces every question and score with the original suggested set. Forms already created keep their
            own copy of the questions. The pass mark isn't changed.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={reset} disabled={saving}>
              Reset questions
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SectionRows({
  section,
  questions,
  onToggleActive,
  onEdit,
  onMove,
  onRemove,
}: {
  section: string;
  questions: PreBoardingQuestion[];
  onToggleActive: (index: number) => void;
  onEdit: (index: number) => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={5} style={{ background: 'var(--bg, #f6f7f9)', fontWeight: 700, fontSize: '0.8rem' }}>
          {section}
        </td>
      </tr>
      {questions.map((q, i) =>
        q.section !== section ? null : (
          <tr key={q.id} style={{ opacity: q.active ? 1 : 0.5 }} onClick={() => onEdit(i)}>
            <td>
              <div>{q.text || <em style={{ color: 'var(--muted)' }}>Untitled question</em>}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                {q.options
                  .filter((o) => o.score > 0 || o.autoFail)
                  .map((o) => `${o.label}: ${o.autoFail ? 'auto-fail' : `+${o.score}`}`)
                  .join(' · ')}
                {q.showWhen && q.showWhen.length > 0 && ' · conditional'}
              </div>
            </td>
            <td style={{ whiteSpace: 'nowrap' }}>{TYPE_LABELS[q.type]}</td>
            <td>
              {q.type === 'text' ? '—' : maxPoints(q)}
              {q.options.some((o) => o.autoFail) && ' + auto-fail'}
            </td>
            <td onClick={(e) => e.stopPropagation()}>
              <input type="checkbox" checked={q.active} onChange={() => onToggleActive(i)} />
            </td>
            <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
              <button className="icon-btn" title="Move up" onClick={() => onMove(i, -1)}>
                ↑
              </button>
              <button className="icon-btn" title="Move down" onClick={() => onMove(i, 1)}>
                ↓
              </button>
              <button className="icon-btn" title="Edit" onClick={() => onEdit(i)}>
                <PencilIcon />
              </button>
              <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => onRemove(i)}>
                <TrashIcon />
              </button>
            </td>
          </tr>
        ),
      )}
    </>
  );
}

function QuestionEditor({
  question,
  earlier,
  sections,
  onChange,
  onClose,
}: {
  question: PreBoardingQuestion;
  earlier: PreBoardingQuestion[];
  sections: string[];
  onChange: (q: PreBoardingQuestion) => void;
  onClose: () => void;
}) {
  const q = question;
  const conditionSources = earlier.filter((e) => e.type !== 'text');

  function setType(type: PreBoardingQuestionType) {
    let options = q.options;
    if (type === 'yesno') {
      const yes = q.options.find((o) => o.value === 'yes');
      const no = q.options.find((o) => o.value === 'no');
      options = [
        { ...blankOption('yes', 'Yes'), ...yes, label: 'Yes' },
        { ...blankOption('no', 'No'), ...no, label: 'No' },
      ];
    } else if (type === 'choice' && q.type !== 'choice') {
      options = q.options.length >= 2 ? q.options : [blankOption('option_1', 'Option 1'), blankOption('option_2', 'Option 2')];
    } else if (type === 'text') {
      options = [];
    }
    onChange({ ...q, type, options, required: type === 'text' ? false : q.required });
  }

  function setOption(index: number, patch: Partial<PreBoardingOption>) {
    onChange({ ...q, options: q.options.map((o, i) => (i === index ? { ...o, ...patch } : o)) });
  }

  function addOption() {
    const n = q.options.length + 1;
    let value = `option_${n}`;
    while (q.options.some((o) => o.value === value)) value += '_';
    onChange({ ...q, options: [...q.options, blankOption(value, `Option ${n}`)] });
  }

  return (
    <Modal title={q.text ? 'Edit question' : 'New question'} onClose={onClose} wide>
      <div className="field">
        <label>Question</label>
        <input
          type="text"
          value={q.text}
          placeholder="e.g. Does {{dogName}} get on with other dogs?"
          onChange={(e) => onChange({ ...q, text: e.target.value })}
          autoFocus
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Section</label>
          <input
            type="text"
            list="pre-boarding-sections"
            value={q.section}
            onChange={(e) => onChange({ ...q, section: e.target.value })}
          />
          <datalist id="pre-boarding-sections">
            {sections.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label>Answer type</label>
          <select value={q.type} onChange={(e) => setType(e.target.value as PreBoardingQuestionType)}>
            {(Object.keys(TYPE_LABELS) as PreBoardingQuestionType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <input type="checkbox" checked={q.required} onChange={(e) => onChange({ ...q, required: e.target.checked })} />
        Owner must answer this
      </label>

      {q.type !== 'text' && (
        <>
          <div className="section-title">Answers and scoring</div>
          <table>
            <thead>
              <tr>
                <th>Answer</th>
                <th style={{ width: 90 }}>Points</th>
                <th>Ask for details</th>
                <th>Auto-fail</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {q.options.map((o, i) => (
                <tr key={i}>
                  <td>
                    {q.type === 'yesno' ? (
                      o.label
                    ) : (
                      <input
                        type="text"
                        value={o.label}
                        onChange={(e) =>
                          setOption(i, {
                            label: e.target.value,
                            // Keep the stored value in step with the label
                            // until the question has been saved and used.
                            value: o.value.startsWith('option_') ? slug(e.target.value) : o.value,
                          })
                        }
                      />
                    )}
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={o.score}
                      style={{ width: 70 }}
                      onChange={(e) => setOption(i, { score: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={o.askDetails}
                      onChange={(e) => setOption(i, { askDetails: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={o.autoFail}
                      onChange={(e) => setOption(i, { autoFail: e.target.checked })}
                    />
                  </td>
                  <td>
                    {q.type === 'choice' && q.options.length > 2 && (
                      <button
                        className="icon-btn icon-btn-danger"
                        title="Remove answer"
                        onClick={() => onChange({ ...q, options: q.options.filter((_, j) => j !== i) })}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.type === 'choice' && (
            <button className="btn-link" style={{ marginTop: 8 }} onClick={addOption}>
              + Add answer
            </button>
          )}
          {q.options.some((o) => o.askDetails) && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>Details prompt</label>
              <input
                type="text"
                value={q.detailsPrompt ?? ''}
                placeholder="Please give details"
                onChange={(e) => onChange({ ...q, detailsPrompt: e.target.value || undefined })}
              />
            </div>
          )}
        </>
      )}

      <div className="section-title">Only ask when</div>
      {conditionSources.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Conditions can only use questions above this one.
        </p>
      ) : (
        <>
          {(q.showWhen ?? []).map((c, i) => {
            const source = conditionSources.find((s) => s.id === c.questionId);
            return (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 3, minWidth: 0 }}>
                  <label>Question</label>
                  <select
                    value={c.questionId}
                    onChange={(e) => {
                      const nextSource = conditionSources.find((s) => s.id === e.target.value);
                      const showWhen = (q.showWhen ?? []).map((existing, j) =>
                        j === i ? { questionId: e.target.value, value: nextSource?.options[0]?.value ?? '' } : existing,
                      );
                      onChange({ ...q, showWhen });
                    }}
                  >
                    {conditionSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.text}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: 2, minWidth: 0 }}>
                  <label>Is answered</label>
                  <select
                    value={c.value}
                    onChange={(e) => {
                      const showWhen = (q.showWhen ?? []).map((existing, j) =>
                        j === i ? { ...existing, value: e.target.value } : existing,
                      );
                      onChange({ ...q, showWhen });
                    }}
                  >
                    {(source?.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field" style={{ flex: '0 0 auto' }}>
                  <button
                    className="icon-btn icon-btn-danger"
                    title="Remove condition"
                    onClick={() => {
                      const showWhen = (q.showWhen ?? []).filter((_, j) => j !== i);
                      onChange({ ...q, showWhen: showWhen.length > 0 ? showWhen : undefined });
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            );
          })}
          <button
            className="btn-link"
            onClick={() => {
              const first = conditionSources[conditionSources.length - 1];
              onChange({
                ...q,
                showWhen: [...(q.showWhen ?? []), { questionId: first.id, value: first.options[0]?.value ?? '' }],
              });
            }}
          >
            + Add condition
          </button>
          {(q.showWhen?.length ?? 0) > 1 && (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>All conditions must match.</p>
          )}
        </>
      )}

      <div className="modal-actions">
        <button className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
