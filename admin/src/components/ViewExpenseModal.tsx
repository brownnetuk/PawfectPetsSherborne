import { useEffect, useMemo } from 'react';
import Modal from './Modal';
import type { Expense } from '../types';
import { bankAccountTypeLabel } from '../utils/bankAccountType';
import { dataUriToBlob, downloadReceipt, expenseReceiptName, isPdfReceipt } from '../utils/receiptFile';

interface Props {
  expense: Expense;
  onClose: () => void;
  // Left out where the modal is read-only (e.g. a report's drill-down).
  onEdit?: () => void;
  onRefund?: () => void;
  onEmail?: () => void;
}

function accountLabel(account: Expense['account']): string {
  if (!account) return '—';
  return typeof account === 'string' ? account : `${account.name} (${bankAccountTypeLabel(account.type)})`;
}

// Browsers won't render a data: PDF in an iframe reliably, so it's shown via
// a local object URL instead (same approach as TrainingPdfViewer).
function PdfReceipt({ dataUri }: { dataUri: string }) {
  const url = useMemo(() => URL.createObjectURL(dataUriToBlob(dataUri)), [dataUri]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <iframe
      src={url}
      title="Receipt"
      style={{ width: '100%', height: 480, border: '1px solid var(--border)', borderRadius: 8 }}
    />
  );
}

export default function ViewExpenseModal({ expense, onClose, onEdit, onRefund, onEmail }: Props) {
  const receiptName = expenseReceiptName(expense);
  return (
    <Modal title={expense.description || expense.category} onClose={onClose}>
      <dl className="kv-grid">
        <dt>Expense ID</dt>
        <dd>{expense.expenseId || '—'}</dd>
        <dt>Date</dt>
        <dd>{new Date(expense.date).toLocaleDateString('en-GB')}</dd>
        <dt>Category</dt>
        <dd>{expense.category}</dd>
        <dt>Payee</dt>
        <dd>{expense.payee || '—'}</dd>
        <dt>Payment Method</dt>
        <dd>{expense.paymentMethod || '—'}</dd>
        <dt>Reference</dt>
        <dd>{expense.reference || '—'}</dd>
        <dt>Description</dt>
        <dd>{expense.description || '—'}</dd>
        <dt>Amount</dt>
        <dd style={{ fontWeight: 700 }}>£{expense.amount.toFixed(2)}</dd>
        <dt>Account</dt>
        <dd>{accountLabel(expense.account)}</dd>
      </dl>

      <div className="section-title">Receipt</div>
      {expense.receipt && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ fontSize: '0.85rem', wordBreak: 'break-all' }}>{receiptName}</span>
          <button type="button" className="btn-link" onClick={() => downloadReceipt(expense.receipt!, receiptName)}>
            Download
          </button>
        </div>
      )}
      {expense.receipt && isPdfReceipt(expense.receipt) ? (
        <PdfReceipt dataUri={expense.receipt} />
      ) : expense.receipt ? (
        <img
          src={expense.receipt}
          alt="Receipt"
          style={{
            width: '100%',
            maxHeight: 480,
            objectFit: 'contain',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
          }}
        />
      ) : (
        <p style={{ color: 'var(--muted)', margin: 0 }}>No receipt uploaded.</p>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
        {onEmail && expense.receipt && (
          <button type="button" className="btn btn-secondary" onClick={onEmail}>
            Email
          </button>
        )}
        {onRefund && (
          <button type="button" className="btn btn-secondary" onClick={onRefund}>
            Refund
          </button>
        )}
        {onEdit && (
          <button type="button" className="btn btn-primary" onClick={onEdit}>
            Edit
          </button>
        )}
      </div>
    </Modal>
  );
}
