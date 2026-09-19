import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { Animal, Customer, FormRecord, FormSubmissionRecord } from '../types';
import Modal from './Modal';

const INTAKE_URL = import.meta.env.VITE_INTAKE_URL ?? 'http://localhost:5173';

// True if any field (including inside a repeatable group) uses a
// {{placeholder}} in its label or sources its options from the customer's
// own pets -- both only resolve once this submission is tied to a real
// customer (see backend/src/forms/form-placeholders.util.ts), so it's worth
// flagging when staff haven't picked one.
function usesCustomerData(fields: FormRecord['fields']): boolean {
  return fields.some((f) => {
    if (/\{\{\w+\}\}/.test(f.label)) return true;
    if ((f.type === 'choice' || f.type === 'multichoice') && f.optionsSource === 'customerPets') return true;
    if (f.type === 'group') return usesCustomerData(f.fields);
    return false;
  });
}

interface Props {
  form: FormRecord;
  /** Pre-fills the recipient when sent from a customer's own "Forms" tab. */
  customer?: Customer;
  /** Resend mode: reuse this submission's own link instead of generating a new one. */
  existing?: FormSubmissionRecord;
  onClose: () => void;
}

interface GeneratedLink {
  submissionId: string;
  link: string;
  /** Set when this link was generated for one specific pet (multi-select below). */
  petName?: string;
}

export default function SendFormModal({ form, customer, existing, onClose }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(customer?._id ?? '');
  const [name, setName] = useState(customer?.name ?? existing?.recipientName ?? '');
  const [email, setEmail] = useState(customer?.email ?? existing?.recipientEmail ?? '');
  const [pets, setPets] = useState<Animal[]>([]);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<GeneratedLink[] | null>(
    existing ? [{ submissionId: existing._id, link: `${INTAKE_URL}/forms/${existing._id}` }] : null,
  );

  const effectiveCustomerId = customer?._id ?? customerId;

  useEffect(() => {
    if (customer || existing) return;
    api.listCustomers().then(setCustomers).catch(() => {});
  }, [customer, existing]);

  // Offering "which pet(s) is this for" only makes sense once a real,
  // known customer is in play (either passed in directly or picked from the
  // dropdown below) -- a brand-new lead has no pets on file yet.
  useEffect(() => {
    if (!effectiveCustomerId || existing) {
      setPets([]);
      setSelectedPetIds([]);
      return;
    }
    api
      .listAnimals(effectiveCustomerId)
      .then(setPets)
      .catch(() => setPets([]));
    setSelectedPetIds([]);
  }, [effectiveCustomerId, existing]);

  function togglePet(id: string) {
    setSelectedPetIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  function handlePickCustomer(id: string) {
    setCustomerId(id);
    const picked = customers.find((c) => c._id === id);
    if (picked) {
      setName(picked.name);
      setEmail(picked.email);
    }
  }

  // No pets selected -> today's behaviour, one general link. One or more
  // selected -> one FormSubmission per pet (each tagged via `animal`, so
  // {{petName}} resolves and the Forms tab can tell them apart), all sharing
  // the same recipient.
  async function handleGenerate() {
    if (!email.trim()) {
      setError('Enter an email address.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const petIds = selectedPetIds.length > 0 ? selectedPetIds : [undefined];
      const created: GeneratedLink[] = [];
      for (const petId of petIds) {
        const submission = await api.createFormSubmission({
          form: form._id,
          customer: effectiveCustomerId || undefined,
          animal: petId,
          recipientEmail: email,
          recipientName: name || undefined,
        });
        created.push({
          submissionId: submission._id,
          link: `${INTAKE_URL}/forms/${submission._id}`,
          petName: petId ? pets.find((p) => p._id === petId)?.name : undefined,
        });
      }
      setResults(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate a link for this form');
    } finally {
      setGenerating(false);
    }
  }

  if (results) {
    return (
      <Modal title={`${existing ? 'Resend' : 'Send'} "${form.name}"`} onClose={onClose}>
        <p style={{ color: 'var(--muted)' }}>
          {results.length > 1
            ? 'Send each link, or copy it to share another way.'
            : 'Send this link, or copy it to share another way.'}
        </p>
        {results.map((r) => (
          <ResultRow
            key={r.submissionId}
            result={r}
            email={email}
            name={name}
            formName={form.name}
            customerId={effectiveCustomerId || undefined}
          />
        ))}
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`Send "${form.name}"`} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      {!customer && (
        <div className="field">
          <label>Existing customer (optional)</label>
          <select value={customerId} onChange={(e) => handlePickCustomer(e.target.value)}>
            <option value="">— New / not on file yet —</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
          {!customerId && usesCustomerData(form.fields) && (
            <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
              This form has placeholders or a "customer's pets" dropdown that only fill in once
              sent to an existing customer — pick one above for those to work.
            </div>
          )}
        </div>
      )}
      <div className="field">
        <label>Recipient name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={!!customer} />
      </div>
      <div className="field">
        <label>Recipient email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!!customer} required />
      </div>
      {pets.length > 0 && (
        <div className="field">
          <label>Which pet(s) is this for? (optional)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pets.map((p) => (
              <label key={p._id} className="checkbox-label">
                <input type="checkbox" checked={selectedPetIds.includes(p._id)} onChange={() => togglePet(p._id)} />
                {p.name} ({p.species})
              </label>
            ))}
          </div>
          <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
            {selectedPetIds.length > 1
              ? `Generates ${selectedPetIds.length} separate links, one per selected pet.`
              : 'Select one or more to generate a separate link per pet -- leave none selected for a single general link.'}
          </div>
        </div>
      )}
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose} disabled={generating}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
          {generating
            ? 'Generating…'
            : selectedPetIds.length > 1
              ? `Generate ${selectedPetIds.length} links`
              : 'Generate link'}
        </button>
      </div>
    </Modal>
  );
}

// One row per generated link -- each manages its own copy/send state
// independently, since sending to several pets at once can have more than
// one row copied/sending/sent at the same time.
function ResultRow({
  result,
  email,
  name,
  formName,
  customerId,
}: {
  result: GeneratedLink;
  email: string;
  name: string;
  formName: string;
  customerId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function copyLink() {
    await navigator.clipboard.writeText(result.link);
    setCopied(true);
  }

  async function sendEmail() {
    setSending(true);
    setSendResult(null);
    try {
      await api.sendTriggeredEmail('form', email, name || email, result.link, customerId, formName);
      setSendResult({ ok: true, message: `Email sent to ${email}.` });
    } catch (err) {
      setSendResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to send email' });
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
      {result.petName && <div style={{ fontWeight: 600, marginBottom: 6 }}>{result.petName}</div>}
      <div className="link-copy-box">{result.link}</div>
      {sendResult && (
        <div
          className={sendResult.ok ? undefined : 'error-banner'}
          style={
            sendResult.ok
              ? {
                  background: 'var(--sage-badge)',
                  color: 'var(--brand-green)',
                  padding: '10px 14px',
                  borderRadius: 8,
                  marginTop: 10,
                  fontSize: '0.85rem',
                  fontWeight: 500,
                }
              : { marginTop: 10 }
          }
        >
          {sendResult.message}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copyLink}>
          {copied ? 'Copied!' : 'Copy link'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={sendEmail} disabled={sending}>
          {sending ? 'Sending…' : 'Send email'}
        </button>
      </div>
    </div>
  );
}
