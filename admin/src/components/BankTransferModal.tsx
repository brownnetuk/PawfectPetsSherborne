import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { BankAccount } from '../types';
import { bankAccountTypeLabel } from '../utils/bankAccountType';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function BankTransferModal({ onClose, onSaved }: Props) {
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listBankAccounts().then((list) => {
      setAccounts(list);
      if (list.length > 0) setFromAccount((cur) => cur || list[0]._id);
      if (list.length > 1) setToAccount((cur) => cur || list[1]._id);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (fromAccount === toAccount) {
      setError('Source and destination accounts must be different.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createBankTransfer({
        date,
        reference: reference || undefined,
        fromAccount,
        toAccount,
        amount: Number(amount),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record this transfer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New Transfer" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label>Date *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label>Reference</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. Move to savings"
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Source Account *</label>
            <select value={fromAccount} onChange={(e) => setFromAccount(e.target.value)} required>
              {!accounts || accounts.length === 0 ? (
                <option value="">No bank accounts set up</option>
              ) : (
                accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} ({bankAccountTypeLabel(a.type)})
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="field">
            <label>Destination Account *</label>
            <select value={toAccount} onChange={(e) => setToAccount(e.target.value)} required>
              {!accounts || accounts.length === 0 ? (
                <option value="">No bank accounts set up</option>
              ) : (
                accounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} ({bankAccountTypeLabel(a.type)})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Amount (£) *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !fromAccount || !toAccount}>
            {submitting ? 'Recording…' : 'Record Transfer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
