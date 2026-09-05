import { useState } from 'react';
import * as api from '../api/client';
import { DateReadout } from './DateTimeReadout';
import Modal from './Modal';
import type { BankAccount } from '../types';

interface Props {
  account: BankAccount;
  onClose: () => void;
  onSaved: (account: BankAccount) => void;
}

export default function SetOpeningBalanceModal({ account, onClose, onSaved }: Props) {
  const [date, setDate] = useState(
    account.openingBalanceDate
      ? account.openingBalanceDate.slice(0, 10)
      : new Date().toISOString().slice(0, 10),
  );
  const [balance, setBalance] = useState(
    String(account.openingBalance ?? account.currentBalance ?? 0),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.setBankAccountOpeningBalance(account._id, date, Number(balance));
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set the opening balance');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Set opening balance" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -6 }}>
        Reconcile this account against a real statement: as of the date below, what was the actual
        balance? Everything recorded on or after it is added on top to work out the current
        balance and each period's opening balance.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label>Date *</label>
            <input type="date" lang="en-GB" value={date} onChange={(e) => setDate(e.target.value)} required autoFocus />
            <DateReadout value={date} />
          </div>
          <div className="field">
            <label>Balance (£) *</label>
            <input
              type="number"
              step="0.01"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
