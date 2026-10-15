import { useState } from 'react';
import * as api from '../api/client';
import DateInput from './DateInput';
import Modal from './Modal';
import type { BankAccount, BankAccountType } from '../types';

interface Props {
  account: BankAccount | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function BankAccountModal({ account, onClose, onSaved }: Props) {
  const [type, setType] = useState<BankAccountType>(account?.type ?? 'bank');
  const [name, setName] = useState(account?.name ?? '');
  const [sortCode, setSortCode] = useState(account?.sortCode ?? '');
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? '');
  const [isDefault, setIsDefault] = useState(account?.isDefault ?? false);
  // One-time set: once an account has an opening balance it shows read-only
  // here. Re-anchoring against a later statement is still possible through
  // ViewBankAccountModal's reconcile gear (SetOpeningBalanceModal).
  const openingBalanceLocked = !!account?.openingBalanceDate;
  const [openingBalance, setOpeningBalance] = useState('');
  const [openingBalanceDate, setOpeningBalanceDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!openingBalanceLocked && (openingBalance === '') !== (openingBalanceDate === '')) {
      setError('Enter both an opening balance and its date, or leave both blank.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input = { type, name, sortCode, accountNumber, isDefault };
      const saved = account
        ? await api.updateBankAccount(account._id, input)
        : await api.createBankAccount(input);
      if (!openingBalanceLocked && openingBalance !== '' && openingBalanceDate !== '') {
        await api.setBankAccountOpeningBalance(saved._id, openingBalanceDate, Number(openingBalance));
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save this bank account');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={account ? 'Edit Account' : 'New Account'} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as BankAccountType)}>
            <option value="bank">Bank</option>
            <option value="savings">Savings</option>
            <option value="pot">Pot</option>
          </select>
        </div>
        <div className="field">
          <label>Account Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Business Current Account"
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label>Sort Code</label>
          <input
            type="text"
            value={sortCode}
            onChange={(e) => setSortCode(e.target.value)}
            placeholder="e.g. 12-34-56"
            required
          />
        </div>
        <div className="field">
          <label>Account Number</label>
          <input
            type="text"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="e.g. 12345678"
            required
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Opening Balance (£)</label>
            {openingBalanceLocked ? (
              <input type="text" value={`£${(account?.openingBalance ?? 0).toFixed(2)}`} readOnly disabled />
            ) : (
              <input
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0.00"
              />
            )}
          </div>
          <div className="field">
            <label>Opening Balance Date</label>
            {openingBalanceLocked ? (
              <input
                type="text"
                value={new Date(account!.openingBalanceDate!).toLocaleDateString('en-GB')}
                readOnly
                disabled
              />
            ) : (
              <DateInput value={openingBalanceDate} onChange={setOpeningBalanceDate} />
            )}
          </div>
        </div>
        <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: -8, marginBottom: 12 }}>
          {openingBalanceLocked
            ? 'Set once and locked.'
            : 'Can only be set once. Leave blank to start from £0.'}
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              style={{ width: 'auto' }}
            />
            Default
          </label>
          <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
            Pre-selected on all new expenses.
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : account ? 'Save changes' : 'Create Account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
