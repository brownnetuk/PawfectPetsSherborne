import { useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { DayBooking, Invoice, LineItem } from '../types';

function productIdOf(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product._id;
}
function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function formatDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Asked straight after NewBookingModal creates a booking: "Generate an
// invoice?" Yes builds one draft invoice from just the rows that were
// created (one line per product, same grouping as GenerateInvoicesModal) and
// links those rows to it, so the monthly Generate Invoices run skips them.
export default function BookingInvoicePrompt({
  customerId,
  bookings,
  onClose,
  onCreated,
}: {
  customerId: string;
  bookings: DayBooking[];
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Boarding pick-up-day placeholders are presence markers, never billed.
  const billable = bookings.filter((b) => !b.placeholder);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      const products = await api.listProducts();
      const productById = new Map(products.map((p) => [p._id, p]));
      const byProduct = new Map<string, LineItem>();
      for (const b of billable) {
        const pid = productIdOf(b.product);
        const product = productById.get(pid) ?? (typeof b.product === 'string' ? undefined : b.product);
        const existing = byProduct.get(pid);
        if (existing) existing.quantity += b.quantity;
        else
          byProduct.set(pid, {
            description: product?.name ?? 'Booking',
            quantity: b.quantity,
            unitPrice: product?.price ?? 0,
            discountPercent: 0,
          });
      }

      const dates = billable.map((b) => dateKey(new Date(b.date))).sort();
      const first = dates[0];
      const last = dates[dates.length - 1];
      const terms = await api.listInvoiceTerms();
      const defaultTerm = terms.find((t) => t.isDefault);

      // New invoices are always created as Draft by the backend.
      const invoice = await api.createInvoice({
        customer: customerId,
        lineItems: Array.from(byProduct.values()),
        issueDate: dateKey(new Date()),
        // Same as the monthly run: due on the last date the invoice covers.
        dueDate: last,
        paymentTerms: defaultTerm?.text,
        subject: first === last ? `Booking for ${formatDay(first)}` : `Booking ${formatDay(first)} – ${formatDay(last)}`,
      });
      for (const b of billable) {
        await api.updateDayBooking(b._id, { invoice: invoice._id });
      }
      onCreated(invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate the invoice');
      setBusy(false);
    }
  }

  return (
    <Modal title="Generate an invoice?" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <p>Create a draft invoice for this booking now? You can review and send it from Invoices.</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
          No
        </button>
        <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={busy}>
          {busy ? 'Generating…' : 'Yes, create draft'}
        </button>
      </div>
    </Modal>
  );
}
