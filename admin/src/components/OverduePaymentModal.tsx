import { useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { Invoice } from '../types';

interface Props {
  invoice: Invoice;
  onClose: () => void;
  onSent: () => void;
}

// Outstanding balance on an invoice -- same cents-based rounding as
// InvoicesService.sendOverdueReminder, which recalculates its own
// authoritative figure when the email actually sends.
export function invoiceBalanceDue(invoice: Invoice): number {
  return Math.round((invoice.total - (invoice.amountPaid ?? 0)) * 100) / 100;
}

export default function OverduePaymentModal({ invoice, onClose, onSent }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const balanceDue = invoiceBalanceDue(invoice);

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      await api.sendOverdueReminder(invoice._id);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the overdue payment reminder');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal title="Send Overdue Payment Reminder" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <p>
        Email an overdue payment reminder for invoice <strong>{invoice.invoiceNumber}</strong>?
      </p>
      <p>
        Due date: <strong>{new Date(invoice.dueDate).toLocaleDateString('en-GB')}</strong>
        <br />
        Balance due: <strong>£{balanceDue.toFixed(2)}</strong>
        {(invoice.amountPaid ?? 0) > 0 && <> (of £{invoice.total.toFixed(2)})</>}
      </p>
      <p className="hint">The email uses the "Payment Overdue" template in Settings → Email Templates.</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSend} disabled={sending}>
          {sending ? 'Sending…' : 'Send Reminder'}
        </button>
      </div>
    </Modal>
  );
}
