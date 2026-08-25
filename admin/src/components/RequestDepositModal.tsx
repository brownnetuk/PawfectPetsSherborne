import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { Invoice } from '../types';

interface Props {
  invoice: Invoice;
  onClose: () => void;
  onSent: () => void;
}

export default function RequestDepositModal({ invoice, onClose, onSent }: Props) {
  const [depositPercentage, setDepositPercentage] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api
      .getBusinessInfo()
      .then((info) => setDepositPercentage(info.depositPercentage))
      .catch(() => setError('Failed to load the deposit percentage'));
  }, []);

  // Same cents-based rounding as InvoicesService.requestDeposit -- shown here
  // is just a preview; the backend recalculates its own authoritative amount
  // from the same Settings > Deposit percentage when the email actually sends.
  const depositAmount = depositPercentage !== null ? Math.round(invoice.total * depositPercentage) / 100 : null;

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      await api.requestDeposit(invoice._id);
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the deposit request');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal title="Send Deposit Request" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <p>
        Send a deposit request email for invoice <strong>{invoice.invoiceNumber}</strong>?
      </p>
      {depositAmount !== null && depositPercentage !== null ? (
        <p>
          Deposit amount:{' '}
          <strong>
            £{depositAmount.toFixed(2)} ({depositPercentage}% of £{invoice.total.toFixed(2)})
          </strong>
        </p>
      ) : (
        <div className="empty-state">Loading…</div>
      )}
      <p className="hint">The percentage is configured in Settings → Deposit.</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSend}
          disabled={sending || depositAmount === null}
        >
          {sending ? 'Sending…' : 'Send Deposit Request'}
        </button>
      </div>
    </Modal>
  );
}
