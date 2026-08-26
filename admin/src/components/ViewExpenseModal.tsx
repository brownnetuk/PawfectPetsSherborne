import Modal from './Modal';
import type { Expense } from '../types';

interface Props {
  expense: Expense;
  onClose: () => void;
  onEdit: () => void;
}

function accountLabel(account: Expense['account']): string {
  if (!account) return '—';
  return typeof account === 'string' ? account : `${account.name} (${account.type === 'savings' ? 'Savings' : 'Bank'})`;
}

export default function ViewExpenseModal({ expense, onClose, onEdit }: Props) {
  return (
    <Modal title={expense.description} onClose={onClose}>
      <dl className="kv-grid">
        <dt>Date</dt>
        <dd>{new Date(expense.date).toLocaleDateString('en-GB')}</dd>
        <dt>Category</dt>
        <dd>{expense.category}</dd>
        <dt>Payee</dt>
        <dd>{expense.payee || '—'}</dd>
        <dt>Description</dt>
        <dd>{expense.description}</dd>
        <dt>Amount</dt>
        <dd style={{ fontWeight: 700 }}>£{expense.amount.toFixed(2)}</dd>
        <dt>Account</dt>
        <dd>{accountLabel(expense.account)}</dd>
      </dl>

      <div className="section-title">Receipt</div>
      {expense.receipt ? (
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
        <button type="button" className="btn btn-primary" onClick={onEdit}>
          Edit
        </button>
      </div>
    </Modal>
  );
}
