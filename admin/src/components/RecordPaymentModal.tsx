import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { BankAccount, Invoice, PaymentMethod } from '../types';

interface Props {
  invoice: Invoice;
  onClose: () => void;
  onSaved: () => void;
}

export default function RecordPaymentModal({ invoice, onClose, onSaved }: Props) {
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [charges, setCharges] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [account, setAccount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listBankAccounts().then((list) => {
      setAccounts(list);
      if (list.length > 0) setAccount((cur) => cur || list[0]._id);
    });
    api.listPaymentMethods().then((list) => {
      setMethods(list);
      if (list.length > 0) setPaymentMethod((cur) => cur || list[0].name);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createPayment({
        invoice: invoice._id,
        date,
        amount: Number(amount),
        charges: charges ? Number(charges) : undefined,
        paymentMethod: paymentMethod || undefined,
        account,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record this payment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Record Payment" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Date *</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required autoFocus />
        </div>
        <div className="field-row">
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
            <label>Charges (£)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={charges}
              onChange={(e) => setCharges(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>
        <div className="field">
          <label>Payment Method</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            {!methods || methods.length === 0 ? (
              <option value="">No payment methods set up</option>
            ) : (
              methods.map((m) => (
                <option key={m._id} value={m.name}>
                  {m.name}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="field">
          <label>Account *</label>
          <select value={account} onChange={(e) => setAccount(e.target.value)} required>
            {!accounts || accounts.length === 0 ? (
              <option value="">No bank accounts set up</option>
            ) : (
              accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} ({a.type === 'savings' ? 'Savings' : 'Bank'})
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
            {submitting ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
