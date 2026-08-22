import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import SetOpeningBalanceModal from './SetOpeningBalanceModal';
import { SettingsIcon } from './icons';
import type { BankAccount, BankTransaction } from '../types';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const TYPE_LABELS: Record<BankTransaction['type'], string> = {
  payment: 'Payment',
  expense: 'Expense',
  credit_note: 'Credit Note',
};

interface Props {
  account: BankAccount;
  onClose: () => void;
  /** Called after a successful opening-balance reconciliation, with the updated account. */
  onAccountUpdated?: (account: BankAccount) => void;
}

function typeLabel(type: BankAccount['type']): string {
  return type === 'savings' ? 'Savings' : 'Bank';
}

export default function ViewBankAccountModal({ account: initialAccount, onClose, onAccountUpdated }: Props) {
  const [account, setAccount] = useState(initialAccount);
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [transactions, setTransactions] = useState<BankTransaction[] | null>(null);
  const [periodOpeningBalance, setPeriodOpeningBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [settingBalance, setSettingBalance] = useState(false);

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 2 + i);

  function refreshTransactions() {
    setTransactions(null);
    api
      .getBankAccountTransactions(account._id, month + 1, year)
      .then((statement) => {
        setPeriodOpeningBalance(statement.openingBalance);
        setTransactions(statement.transactions);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load transactions'));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refreshTransactions, [account._id, month, year]);

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
          <button
            type="button"
            className="icon-btn"
            title="Set opening balance"
            onClick={() => setSettingBalance(true)}
          >
            <SettingsIcon />
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

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
          {!transactions ? (
            <tr>
              <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0' }}>
                Loading…
              </td>
            </tr>
          ) : transactions.length === 0 ? (
            <>
              <tr>
                <td>—</td>
                <td>Opening balance</td>
                <td></td>
                <td>£{periodOpeningBalance.toFixed(2)}</td>
              </tr>
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: '24px 0' }}>
                  No transactions for this period.
                </td>
              </tr>
            </>
          ) : (
            <>
              <tr>
                <td>—</td>
                <td>Opening balance</td>
                <td></td>
                <td>£{periodOpeningBalance.toFixed(2)}</td>
              </tr>
              {transactions.map((t, i) => (
                <tr key={i}>
                  <td>{new Date(t.date).toLocaleDateString()}</td>
                  <td>
                    {TYPE_LABELS[t.type]}: {t.description}
                  </td>
                  <td style={{ color: t.amount < 0 ? 'var(--error)' : 'var(--brand-green)' }}>
                    {t.amount < 0 ? '-' : '+'}£{Math.abs(t.amount).toFixed(2)}
                  </td>
                  <td>£{t.balance.toFixed(2)}</td>
                </tr>
              ))}
            </>
          )}
        </tbody>
      </table>

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>

      {settingBalance && (
        <SetOpeningBalanceModal
          account={account}
          onClose={() => setSettingBalance(false)}
          onSaved={(updated) => {
            setSettingBalance(false);
            setAccount(updated);
            onAccountUpdated?.(updated);
            refreshTransactions();
          }}
        />
      )}
    </Modal>
  );
}
