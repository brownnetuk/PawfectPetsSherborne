import { useState } from 'react';
import * as api from '../api/client';
import type { Invoice, Payment } from '../types';

interface Props {
  payment: Payment;
  // The invoice as it was *before* this payment was applied.
  invoice: Invoice;
  onDone: () => void;
}

// True when the invoice's customer has an email address to thank -- callers
// skip the prompt entirely otherwise.
export function canThankCustomer(invoice: Invoice): boolean {
  return typeof invoice.customer !== 'string' && !!invoice.customer?.email;
}

// Shown in place of the Record Payment / Add payment form once a payment has
// been saved (with skipThankYouEmail, so nothing has gone out yet): asks
// whether to send the customer the "Thank You for Payment" email, via the same
// POST /payments/:id/send-email the Financial page's resend uses.
export default function PaymentThankYouPrompt({ payment, invoice, onDone }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const customer = typeof invoice.customer === 'string' ? null : invoice.customer;
  // Same cents-based rounding as PaymentsService.paymentEmailVars, which
  // works out the authoritative figure when the email actually sends.
  const balanceLeft = Math.round((invoice.total - (invoice.amountPaid ?? 0) - payment.amount) * 100) / 100;

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      await api.sendPaymentReceivedEmail(payment._id);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the thank-you email');
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      <p>
        Payment of <strong>£{payment.amount.toFixed(2)}</strong> recorded on invoice{' '}
        <strong>{invoice.invoiceNumber}</strong>.
      </p>
      <p>
        Send {customer?.name ?? 'the customer'} a "Thank you for your payment" email
        {customer?.email && <> to <strong>{customer.email}</strong></>}?
      </p>
      <p>
        Amount paid: <strong>£{payment.amount.toFixed(2)}</strong>
        <br />
        {balanceLeft > 0 ? (
          <>
            Balance remaining: <strong>£{balanceLeft.toFixed(2)}</strong>
          </>
        ) : (
          <strong>Invoice paid in full</strong>
        )}
      </p>
      <p className="hint">The email uses the "Thank You for Payment" template in Settings → Email Templates.</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onDone} disabled={sending}>
          No thanks
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSend} disabled={sending}>
          {sending ? 'Sending…' : 'Send Email'}
        </button>
      </div>
    </>
  );
}
