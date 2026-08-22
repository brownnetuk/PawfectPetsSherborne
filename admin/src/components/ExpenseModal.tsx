import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { BankAccount, Expense, ExpenseCategory } from '../types';

interface Props {
  expense: Expense | null;
  onClose: () => void;
  onSaved: () => void;
}

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
  { value: 'insurance', label: 'Insurance' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'vehicle_fuel', label: 'Vehicle / Fuel' },
  { value: 'veterinary', label: 'Veterinary' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'professional_fees', label: 'Professional Fees' },
  { value: 'other', label: 'Other' },
];

const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

function accountId(account: Expense['account']): string {
  if (!account) return '';
  return typeof account === 'string' ? account : account._id;
}

export default function ExpenseModal({ expense, onClose, onSaved }: Props) {
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [date, setDate] = useState(expense ? expense.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'other');
  const [payee, setPayee] = useState(expense?.payee ?? '');
  const [description, setDescription] = useState(expense?.description ?? '');
  const [amount, setAmount] = useState(expense ? String(expense.amount) : '');
  const [account, setAccount] = useState(expense ? accountId(expense.account) : '');
  const [receipt, setReceipt] = useState(expense?.receipt ?? '');
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listBankAccounts().then(setAccounts);
  }, []);

  function handleReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setReceiptError(null);
    if (!file.type.startsWith('image/')) {
      setReceiptError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setReceiptError('That receipt is too large — please use one under 4MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setReceipt(reader.result as string);
    reader.onerror = () => setReceiptError('Failed to read that file.');
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const input = {
        date,
        category,
        payee: payee || undefined,
        description,
        amount: Number(amount),
        account: account || undefined,
        receipt: receipt || undefined,
      };
      if (expense) {
        await api.updateExpense(expense._id, input);
      } else {
        await api.createExpense(input);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save this expense');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={expense ? 'Edit expense' : 'New expense'} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label>Date *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required autoFocus />
          </div>
          <div className="field">
            <label>Category *</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)} required>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Payee</label>
          <input type="text" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Who was paid" />
        </div>
        <div className="field">
          <label>Description *</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} required />
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
            <label>Account</label>
            <select value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">No account</option>
              {accounts?.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name} ({a.type === 'savings' ? 'Savings' : 'Bank'})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Receipt</label>
          {receipt ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <img
                src={receipt}
                alt="Receipt"
                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }}
              />
              <button type="button" className="btn-link" onClick={() => setReceipt('')}>
                Remove
              </button>
            </div>
          ) : (
            <input type="file" accept="image/*" onChange={handleReceiptChange} />
          )}
          {receiptError && (
            <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--error)', marginTop: 4 }}>
              {receiptError}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : expense ? 'Save changes' : 'Create expense'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
