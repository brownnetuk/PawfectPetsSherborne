import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { Customer, FormRecord, FormSubmissionRecord } from '../types';
import Modal from './Modal';

const INTAKE_URL = import.meta.env.VITE_INTAKE_URL ?? 'http://localhost:5173';

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
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(existing ? `${INTAKE_URL}/forms/${existing._id}` : null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (customer || existing) return;
    api.listCustomers().then(setCustomers).catch(() => {});
  }, [customer, existing]);

  function handlePickCustomer(id: string) {
    setCustomerId(id);
    const picked = customers.find((c) => c._id === id);
    if (picked) {
      setName(picked.name);
      setEmail(picked.email);
    }
  }

  async function handleGenerate() {
    if (!email.trim()) {
      setError('Enter an email address.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const submission = await api.createFormSubmission({
        form: form._id,
        customer: customerId || undefined,
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
      await api.sendTriggeredEmail('form', email, name || email, link, customerId || undefined);
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
        <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating…' : 'Generate link'}
        </button>
      </div>
    </Modal>
  );
}
