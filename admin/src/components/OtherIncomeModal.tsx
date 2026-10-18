import { useEffect, useState } from 'react';
import * as api from '../api/client';
import DateInput from './DateInput';
import Modal from './Modal';
import type { BankAccount } from '../types';
import { bankAccountTypeLabel } from '../utils/bankAccountType';

export interface OtherIncomeDraft {
  receivedFrom?: string;
  description?: string;
  amount?: number;
  account?: string;
}

interface Props {
  // Starting values, e.g. a refund generated from an expense. All editable.
  initial?: OtherIncomeDraft;
  title?: string;
  onClose: () => void;
  onSaved: () => void;
}

// Money received that isn't against an invoice -- refunds, bank interest and
// the like. Credits the chosen account's balance, see OtherIncomeService.
export default function OtherIncomeModal({ initial, title = 'Other Income', onClose, onSaved }: Props) {
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [receivedFrom, setReceivedFrom] = useState(initial?.receivedFrom ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [amount, setAmount] = useState(initial?.amount != null ? initial.amount.toFixed(2) : '');
  const [account, setAccount] = useState(initial?.account ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listBankAccounts().then((list) => {
      setAccounts(list);
      const preferred = list.find((a) => a.isDefault) ?? list[0];
      // Fall back to the default if the prefilled account no longer exists.
      if (preferred) setAccount((cur) => (cur && list.some((a) => a._id === cur) ? cur : preferred._id));
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createOtherIncome({
        date,
        receivedFrom: receivedFrom.trim(),
        description: description.trim() || undefined,
        amount: Number(amount),
        account,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record this income');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Date *</label>
          <DateInput value={date} onChange={setDate} required />
        </div>
        <div className="field">
          <label>Received from *</label>
          <input
            type="text"
            value={receivedFrom}
            onChange={(e) => setReceivedFrom(e.target.value)}
            placeholder="e.g. Monzo, HMRC, a supplier"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Interest, refund"
          />
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
        <div className="field">
          <label>Account *</label>
          <select value={account} onChange={(e) => setAccount(e.target.value)} required>
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
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !account}>
            {submitting ? 'Recording…' : 'Record Income'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
