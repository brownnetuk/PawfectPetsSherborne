import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { BankAccount, Invoice, PaymentMethod } from '../types';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

function customerName(customer: Invoice['customer']): string {
  return typeof customer === 'string' ? customer : customer.name;
}

export default function AddPaymentModal({ onClose, onSaved }: Props) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [invoiceId, setInvoiceId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [charges, setCharges] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [account, setAccount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listInvoices().then((list) => {
      setInvoices(list.filter((inv) => inv.status !== 'cancelled' && inv.total - (inv.amountPaid ?? 0) > 0));
    });
    api.listBankAccounts().then((list) => {
      setAccounts(list);
      if (list.length > 0) setAccount((cur) => cur || list[0]._id);
    });
    api.listPaymentMethods().then((list) => {
      setMethods(list);
      if (list.length > 0) setPaymentMethod((cur) => cur || list[0].name);
    });
  }, []);

  function handleInvoiceChange(id: string) {
    setInvoiceId(id);
    const invoice = invoices?.find((inv) => inv._id === id);
    if (invoice) {
      const balanceDue = invoice.total - (invoice.amountPaid ?? 0);
      setAmount(balanceDue > 0 ? balanceDue.toFixed(2) : '');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceId) {
      setError('Choose an invoice.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createPayment({
        invoice: invoiceId,
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
    <Modal title="Add payment" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Invoice *</label>
          <select value={invoiceId} onChange={(e) => handleInvoiceChange(e.target.value)} required autoFocus>
            <option value="" disabled>
              {!invoices ? 'Loading…' : invoices.length === 0 ? 'No invoices with a balance outstanding' : 'Select an invoice…'}
            </option>
            {invoices?.map((inv) => {
              const balanceDue = inv.total - (inv.amountPaid ?? 0);
              return (
                <option key={inv._id} value={inv._id}>
                  {inv.invoiceNumber} — {customerName(inv.customer)} — £{balanceDue.toFixed(2)} due
                </option>
              );
            })}
          </select>
        </div>
        <div className="field">
          <label>Date *</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
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
          <button type="submit" className="btn btn-primary" disabled={submitting || !account || !invoiceId}>
            {submitting ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
