import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from '../components/Modal';
import { TrashIcon } from '../components/icons';
import type { PreBoardingFormRecord, PreBoardingQuestion } from '../types';

const INTAKE_URL = import.meta.env.VITE_INTAKE_URL ?? 'http://localhost:5173';
const MAX_DOGS = 6;

function formLink(id: string): string {
  return `${INTAKE_URL}/pre-boarding/${id}`;
}

// Names are typed by the owner on the form, so a form that hasn't come
// back yet only knows how many dogs it covers.
function dogsLabel(form: PreBoardingFormRecord): string {
  if (form.dogNames.length > 0) return form.dogNames.join(', ');
  const count = form.dogCount ?? 1;
  return count === 1 ? '1 dog' : `${count} dogs`;
}

function ownerName(form: PreBoardingFormRecord): string {
  return [form.firstName, form.surname].filter(Boolean).join(' ');
}

function fillDogName(text: string, dogName: string): string {
  return text.replace(/\{\{\s*dogName\s*\}\}/g, dogName);
}

function ResultBadge({ form }: { form: PreBoardingFormRecord }) {
  if (form.status !== 'completed') return <span className="badge badge-pending">Awaiting reply</span>;
  return form.suitable ? (
    <span className="badge badge-accepted">Suitable</span>
  ) : (
    <span className="badge badge-declined">Not suitable</span>
  );
}

const successBox = {
  background: 'var(--sage-badge)',
  color: 'var(--brand-green)',
  padding: '10px 14px',
  borderRadius: 8,
  marginTop: 14,
  fontSize: '0.85rem',
  fontWeight: 500,
} as const;

// Rendered as the Pre-Boarding tab of Boarding & Day Care (embedded, so the
// page's own heading gives way to the tab bar above it).
export default function PreBoardingPage({ embedded = false }: { embedded?: boolean }) {
  const [forms, setForms] = useState<PreBoardingFormRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PreBoardingFormRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function refresh() {
    api
      .listPreBoardingForms()
      .then(setForms)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load pre-boarding forms'));
  }
  useEffect(refresh, []);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.deletePreBoardingForm(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete form');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <div className="page-header" style={embedded ? { justifyContent: 'flex-end' } : undefined}>
        {!embedded && <h1>Pre-Boarding</h1>}
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          New Form
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {!forms || forms.length === 0 ? (
          <div className="empty-state">
            {forms === null ? 'Loading…' : 'No pre-boarding forms yet. Choose "New Form" to send one to an owner.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Owner</th>
                <th>Dogs</th>
                <th>Result</th>
                <th>Score</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {forms.map((f) => (
                <tr key={f._id} onClick={() => setViewingId(f._id)}>
                  <td>
                    <div>{ownerName(f)}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{f.email}</div>
                  </td>
                  <td>{dogsLabel(f)}</td>
                  <td>
                    <ResultBadge form={f} />
                  </td>
                  <td>
                    {f.results
                      ? f.results.map((r) => `${r.dogName}: ${r.score}${r.autoFailed ? ' (auto-fail)' : ''}`).join(', ')
                      : '—'}
                  </td>
                  <td>{new Date(f.createdAt).toLocaleDateString('en-GB')}</td>
                  <td onClick={(ev) => ev.stopPropagation()}>
                    <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => setDeleting(f)}>
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <NewPreBoardingFormModal
          onClose={() => setShowNew(false)}
          onCreated={(form) => {
            setShowNew(false);
            refresh();
            setViewingId(form._id);
          }}
        />
      )}

      {viewingId && (
        <ViewPreBoardingFormModal
          id={viewingId}
          onClose={() => setViewingId(null)}
          onChanged={refresh}
        />
      )}

      {deleting && (
        <Modal title="Delete pre-boarding form?" onClose={() => setDeleting(null)}>
          <p>
            This deletes the form for <strong>{ownerName(deleting)}</strong> and any answers they've sent. Its
            link will stop working.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NewPreBoardingFormModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (form: PreBoardingFormRecord) => void;
}) {
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [dogCount, setDogCount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const form = await api.createPreBoardingForm({
        firstName: firstName.trim(),
        surname: surname.trim() || undefined,
        email: email.trim(),
        dogCount,
      });
      onCreated(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create form');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New pre-boarding form" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        {error && <div className="error-banner">{error}</div>}
        <div className="field-row">
          <div className="field">
            <label>Name</label>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label>Surname</label>
            <input type="text" value={surname} onChange={(e) => setSurname(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>How many dogs?</label>
          <select value={dogCount} onChange={(e) => setDogCount(Number(e.target.value))}>
            {Array.from({ length: MAX_DOGS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          The owner fills in each dog's name on the form, and the questions from Settings &gt; Pre-Boarding are
          asked once for each dog.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create form'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ViewPreBoardingFormModal({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<PreBoardingFormRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  function load() {
    api
      .getPreBoardingForm(id)
      .then(setForm)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load form'));
  }
  useEffect(load, [id]);

  async function copyLink() {
    await navigator.clipboard.writeText(formLink(id));
    setCopied(true);
  }

  async function sendEmail() {
    if (!form) return;
    setSending(true);
    setSendResult(null);
    try {
      await api.sendPreBoardingForm(id);
      setSendResult({ ok: true, message: `Email sent to ${form.email}.` });
      load();
      onChanged();
    } catch (err) {
      setSendResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to send email' });
    } finally {
      setSending(false);
    }
  }

  if (error) {
    return (
      <Modal title="Pre-boarding form" onClose={onClose}>
        <div className="error-banner">{error}</div>
      </Modal>
    );
  }
  if (!form) {
    return (
      <Modal title="Pre-boarding form" onClose={onClose}>
        <div className="empty-state">Loading…</div>
      </Modal>
    );
  }

  const title = `Pre-boarding: ${form.dogNames.length > 0 ? form.dogNames.join(', ') : ownerName(form)}`;

  if (form.status !== 'completed') {
    return (
      <Modal title={title} onClose={onClose}>
        <dl className="kv-grid">
          <dt>Owner</dt>
          <dd>{ownerName(form)}</dd>
          <dt>Email</dt>
          <dd>{form.email}</dd>
          <dt>Status</dt>
          <dd>
            <ResultBadge form={form} />
          </dd>
          <dt>Last emailed</dt>
          <dd>{form.lastEmailedAt ? new Date(form.lastEmailedAt).toLocaleString('en-GB') : 'Not emailed yet'}</dd>
        </dl>
        <p style={{ color: 'var(--muted)' }}>
          Send {form.firstName} this link to fill in. Their answers are scored automatically when they submit.
        </p>
        <div className="link-copy-box">{formLink(id)}</div>
        {sendResult && (
          <div
            className={sendResult.ok ? undefined : 'error-banner'}
            style={sendResult.ok ? successBox : { marginTop: 14 }}
          >
            {sendResult.message}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button className="btn btn-secondary" onClick={sendEmail} disabled={sending}>
            {sending ? 'Sending…' : form.lastEmailedAt ? 'Resend email' : 'Send email'}
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  const questions = form.questionsSnapshot ?? [];
  return (
    <Modal title={title} onClose={onClose} wide>
      <dl className="kv-grid">
        <dt>Owner</dt>
        <dd>
          {ownerName(form)} · {form.email}
        </dd>
        <dt>Submitted</dt>
        <dd>{form.submittedAt ? new Date(form.submittedAt).toLocaleString('en-GB') : '—'}</dd>
        <dt>Overall</dt>
        <dd>
          <ResultBadge form={form} />
        </dd>
      </dl>
      {form.dogNames.map((dogName, i) => {
        const result = form.results?.[i];
        const answers = form.answers?.[i] ?? {};
        return (
          <div key={i} className="card" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h3 style={{ margin: 0 }}>{dogName}</h3>
              {result && (
                <span className={`badge ${result.suitable ? 'badge-accepted' : 'badge-declined'}`}>
                  {result.suitable ? 'Suitable' : 'Not suitable'} · {result.score} / {form.maxScore}
                </span>
              )}
            </div>
            {result?.autoFailed && (
              <p style={{ color: 'var(--error)', margin: '8px 0 0', fontSize: '0.85rem' }}>
                An answer marked as an automatic fail was picked.
              </p>
            )}
            {result && result.flags.length > 0 && (
              <>
                <div className="section-title">Answers that scored</div>
                <table>
                  <tbody>
                    {result.flags.map((flag, j) => (
                      <tr key={j}>
                        <td>
                          <div>{flag.question}</div>
                          {flag.details && (
                            <div style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                              {flag.details}
                            </div>
                          )}
                        </td>
                        <td>{flag.answer}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {flag.autoFail ? 'Auto-fail' : `+${flag.score}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <div className="section-title">All answers</div>
            <AnswersBySection questions={questions} answers={answers} dogName={dogName} />
          </div>
        );
      })}
      <div className="modal-actions">
        <button className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

function AnswersBySection({
  questions,
  answers,
  dogName,
}: {
  questions: PreBoardingQuestion[];
  answers: Record<string, { value: string; details?: string }>;
  dogName: string;
}) {
  const answered = questions.filter((q) => answers[q.id]);
  const sections = [...new Set(answered.map((q) => q.section))];
  if (answered.length === 0) return <p style={{ color: 'var(--muted)' }}>No answers.</p>;
  return (
    <>
      {sections.map((section) => (
        <div key={section} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', margin: '8px 0 4px' }}>{section}</div>
          <dl className="kv-grid" style={{ gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)' }}>
            {answered
              .filter((q) => q.section === section)
              .map((q) => {
                const answer = answers[q.id];
                const label = q.options.find((o) => o.value === answer.value)?.label ?? answer.value;
                return (
                  <div key={q.id} style={{ display: 'contents' }}>
                    <dt>{fillDogName(q.text, dogName)}</dt>
                    <dd style={{ whiteSpace: 'pre-wrap' }}>
                      {label}
                      {answer.details && (
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{answer.details}</div>
                      )}
                    </dd>
                  </div>
                );
              })}
          </dl>
        </div>
      ))}
    </>
  );
}
