import { useEffect, useState } from 'react';
import * as api from '../api/client';
import AddPaymentModal from '../components/AddPaymentModal';
import BankTransferModal from '../components/BankTransferModal';
import CreditNoteModal from '../components/CreditNoteModal';
import ExpenseModal from '../components/ExpenseModal';
import Modal from '../components/Modal';
import ViewExpenseModal from '../components/ViewExpenseModal';
import { PencilIcon, TrashIcon } from '../components/icons';
import type { BankTransfer, CreditNote, Expense, Payment } from '../types';
import FinancialSnapshotTab from './FinancialSnapshotTab';

type Tab = 'snapshot' | 'payments' | 'expenses' | 'creditNotes' | 'bankTransfers';

const TAB_LABELS: Record<Tab, string> = {
  snapshot: 'Snapshot',
  payments: 'Payments',
  expenses: 'Expenses',
  creditNotes: 'Credit Notes',
  bankTransfers: 'Bank Transfers',
};

export default function FinancialPage() {
  const [tab, setTab] = useState<Tab>('snapshot');

  return (
    <div>
      <div className="page-header">
        <h1>Financial</h1>
      </div>

      <div className="tabs">
        {(['snapshot', 'payments', 'expenses', 'creditNotes', 'bankTransfers'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'snapshot' && <FinancialSnapshotTab />}
      {tab === 'payments' && <PaymentsCard />}
      {tab === 'expenses' && <ExpensesCard />}
      {tab === 'creditNotes' && <CreditNotesCard />}
      {tab === 'bankTransfers' && <BankTransfersCard />}
    </div>
  );
}

function invoiceLabel(invoice: Payment['invoice']): string {
  if (!invoice) return '(deleted invoice)';
  return typeof invoice === 'string' ? invoice : invoice.invoiceNumber;
}

function accountLabel(account: Payment['account']): string {
  if (!account) return '(deleted account)';
  return typeof account === 'string' ? account : account.name;
}

function PaymentsCard() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>Payments</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            Recorded from an invoice's Actions menu, or added directly against any invoice with a balance
            outstanding.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
          Add payment
        </button>
      </div>
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
                <td>{new Date(p.date).toLocaleDateString('en-GB')}</td>
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

      {showNew && (
        <AddPaymentModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            refresh();
          }}
        />
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

function expenseAccountLabel(account: Expense['account']): string {
  if (!account) return '—';
  return typeof account === 'string' ? account : account.name;
}

function ExpensesCard() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refresh() {
    api
      .listExpenses()
      .then(setExpenses)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load expenses'));
  }
  useEffect(refresh, []);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteExpense(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this expense');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>Expenses</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            Money going out — debited from an account's balance if one is chosen.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
          New expense
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!expenses || expenses.length === 0 ? (
        <div className="empty-state">{expenses === null ? 'Loading…' : 'No expenses recorded yet.'}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Payee</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Account</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e._id} onClick={() => setViewing(e)}>
                <td>{new Date(e.date).toLocaleDateString('en-GB')}</td>
                <td>{e.category}</td>
                <td>{e.payee || '—'}</td>
                <td>{e.description}</td>
                <td>£{e.amount.toFixed(2)}</td>
                <td>{expenseAccountLabel(e.account)}</td>
                <td onClick={(ev) => ev.stopPropagation()}>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button className="icon-btn" title="Edit" onClick={() => setEditing(e)}>
                      <PencilIcon />
                    </button>
                    <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => setDeleting(e)}>
                      <TrashIcon />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {viewing && (
        <ViewExpenseModal
          expense={viewing}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
        />
      )}

      {(showNew || editing) && (
        <ExpenseModal
          expense={editing}
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
        <Modal title="Delete expense?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently removes this expense{deleting.account ? ' and restores its amount to the account balance' : ''}.
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

function creditNoteCustomerLabel(customer: CreditNote['customer']): string {
  return typeof customer === 'string' ? customer : customer.name;
}

function creditNoteInvoiceLabel(invoice: CreditNote['invoice']): string {
  if (!invoice) return '—';
  return typeof invoice === 'string' ? invoice : invoice.invoiceNumber;
}

function CreditNotesCard() {
  const [creditNotes, setCreditNotes] = useState<CreditNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deleting, setDeleting] = useState<CreditNote | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refresh() {
    api
      .listCreditNotes()
      .then(setCreditNotes)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load credit notes'));
  }
  useEffect(refresh, []);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteCreditNote(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this credit note');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>Credit Notes</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            A formal record of a refund, with a reason — reduces the linked invoice's paid amount.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
          New credit note
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!creditNotes || creditNotes.length === 0 ? (
        <div className="empty-state">{creditNotes === null ? 'Loading…' : 'No credit notes issued yet.'}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Invoice</th>
              <th>Amount</th>
              <th>Reason</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {creditNotes.map((c) => (
              <tr key={c._id}>
                <td>{c.creditNoteNumber}</td>
                <td>{new Date(c.date).toLocaleDateString('en-GB')}</td>
                <td>{creditNoteCustomerLabel(c.customer)}</td>
                <td>{creditNoteInvoiceLabel(c.invoice)}</td>
                <td>£{c.amount.toFixed(2)}</td>
                <td>{c.reason}</td>
                <td>
                  <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => setDeleting(c)}>
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showNew && (
        <CreditNoteModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            refresh();
          }}
        />
      )}

      {deleting && (
        <Modal title="Delete credit note?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently removes credit note <strong>{deleting.creditNoteNumber}</strong> and reverses its
            effect on the linked invoice and account balance, if any.
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

function transferAccountLabel(account: BankTransfer['fromAccount']): string {
  if (!account) return '—';
  return typeof account === 'string' ? account : account.name;
}

function BankTransfersCard() {
  const [transfers, setTransfers] = useState<BankTransfer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deleting, setDeleting] = useState<BankTransfer | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refresh() {
    api
      .listBankTransfers()
      .then(setTransfers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bank transfers'));
  }
  useEffect(refresh, []);

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteBankTransfer(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this transfer');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <h2>Bank Transfers</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            Moves money between two of your own accounts -- deducted from the source and added to the
            destination.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
          New Transfer
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!transfers || transfers.length === 0 ? (
        <div className="empty-state">{transfers === null ? 'Loading…' : 'No bank transfers recorded yet.'}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Reference</th>
              <th>Source Account</th>
              <th>Destination Account</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t._id}>
                <td>{new Date(t.date).toLocaleDateString('en-GB')}</td>
                <td>{t.reference || '—'}</td>
                <td>{transferAccountLabel(t.fromAccount)}</td>
                <td>{transferAccountLabel(t.toAccount)}</td>
                <td>£{t.amount.toFixed(2)}</td>
                <td>
                  <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => setDeleting(t)}>
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showNew && (
        <BankTransferModal
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            refresh();
          }}
        />
      )}

      {deleting && (
        <Modal title="Delete this transfer?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently removes this transfer and reverses its effect on both accounts' balances.
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
