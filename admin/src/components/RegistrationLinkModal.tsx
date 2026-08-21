import { useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';

// Shared by CustomersPage's "New customer" flow and EnquiriesPage's
// "Convert to Customer" flow -- both end up with a fresh customer record and
// a registration link to get to the customer, so they share this screen.
export default function RegistrationLinkModal({
  name,
  email,
  link,
  onDone,
}: {
  name: string;
  email: string;
  link: string;
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  async function sendEmail() {
    setSending(true);
    setSendResult(null);
    try {
      await api.sendTriggeredEmail('registration', email, name, link);
      setSendResult({ ok: true, message: `Email sent to ${email}.` });
    } catch (err) {
      setSendResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to send email' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal title="Send registration link" onClose={onDone}>
      <p style={{ color: 'var(--muted)' }}>
        {name}'s record is ready. Send them this link to complete their registration.
      </p>
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
        <button className="btn btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </Modal>
  );
}
