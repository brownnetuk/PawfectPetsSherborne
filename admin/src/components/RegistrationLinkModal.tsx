import { useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';

// Shared by CustomersPage's "New customer" flow, EnquiriesPage's "Convert to
// Customer" flow, and CustomerDetailPage's "Request Update" action -- all end
// up with a customer record and an intake link to send/copy, just with
// different wording and email trigger depending on which one it is.
export default function RegistrationLinkModal({
  name,
  email,
  link,
  trigger = 'registration',
  onDone,
}: {
  name: string;
  email: string;
  link: string;
  trigger?: 'registration' | 'update_info';
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
      await api.sendTriggeredEmail(trigger, email, name, link);
      setSendResult({ ok: true, message: `Email sent to ${email}.` });
    } catch (err) {
      setSendResult({ ok: false, message: err instanceof Error ? err.message : 'Failed to send email' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal title={trigger === 'update_info' ? 'Request an update' : 'Send registration link'} onClose={onDone}>
      <p style={{ color: 'var(--muted)' }}>
        {trigger === 'update_info'
          ? `Send ${name} this link so they can review and update their details -- it'll already have everything on file pre-filled in.`
          : `${name}'s record is ready. Send them this link to complete their registration.`}
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
