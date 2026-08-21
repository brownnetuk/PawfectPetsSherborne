import { useEffect, useState } from 'react';
import * as api from '../api/client';
import BankAccountModal from '../components/BankAccountModal';
import Modal from '../components/Modal';
import ViewBankAccountModal from '../components/ViewBankAccountModal';
import { PencilIcon, TrashIcon } from '../components/icons';
import type { BankAccount, Payment } from '../types';

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

      {tab === 'payments' && <PaymentsCard />}
    </div>
  );
}

function invoiceLabel(invoice: Payment['invoice']): string {
  return typeof invoice === 'string' ? invoice : invoice.invoiceNumber;
}

function accountLabel(account: Payment['account']): string {
  return typeof account === 'string' ? account : account.name;
}

function PaymentsCard() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Payment | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refresh() {
    api
      .listPayments()
      .then(setPayments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load payments'));
  }
  useEffect(refresh, []);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deletePayment(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this payment');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Payments</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
        Recorded from an invoice's Actions menu.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {!payments || payments.length === 0 ? (
        <div className="empty-state">{payments === null ? 'Loading…' : 'No payments recorded yet.'}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Payment ID</th>
              <th>Date</th>
              <th>Invoice</th>
              <th>Amount</th>
              <th>Charges</th>
              <th>Payment Method</th>
              <th>Account</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p._id}>
                <td>{p.paymentId}</td>
                <td>{new Date(p.date).toLocaleDateString()}</td>
                <td>{invoiceLabel(p.invoice)}</td>
                <td>£{p.amount.toFixed(2)}</td>
                <td>{p.charges ? `£${p.charges.toFixed(2)}` : '—'}</td>
                <td>{p.paymentMethod || '—'}</td>
                <td>{accountLabel(p.account)}</td>
                <td>
                  <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => setDeleting(p)}>
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {deleting && (
        <Modal title="Delete payment?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently removes payment <strong>{deleting.paymentId}</strong> and restores its amount to the
            invoice's outstanding balance.
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
