import Modal from './Modal';
import type { Invoice } from '../types';

// True once nothing is owed on the invoice: marked paid, or payments already
// cover the total. Recording another payment against it is almost always a
// mistake (double entry), so both payment dialogs ask first.
export function isInvoicePaid(invoice: Invoice): boolean {
  return invoice.status === 'paid' || (invoice.total > 0 && (invoice.amountPaid ?? 0) >= invoice.total);
}

interface Props {
  invoice: Invoice;
  onCancel: () => void;
  // Staff want to go ahead anyway (e.g. a genuine overpayment or a correction).
  onConfirm: () => void;
}

// Shown in place of Record Payment / Add payment when the chosen invoice is
// already paid: "Invoice paid -- make another payment?" The staff app shows
// the same question as a dialog before opening its payment sheet.
export default function InvoicePaidPrompt({ invoice, onCancel, onConfirm }: Props) {
  const paid = invoice.amountPaid ?? 0;
  return (
    <Modal title="Invoice already paid" onClose={onCancel}>
      <p>
        Invoice <strong>{invoice.invoiceNumber}</strong> has already been paid
        {paid > 0 && (
          <>
            {' '}
            (£{paid.toFixed(2)} received against £{invoice.total.toFixed(2)})
          </>
        )}
        .
      </p>
      <p>Do you want to record another payment against it anyway?</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          Make another payment
        </button>
      </div>
    </Modal>
  );
}
