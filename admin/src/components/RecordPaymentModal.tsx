import { useEffect, useState } from 'react';
import * as api from '../api/client';
import { DateReadout } from './DateTimeReadout';
import Modal from './Modal';
import type { BankAccount, Invoice, PaymentMethod } from '../types';
import { bankAccountTypeLabel } from '../utils/bankAccountType';

interface Props {
  invoice: Invoice;
  onClose: () => void;
  onSaved: () => void;
}

export default function RecordPaymentModal({ invoice, onClose, onSaved }: Props) {
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const balanceDue = invoice.total - (invoice.amountPaid ?? 0);
  const [amount, setAmount] = useState(balanceDue > 0 ? balanceDue.toFixed(2) : '');
  const [charges, setCharges] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [account, setAccount] = useState('');
  const [isDeposit, setIsDeposit] = useState(false);
  const [depositPercentage, setDepositPercentage] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listBankAccounts().then((list) => {
      setAccounts(list);
      if (list.length > 0) setAccount((cur) => cur || list[0]._id);
    });
    api.listPaymentMethods().then((list) => {
      setMethods(list);
      if (list.length > 0) setPaymentMethod((cur) => cur || list[0].name);
    });
    api.getBusinessInfo().then((info) => setDepositPercentage(info.depositPercentage)).catch(() => {});
  }, []);

  // Same cents-based rounding as InvoicesService.requestDeposit/
  // RequestDepositModal, so a deposit payment recorded here matches what a
  // deposit request email would have quoted for the same invoice.
  function handleIsDepositChange(checked: boolean) {
    setIsDeposit(checked);
    if (checked && depositPercentage !== null) {
      const depositAmount = Math.round(invoice.total * depositPercentage) / 100;
      setAmount(depositAmount.toFixed(2));
    } else if (!checked) {
      setAmount(balanceDue > 0 ? balanceDue.toFixed(2) : '');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.createPayment({
        invoice: invoice._id,
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
    <Modal title="Record Payment" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Date *</label>
          <input type="date" lang="en-GB" value={date} onChange={(e) => setDate(e.target.value)} required autoFocus />
          <DateReadout value={date} />
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={isDeposit}
              onChange={(e) => handleIsDepositChange(e.target.checked)}
              style={{ width: 'auto' }}
            />
            Is Deposit
          </label>
          <div className="field-hint" style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>
            Sets the amount to {depositPercentage ?? '…'}% of the invoice total (Settings &gt; Deposit).
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
          <button type="submit" className="btn btn-primary" disabled={submitting || !account}>
            {submitting ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
