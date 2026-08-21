import { useEffect, useState } from 'react';
import * as api from '../api/client';
import BankAccountModal from '../components/BankAccountModal';
import Modal from '../components/Modal';
import NamedListCard from '../components/NamedListCard';
import ViewBankAccountModal from '../components/ViewBankAccountModal';
import { PencilIcon, TrashIcon } from '../components/icons';
import type { BankAccount } from '../types';

type Tab = 'bank' | 'payments';

export default function FinancialPage() {
  const [tab, setTab] = useState<Tab>('bank');

  return (
    <div>
      <div className="page-header">
        <h1>Financial</h1>
      </div>

      <div className="tabs">
        <button className={tab === 'bank' ? 'active' : ''} onClick={() => setTab('bank')}>
          Bank Account
        </button>
        <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>
          Payments
        </button>
      </div>

      {tab === 'bank' && <BankAccountsCard />}

      {tab === 'payments' && (
        <NamedListCard
          title="Payments"
          description="Amounts, dates, payment methods, and invoice links come in a later build."
          itemNoun="payment"
          namePlaceholder="e.g. Payment from James Brown"
          list={api.listPayments}
          create={api.createPayment}
          update={api.updatePayment}
          remove={api.deletePayment}
        />
      )}
    </div>
  );
}

function typeLabel(type: BankAccount['type']): string {
  return type === 'savings' ? 'Savings' : 'Bank';
}

function BankAccountsCard() {
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [viewing, setViewing] = useState<BankAccount | null>(null);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [deleting, setDeleting] = useState<BankAccount | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refresh() {
    api
      .listBankAccounts()
      .then(setAccounts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bank accounts'));
  }
  useEffect(refresh, []);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteBankAccount(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this bank account');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>Bank Accounts</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            Reconciliation and linking to payments come in a later build.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
          Create new
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!accounts || accounts.length === 0 ? (
        <div className="empty-state">{accounts === null ? 'Loading…' : 'No bank accounts yet.'}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Account Name</th>
              <th>Sort Code</th>
              <th>Account Number</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a._id} onClick={() => setViewing(a)}>
                <td>{typeLabel(a.type)}</td>
                <td>{a.name}</td>
                <td>{a.sortCode}</td>
                <td>{a.accountNumber}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button className="icon-btn" title="Edit" onClick={() => setEditing(a)}>
                      <PencilIcon />
                    </button>
                    <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => setDeleting(a)}>
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {viewing && <ViewBankAccountModal account={viewing} onClose={() => setViewing(null)} />}

      {(showNew || editing) && (
        <BankAccountModal
          account={editing}
          onClose={() => {
            setShowNew(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowNew(false);
            setEditing(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <Modal title="Delete bank account?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently removes <strong>{deleting.name}</strong>.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
