import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { Animal, Customer, FormField, FormRecord, FormSubmissionRecord } from '../types';
import FormPreviewModal from './FormPreviewModal';
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

// Mirrors backend's FormSubmissionsService.wrapFieldsForPets -- this admin
// app has no shared package with the backend, so the (small) merging logic
// is duplicated here purely so the preview shown before sending matches
// what create() actually snapshots. Keep both in sync by hand.
function wrapFieldsForPets(fields: FormField[], petNames: string[]): FormField[] {
  const keep: FormField[] = [];
  const repeat: FormField[] = [];
  for (const field of fields) {
    if (field.type === 'group' || field.mapping) {
      keep.push(field);
    } else {
      repeat.push(field);
    }
  }
  if (repeat.length === 0) return fields;
  const perPetGroup: FormField = {
    id: 'per-pet',
    type: 'group',
    label: 'Pet',
    required: false,
    repeatable: true,
    minRepeats: petNames.length,
    maxRepeats: petNames.length,
    createsAnimal: false,
    repetitionLabels: petNames,
    fields: repeat,
  };
  return [...keep, perPetGroup];
}

interface Props {
  form: FormRecord;
  /** Pre-fills the recipient when sent from a customer's own "Forms" tab. */
  customer?: Customer;
  /** Resend mode: reuse this submission's own link instead of generating a new one. */
  existing?: FormSubmissionRecord;
  onClose: () => void;
}

export default function SendFormModal({ form, customer, existing, onClose }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState(customer?._id ?? '');
  const [name, setName] = useState(customer?.name ?? existing?.recipientName ?? '');
  const [email, setEmail] = useState(customer?.email ?? existing?.recipientEmail ?? '');
  const [pets, setPets] = useState<Animal[]>([]);
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(existing ? `${INTAKE_URL}/forms/${existing._id}` : null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

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

  function handlePreview() {
    if (!email.trim()) {
      setError('Enter an email address.');
      return;
    }
    setError(null);
    setPreviewing(true);
  }

  // No pets selected -> today's plain, general-purpose link. One selected ->
  // a single-pet submission. Two or more -> still just one submission/link,
  // but the backend merges the form's own fields into one repeated "per
  // pet" section covering all of them (see FormSubmissionsService.create())
  // rather than generating a separate link per pet -- previewFields above
  // mirrors that same merge so what staff preview matches what's actually
  // sent.
  async function handleGenerate() {
    setPreviewing(false);
    setGenerating(true);
    setError(null);
    try {
      const submission = await api.createFormSubmission({
        form: form._id,
        customer: effectiveCustomerId || undefined,
        animals: selectedPetIds.length > 0 ? selectedPetIds : undefined,
        recipientEmail: email,
        recipientName: name || undefined,
      });
      setLink(`${INTAKE_URL}/forms/${submission._id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate a link for this form');
    } finally {
      setGenerating(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  async function sendEmail() {
    if (!link) return;
    setSending(true);
    setSendResult(null);
    try {
      await api.sendTriggeredEmail('form', email, name || email, link, effectiveCustomerId || undefined, form.name);
      setSendResult({ ok: true, message: `Email sent to ${email}.` });
    } catch (err) {
      setSendResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to send email' });
    } finally {
      setSending(false);
    }
  }

  if (link) {
    return (
      <Modal title={`${existing ? 'Resend' : 'Send'} "${form.name}"`} onClose={onClose}>
        <p style={{ color: 'var(--muted)' }}>Send this link, or copy it to share another way.</p>
        {selectedPetIds.length > 1 && (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            Covers all {selectedPetIds.length} selected pets, one after another, in this one link.
          </p>
        )}
        <div className="link-copy-box">{link}</div>
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
                    marginTop: 14,
                    fontSize: '0.85rem',
                    fontWeight: 500,
                  }
                : { marginTop: 14 }
            }
          >
            {sendResult.message}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          <button className="btn btn-secondary" onClick={sendEmail} disabled={sending}>
            {sending ? 'Sending…' : 'Send email'}
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  if (previewing) {
    const selectedPets = pets.filter((p) => selectedPetIds.includes(p._id));
    const previewFields =
      selectedPets.length > 1 ? wrapFieldsForPets(form.fields, selectedPets.map((p) => p.name)) : form.fields;
    return (
      <FormPreviewModal
        name={form.name}
        description={form.description ?? ''}
        fields={previewFields}
        onClose={() => setPreviewing(false)}
        onSend={handleGenerate}
      />
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
              ? `One link, covering all ${selectedPetIds.length} selected pets one after another.`
              : 'Select one or more to tie this link to specific pets -- leave none selected for a single general link.'}
          </div>
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
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose} disabled={generating}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handlePreview} disabled={generating}>
          {generating ? 'Generating…' : 'Preview'}
        </button>
      </div>
    </Modal>
  );
}
