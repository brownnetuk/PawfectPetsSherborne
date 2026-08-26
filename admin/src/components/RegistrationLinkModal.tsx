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
  customerId,
  trigger = 'registration',
  autoSent = false,
  onEmailSent,
  onDone,
}: {
  name: string;
  email: string;
  link: string;
  // Optional since CustomersPage/EnquiriesPage's brand-new-lead flows do have
  // a real customer id by this point, but nothing here strictly needs it --
  // when given, it's what lets the sent email carry a tracking pixel and get
  // an Activity entry at all (see SettingsService.sendTriggeredEmail).
  customerId?: string;
  trigger?: 'registration' | 'update_info';
  // True when the caller's backend call (CustomersService.createLead()) has
  // already fired this registration email itself, best-effort, before this
  // modal ever renders -- shows an upfront confirmation and relabels the
  // button "Resend" rather than "Send", so staff don't read a fresh "Send
  // email" click as the first (and now duplicate) send.
  autoSent?: boolean;
  // Fires after a successful send only, with the id of the "sent" Activity
  // entry the backend just created (if customerId was given) -- lets
  // CustomerDetailPage's "Request Update" flow attach a form snapshot to
  // that same entry without this shared modal needing to know anything
  // about PDFs itself.
  onEmailSent?: (entryId?: string) => void;
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
      const { entryId } = await api.sendTriggeredEmail(trigger, email, name, link, customerId);
      setSendResult({ ok: true, message: `Email sent to ${email}.` });
      onEmailSent?.(entryId);
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
          : `${name}'s record is ready.`}
      </p>
      {autoSent && !sendResult && (
        <div
          style={{
            background: 'var(--sage-badge)',
            color: 'var(--brand-green)',
            padding: '10px 14px',
            borderRadius: 8,
            marginBottom: 14,
            fontSize: '0.85rem',
            fontWeight: 500,
          }}
        >
          We've emailed {name} their registration link automatically.
        </div>
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
          {sending ? 'Sending…' : autoSent ? 'Resend email' : 'Send email'}
        </button>
        <button className="btn btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </Modal>
  );
}
