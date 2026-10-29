import { useEffect, useState } from 'react';
import * as api from '../api/client';
import DateInput from './DateInput';
import InvoicePaidPrompt, { isInvoicePaid } from './InvoicePaidPrompt';
import Modal from './Modal';
import PaymentThankYouPrompt, { canThankCustomer } from './PaymentThankYouPrompt';
import type { BankAccount, Invoice, Payment, PaymentMethod } from '../types';
import { bankAccountTypeLabel } from '../utils/bankAccountType';

interface Props {
  onClose: () => void;
  onSaved: () => void;
  // Pre-selects an invoice (and its outstanding balance) when opened from a
  // page that already knows which invoice a payment is against -- e.g. the
  // Boarding & Day Care booking detail's Invoice card -- instead of making
  // staff find it again in the dropdown below.
  initialInvoiceId?: string;
}

function customerName(customer: Invoice['customer']): string {
  return typeof customer === 'string' ? customer : customer.name;
}

export default function AddPaymentModal({ onClose, onSaved, initialInvoiceId }: Props) {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [depositPercentage, setDepositPercentage] = useState(20);
  const [invoiceId, setInvoiceId] = useState(initialInvoiceId ?? '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [isDeposit, setIsDeposit] = useState(false);
  const [charges, setCharges] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [account, setAccount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set once the payment is saved, to swap the form for the thank-you prompt.
  const [recorded, setRecorded] = useState<{ payment: Payment; invoice: Invoice } | null>(null);
  // The dropdown only lists invoices with a balance, so the only way to land
  // on a paid one is being opened for it (initialInvoiceId, e.g. from a
  // booking's Invoice card). That gets an "are you sure?" first.
  const [paidPrompt, setPaidPrompt] = useState<Invoice | null>(null);

  // Same £-via-cents rounding InvoicesService.requestDeposit() uses server-side,
  // against the invoice's total (not its remaining balance) -- matches what
  // "Request deposit" on a Boarding & Day Care booking already asks for.
  function depositAmountFor(invoice: Invoice): number {
    return Math.round(invoice.total * depositPercentage) / 100;
  }

  useEffect(() => {
    api.listInvoices().then((list) => {
      const withBalance = list.filter((inv) => inv.status !== 'cancelled' && inv.total - (inv.amountPaid ?? 0) > 0);
      const initial = initialInvoiceId ? list.find((inv) => inv._id === initialInvoiceId) : undefined;
      // Keep the pre-selected invoice in the list even when it's already paid,
      // so the selection shows -- after the paid prompt has been answered.
      if (initial && !withBalance.some((inv) => inv._id === initial._id)) withBalance.unshift(initial);
      setInvoices(withBalance);
      if (initial) {
        const balance = initial.total - (initial.amountPaid ?? 0);
        setAmount(balance > 0 ? balance.toFixed(2) : '');
        if (isInvoicePaid(initial)) setPaidPrompt(initial);
      }
    });
    api.listBankAccounts().then((list) => {
      setAccounts(list);
      if (list.length > 0) setAccount((cur) => cur || list[0]._id);
    });
    api.listPaymentMethods().then((list) => {
      setMethods(list);
      if (list.length > 0) setPaymentMethod((cur) => cur || list[0].name);
    });
    api.getBusinessInfo().then((info) => setDepositPercentage(info.depositPercentage));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleInvoiceChange(id: string) {
    setInvoiceId(id);
    const invoice = invoices?.find((inv) => inv._id === id);
    if (!invoice) return;
    if (isDeposit) {
      setAmount(depositAmountFor(invoice).toFixed(2));
    } else {
      const balanceDue = invoice.total - (invoice.amountPaid ?? 0);
      setAmount(balanceDue > 0 ? balanceDue.toFixed(2) : '');
    }
  }

  function handleIsDepositChange(checked: boolean) {
    setIsDeposit(checked);
    const invoice = invoices?.find((inv) => inv._id === invoiceId);
    if (!invoice) return;
    if (checked) {
      setAmount(depositAmountFor(invoice).toFixed(2));
    } else {
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
      const selected = invoices?.find((inv) => inv._id === invoiceId);
      const thank = !!selected && canThankCustomer(selected);
      const payment = await api.createPayment({
        invoice: invoiceId,
        date,
        amount: Number(amount),
        charges: charges ? Number(charges) : undefined,
        paymentMethod: paymentMethod || undefined,
        account,
        skipThankYouEmail: thank,
      });
      if (thank && selected) setRecorded({ payment, invoice: selected });
      else onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record this payment');
    } finally {
      setSubmitting(false);
    }
  }

  if (recorded) {
    return (
      <Modal title="Send Thank-You Email?" onClose={onSaved}>
        <PaymentThankYouPrompt payment={recorded.payment} invoice={recorded.invoice} onDone={onSaved} />
      </Modal>
    );
  }

  if (paidPrompt) {
    return <InvoicePaidPrompt invoice={paidPrompt} onCancel={onClose} onConfirm={() => setPaidPrompt(null)} />;
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
                  {inv.invoiceNumber} — {customerName(inv.customer)} —{' '}
                  {balanceDue > 0 ? `£${balanceDue.toFixed(2)} due` : 'paid'}
                </option>
              );
            })}
          </select>
        </div>
        <div className="field">
          <label>Date *</label>
          <DateInput value={date} onChange={setDate} required />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0', fontWeight: 400 }}>
          <input type="checkbox" checked={isDeposit} onChange={(e) => handleIsDepositChange(e.target.checked)} />
          Is deposit ({depositPercentage}% of the invoice total)
        </label>
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
              readOnly={isDeposit}
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
                  {a.name} ({bankAccountTypeLabel(a.type)})
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
