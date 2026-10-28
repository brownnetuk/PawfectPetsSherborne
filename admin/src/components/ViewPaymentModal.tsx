import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../api/client';
import Modal from './Modal';
import type { Invoice, OtherIncome, Payment } from '../types';
import { bankAccountTypeLabel } from '../utils/bankAccountType';

function accountLabel(account: Payment['account']): string {
  if (!account) return '(deleted account)';
  return typeof account === 'string' ? account : `${account.name} (${bankAccountTypeLabel(account.type)})`;
}

function invoiceId(invoice: Payment['invoice']): string | null {
  if (!invoice) return null;
  return typeof invoice === 'string' ? invoice : invoice._id;
}

function customerName(customer: Invoice['customer']): string {
  return typeof customer === 'string' ? '—' : customer.name;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB');
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
}

interface PaymentProps {
  payment: Payment;
  onClose: () => void;
  onSendReceipt?: () => void;
  onSendEmail?: () => void;
  onDelete?: () => void;
}

// Read-only view of one invoice payment. The table row only carries the
// invoice number, so the full invoice is fetched here for the customer and
// the invoice's totals.
export function ViewPaymentModal({ payment, onClose, onSendReceipt, onSendEmail, onDelete }: PaymentProps) {
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const id = invoiceId(payment.invoice);

  useEffect(() => {
    if (!id) return;
    api
      .getInvoice(id)
      .then(setInvoice)
      .catch((err) => setInvoiceError(err instanceof Error ? err.message : 'Failed to load the invoice'));
  }, [id]);

  const charges = payment.charges ?? 0;
  const invoiceNumber =
    payment.invoice && typeof payment.invoice !== 'string' ? payment.invoice.invoiceNumber : invoice?.invoiceNumber;
  const amountPaid = invoice?.amountPaid ?? 0;

  return (
    <Modal title={`Payment ${payment.paymentId}`} onClose={onClose}>
      <dl className="kv-grid">
        <dt>Payment ID</dt>
        <dd>{payment.paymentId}</dd>
        <dt>Date</dt>
        <dd>{formatDate(payment.date)}</dd>
        <dt>Invoice</dt>
        <dd>
          {id ? (
            <button type="button" className="btn-link" onClick={() => navigate(`/invoices?view=${id}`)}>
              {invoiceNumber ?? 'View invoice'}
            </button>
          ) : (
            '(deleted invoice)'
          )}
        </dd>
        <dt>Customer</dt>
        <dd>{invoice ? customerName(invoice.customer) : id && !invoiceError ? 'Loading…' : '—'}</dd>
        <dt>Payment Method</dt>
        <dd>{payment.paymentMethod || '—'}</dd>
        <dt>Account</dt>
        <dd>{accountLabel(payment.account)}</dd>
        <dt>Amount</dt>
        <dd style={{ fontWeight: 700 }}>£{payment.amount.toFixed(2)}</dd>
        <dt>Charges</dt>
        <dd>{charges ? `£${charges.toFixed(2)}` : '—'}</dd>
        {charges > 0 && (
          <>
            <dt>Net received</dt>
            <dd>£{(payment.amount - charges).toFixed(2)}</dd>
          </>
        )}
        <dt>Recorded</dt>
        <dd>{formatDateTime(payment.createdAt)}</dd>
      </dl>

      {id && (
        <>
          <div className="section-title">Invoice</div>
          {invoiceError ? (
            <p style={{ color: 'var(--muted)', margin: 0 }}>{invoiceError}</p>
          ) : !invoice ? (
            <p style={{ color: 'var(--muted)', margin: 0 }}>Loading…</p>
          ) : (
            <dl className="kv-grid">
              <dt>Issue date</dt>
              <dd>{formatDate(invoice.issueDate)}</dd>
              <dt>Status</dt>
              <dd style={{ textTransform: 'capitalize' }}>{invoice.status.replace(/_/g, ' ')}</dd>
              <dt>Invoice total</dt>
              <dd>£{invoice.total.toFixed(2)}</dd>
              <dt>Paid to date</dt>
              <dd>£{amountPaid.toFixed(2)}</dd>
              <dt>Balance</dt>
              <dd style={{ fontWeight: 700 }}>£{Math.max(0, invoice.total - amountPaid).toFixed(2)}</dd>
            </dl>
          )}
        </>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
        {onDelete && (
          <button type="button" className="btn btn-danger" onClick={onDelete}>
            Delete
          </button>
        )}
        {onSendEmail && (
          <button type="button" className="btn btn-secondary" onClick={onSendEmail}>
            Email
          </button>
        )}
        {onSendReceipt && (
          <button type="button" className="btn btn-primary" onClick={onSendReceipt}>
            Send receipt
          </button>
        )}
      </div>
    </Modal>
  );
}

interface OtherIncomeProps {
  income: OtherIncome;
  onClose: () => void;
  onDelete?: () => void;
}

export function ViewOtherIncomeModal({ income, onClose, onDelete }: OtherIncomeProps) {
  return (
    <Modal title="Other income" onClose={onClose}>
      <dl className="kv-grid">
        <dt>Date</dt>
        <dd>{formatDate(income.date)}</dd>
        <dt>Received from</dt>
        <dd>{income.receivedFrom}</dd>
        <dt>Description</dt>
        <dd>{income.description || '—'}</dd>
        <dt>Account</dt>
        <dd>{accountLabel(income.account)}</dd>
        <dt>Amount</dt>
        <dd style={{ fontWeight: 700 }}>£{income.amount.toFixed(2)}</dd>
        <dt>Recorded</dt>
        <dd>{formatDateTime(income.createdAt)}</dd>
      </dl>

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
        {onDelete && (
          <button type="button" className="btn btn-danger" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </Modal>
  );
}
