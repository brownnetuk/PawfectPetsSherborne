import { useEffect, useState } from 'react';
import * as api from '../api/client';
import DateRangeFilterBar, { currentMonthFilters, matchesSearch } from '../components/DateRangeFilterBar';
import SetOpeningBalanceModal from '../components/SetOpeningBalanceModal';
import { SettingsIcon, SortIcon } from '../components/icons';
import type { BankAccount, BankAccountStatement, BankTransaction } from '../types';
import { bankAccountTypeLabel } from '../utils/bankAccountType';

// Financial > Bank Accounts: a tile per account, and clicking one opens that
// account's statement (opening balance, every payment, other income, expense,
// credit note and transfer, with a running balance), like a bank's own.

function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function BankAccountsTab() {
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function refresh() {
    api
      .listBankAccounts()
      .then(setAccounts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bank accounts'));
  }
  useEffect(refresh, []);

  const selected = accounts?.find((a) => a._id === selectedId);
  if (selected) {
    return (
      <AccountStatement
        account={selected}
        onBack={() => setSelectedId(null)}
        onAccountUpdated={(updated) =>
          setAccounts((prev) => prev?.map((a) => (a._id === updated._id ? updated : a)) ?? prev)
        }
      />
    );
  }

  return (
    <div className="card">
      <h2>Bank Accounts</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
        Pick an account to see its statement. Accounts are added in Settings.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {!accounts ? (
        <div className="empty-state">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="empty-state">No bank accounts set up yet.</div>
      ) : (
        <div className="bank-tiles">
          {accounts.map((a) => {
            const balance = a.currentBalance ?? 0;
            return (
              <button key={a._id} type="button" className="bank-tile" onClick={() => setSelectedId(a._id)}>
                <div className="bank-tile-top">
                  <span className="badge badge-active">{bankAccountTypeLabel(a.type)}</span>
                  {a.isDefault && <span className="bank-tile-default">Default</span>}
                </div>
                <div className="bank-tile-name">{a.name}</div>
                <div className="bank-tile-details">
                  {[a.sortCode, a.accountNumber].filter(Boolean).join(' · ') || ' '}
                </div>
                <div className="bank-tile-balance-label">Current balance</div>
                <div className="bank-tile-balance" style={{ color: balance < 0 ? 'var(--error)' : undefined }}>
                  {money(balance)}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AccountStatement({
  account,
  onBack,
  onAccountUpdated,
}: {
  account: BankAccount;
  onBack: () => void;
  onAccountUpdated: (account: BankAccount) => void;
}) {
  const [filters, setFilters] = useState(currentMonthFilters);
  const [statement, setStatement] = useState<BankAccountStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newestFirst, setNewestFirst] = useState(true);
  const [settingBalance, setSettingBalance] = useState(false);

  function refresh() {
    setStatement(null);
    setError(null);
    api
      .getBankAccountStatement(account._id, filters.from, filters.to)
      .then(setStatement)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this statement'));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [account._id, filters.from, filters.to]);

  const transactions = statement?.transactions ?? [];
  const moneyIn = transactions.reduce((sum, t) => sum + (t.amount > 0 ? t.amount : 0), 0);
  const moneyOut = transactions.reduce((sum, t) => sum + (t.amount < 0 ? -t.amount : 0), 0);

  const visible = transactions.filter((t) =>
    matchesSearch(filters.search, [
      new Date(t.date).toLocaleDateString('en-GB'),
      t.label,
      t.party,
      t.reference,
      t.description,
      Math.abs(t.amount).toFixed(2),
    ]),
  );
  if (newestFirst) visible.reverse();

  const openingRow = statement && (
    <tr className="statement-opening">
      <td>{filters.from ? new Date(`${filters.from}T00:00:00`).toLocaleDateString('en-GB') : '—'}</td>
      <td></td>
      <td>
        <div className="statement-label">Opening balance</div>
      </td>
      <td></td>
      <td></td>
      <td className="num statement-balance">{money(statement.openingBalance)}</td>
    </tr>
  );

  return (
    <div className="card">
      <button type="button" className="btn-link" onClick={onBack} style={{ marginBottom: 10 }}>
        ← All bank accounts
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>{account.name}</h2>
          <div style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>
            {[bankAccountTypeLabel(account.type), account.sortCode, account.accountNumber].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>Current balance</div>
            <div
              style={{
                fontWeight: 700,
                fontSize: '1.2rem',
                color: (account.currentBalance ?? 0) < 0 ? 'var(--error)' : undefined,
              }}
            >
              {money(account.currentBalance ?? 0)}
            </div>
          </div>
          <button type="button" className="icon-btn" title="Set opening balance" onClick={() => setSettingBalance(true)}>
            <SettingsIcon />
          </button>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <DateRangeFilterBar
          filters={filters}
          onChange={setFilters}
          searchPlaceholder="Customer, payee, reference…"
          dates={[account.openingBalanceDate ?? account.createdAt]}
        />
      </div>

      {error && <div className="error-banner">{error}</div>}

      {statement && (
        <div className="statement-summary">
          <div>
            <span>Opening balance</span>
            <strong>{money(statement.openingBalance)}</strong>
          </div>
          <div>
            <span>Money in</span>
            <strong style={{ color: 'var(--brand-green)' }}>{money(moneyIn)}</strong>
          </div>
          <div>
            <span>Money out</span>
            <strong style={{ color: 'var(--error)' }}>{money(moneyOut)}</strong>
          </div>
          <div>
            <span>Closing balance</span>
            <strong>{money(statement.closingBalance)}</strong>
          </div>
        </div>
      )}

      <div className="statement-scroll">
        <table className="statement-table">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setNewestFirst((v) => !v)}>
                Date
                <SortIcon direction={newestFirst ? 'desc' : 'asc'} />
              </th>
              <th>Reference#</th>
              <th>Type</th>
              <th className="num">Deposits</th>
              <th className="num">Withdrawals</th>
              <th className="num">Running balance</th>
            </tr>
          </thead>
          <tbody>
            {!statement ? (
              <tr>
                <td colSpan={6} className="empty-state">
                  {error ? 'Could not load this statement.' : 'Loading…'}
                </td>
              </tr>
            ) : (
              <>
                {!newestFirst && openingRow}
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-state">
                      {transactions.length === 0 ? 'No transactions in this period.' : 'No transactions match this search.'}
                    </td>
                  </tr>
                )}
                {visible.map((t, i) => (
                  <StatementRow key={i} t={t} />
                ))}
                {newestFirst && openingRow}
              </>
            )}
          </tbody>
        </table>
      </div>

      {settingBalance && (
        <SetOpeningBalanceModal
          account={account}
          onClose={() => setSettingBalance(false)}
          onSaved={(updated) => {
            setSettingBalance(false);
            onAccountUpdated(updated);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function StatementRow({ t }: { t: BankTransaction }) {
  return (
    <tr>
      <td style={{ whiteSpace: 'nowrap' }}>{new Date(t.date).toLocaleDateString('en-GB')}</td>
      <td style={{ color: 'var(--muted)' }}>{t.reference || ''}</td>
      <td>
        <div className="statement-label">{t.label}</div>
        {t.party && <div className="statement-party">{t.party}</div>}
      </td>
      <td className="num">{t.amount > 0 ? money(t.amount) : ''}</td>
      <td className="num">{t.amount < 0 ? money(-t.amount) : ''}</td>
      <td className="num statement-balance" style={{ color: t.balance < 0 ? 'var(--error)' : undefined }}>
        {money(t.balance)}
      </td>
    </tr>
  );
}
