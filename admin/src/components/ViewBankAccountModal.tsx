import { useState } from 'react';
import Modal from './Modal';
import { SettingsIcon } from './icons';
import type { BankAccount } from '../types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface Props {
  account: BankAccount;
  onClose: () => void;
}

function typeLabel(type: BankAccount['type']): string {
  return type === 'savings' ? 'Savings' : 'Bank';
}

export default function ViewBankAccountModal({ account, onClose }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <Modal title={account.name} onClose={onClose} wide>
      <div className="section-title">Account Details</div>
      <dl className="kv-grid">
        <dt>Type</dt>
        <dd>{typeLabel(account.type)}</dd>
        <dt>Account Name</dt>
        <dd>{account.name}</dd>
        <dt>Sort Code</dt>
        <dd>{account.sortCode}</dd>
        <dt>Account Number</dt>
        <dd>{account.accountNumber}</dd>
        <dt>Current Balance</dt>
        <dd style={{ color: 'var(--brand-green)', fontWeight: 700 }}>
          £{(account.currentBalance ?? 0).toFixed(2)}
        </dd>
      </dl>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 24,
          gap: 12,
        }}
      >
        <div className="section-title" style={{ marginBottom: 0 }}>
          Transactions
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ width: 'auto' }}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 'auto' }}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button type="button" className="icon-btn" title="Transaction settings">
            <SettingsIcon />
          </button>
        </div>
      </div>

      <table style={{ marginTop: 10 }}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0' }}>
              No transactions for this period.
            </td>
          </tr>
        </tbody>
      </table>

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
