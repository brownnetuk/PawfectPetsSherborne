import { useEffect, useState, type FormEvent } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { Expense } from '../types';
import { expenseReceiptName } from '../utils/receiptFile';

interface Props {
  expense: Expense;
  onClose: () => void;
  onSent: (to: string) => void;
}

function defaultMessage(expense: Expense, businessName: string): string {
  const details = [
    expense.payee,
    `£${expense.amount.toFixed(2)}`,
    new Date(expense.date).toLocaleDateString('en-GB'),
  ]
    .filter(Boolean)
    .join(', ');
  return `Hi,\n\nPlease find attached the receipt for ${expense.expenseId ? `expense ${expense.expenseId}` : 'this expense'} (${details}).\n\nKind regards,\n${businessName}`;
}

// Emails an expense's uploaded receipt (attached by the backend from the
// stored copy) to whoever is typed in -- e.g. an accountant.
export default function EmailExpenseModal({ expense, onClose, onSent }: Props) {
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState(
    ['Expense receipt', expense.expenseId, expense.payee && `– ${expense.payee}`].filter(Boolean).join(' '),
  );
  const [message, setMessage] = useState(() => defaultMessage(expense, 'PawfectPets Sherborne'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sign off with the business name from Settings once it's loaded, unless
  // the message has already been edited.
  useEffect(() => {
    api
      .getBusinessInfo()
      .then((info) => {
        if (!info.name) return;
        setMessage((current) =>
          current === defaultMessage(expense, 'PawfectPets Sherborne') ? defaultMessage(expense, info.name) : current,
        );
      })
      .catch(() => {});
  }, [expense]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.sendExpenseEmail(expense._id, { to: to.trim(), subject: subject.trim(), message });
      onSent(to.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send this email');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Email receipt" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>To *</label>
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} required autoFocus />
        </div>
        <div className="field">
          <label>Subject *</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </div>
        <div className="field">
          <label>Message</label>
          <textarea rows={7} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 12px', wordBreak: 'break-all' }}>
          Attachment: {expenseReceiptName(expense)}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
