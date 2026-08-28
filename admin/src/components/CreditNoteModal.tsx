import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { BankAccount, Customer, Invoice } from '../types';
import { bankAccountTypeLabel } from '../utils/bankAccountType';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function CreditNoteModal({ onClose, onSaved }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [custId, setCustId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [account, setAccount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listCustomers().then(setCustomers).catch(() => {});
    api.listBankAccounts().then(setAccounts);
  }, []);

  // Re-fetch the invoice list whenever the chosen customer changes, and drop
  // any previously-chosen invoice that no longer belongs to them.
  useEffect(() => {
    setInvoiceId('');
    if (!custId) {
      setInvoices([]);
      return;
    }
    api.listInvoices(custId).then(setInvoices).catch(() => setInvoices([]));
  }, [custId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!custId) {
      setError('Choose a customer.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createCreditNote({
        customer: custId,
        invoice: invoiceId || undefined,
        date,
        amount: Number(amount),
        reason,
        account: account || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create this credit note');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New credit note" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Customer *</label>
          <select value={custId} onChange={(e) => setCustId(e.target.value)} required autoFocus>
            <option value="" disabled>
              Select a customer…
            </option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Invoice</label>
          <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} disabled={!custId}>
            <option value="">No invoice (standalone credit)</option>
            {invoices.map((inv) => (
              <option key={inv._id} value={inv._id}>
                {inv.invoiceNumber} — £{inv.total.toFixed(2)}
              </option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Date *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
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
        </div>
        <div className="field">
          <label>Reason *</label>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} required />
        </div>
        <div className="field">
          <label>Account</label>
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">No account</option>
            {accounts?.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name} ({bankAccountTypeLabel(a.type)})
              </option>
            ))}
          </select>
          <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
            Which account the refund came out of, if any.
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create credit note'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
