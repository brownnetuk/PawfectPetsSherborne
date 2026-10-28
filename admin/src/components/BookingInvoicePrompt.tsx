import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { DayBooking, Invoice, LineItem } from '../types';
import { applyTravelLine, travelProductForCustomer } from '../utils/travelLines';

function productIdOf(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product._id;
}
function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function customerIdOf(customer: Invoice['customer']): string {
  return typeof customer === 'string' ? customer : customer._id;
}
function formatDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Invoices a new booking can still be added to: issued this calendar month,
// not paid or cancelled, and with something left to pay.
export function openInvoicesThisMonth(invoices: Invoice[], customerId: string, today = new Date()): Invoice[] {
  return invoices
    .filter((inv) => {
      if (customerIdOf(inv.customer) !== customerId) return false;
      if (inv.status === 'paid' || inv.status === 'cancelled') return false;
      if ((inv.amountPaid ?? 0) > 0 && (inv.amountPaid ?? 0) >= inv.total) return false;
      const issued = new Date(inv.issueDate);
      return issued.getFullYear() === today.getFullYear() && issued.getMonth() === today.getMonth();
    })
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate));
}

// Folds the new booking's lines into an invoice's existing ones: a line for
// the same item at the same price (and no discount) just gains quantity,
// anything else is appended.
export function mergeLineItems(existing: LineItem[], added: LineItem[]): LineItem[] {
  const merged = existing.map((li) => ({ ...li }));
  for (const item of added) {
    const match = merged.find(
      (li) => li.description === item.description && li.unitPrice === item.unitPrice && !li.discountPercent
    );
    if (match) match.quantity += item.quantity;
    else merged.push({ ...item });
  }
  return merged;
}

// Asked straight after NewBookingModal creates a booking: "Generate an
// invoice?" Yes builds one draft invoice from just the rows that were
// created (one line per product, same grouping as GenerateInvoicesModal) and
// links those rows to it, so the monthly Generate Invoices run skips them.
// When the customer already has an open invoice issued this month, staff can
// pick it instead and the new lines are added to that invoice.
export default function BookingInvoicePrompt({
  customerId,
  bookings,
  onClose,
  onCreated,
}: {
  customerId: string;
  bookings: DayBooking[];
  onClose: () => void;
  onCreated: (invoice: Invoice, addedToExisting: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null while loading.
  const [openInvoices, setOpenInvoices] = useState<Invoice[] | null>(null);
  // The invoice to add to, or '' to create a new one.
  const [target, setTarget] = useState('');

  // Boarding pick-up-day placeholders are presence markers, never billed.
  const billable = bookings.filter((b) => !b.placeholder);

  useEffect(() => {
    api
      .listInvoices(customerId)
      .then((invoices) => {
        const open = openInvoicesThisMonth(invoices, customerId);
        setOpenInvoices(open);
        // Default to the most recent one -- the usual "add it to this month's bill".
        if (open.length > 0) setTarget(open[open.length - 1]._id);
      })
      // Not being able to look is no reason to block creating a new one.
      .catch(() => setOpenInvoices([]));
  }, [customerId]);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      const [products, customer] = await Promise.all([api.listProducts(), api.getCustomer(customerId)]);
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
      // Travel follows the other products' quantity (2 x Visit -> 2 x Travel).
      const lineItems = applyTravelLine(Array.from(byProduct.values()), travelProductForCustomer(customer, products), products);

      const dates = billable.map((b) => dateKey(new Date(b.date))).sort();
      const first = dates[0];
      const last = dates[dates.length - 1];

      let invoice: Invoice;
      const existingInvoice = openInvoices?.find((inv) => inv._id === target);
      if (existingInvoice) {
        // Re-read it so lines added since the list loaded aren't lost.
        const current = await api.getInvoice(existingInvoice._id);
        const currentDue = dateKey(new Date(current.dueDate));
        invoice = await api.updateInvoice(current._id, {
          lineItems: mergeLineItems(current.lineItems, lineItems),
          // Still due on the last date it covers, if the new booking runs later.
          ...(last > currentDue ? { dueDate: last } : {}),
        });
      } else {
        const terms = await api.listInvoiceTerms();
        const defaultTerm = terms.find((t) => t.isDefault);
        // New invoices are always created as Draft by the backend.
        invoice = await api.createInvoice({
          customer: customerId,
          lineItems,
          issueDate: dateKey(new Date()),
          // Same as the monthly run: due on the last date the invoice covers.
          dueDate: last,
          paymentTerms: defaultTerm?.text,
          subject: first === last ? `Booking for ${formatDay(first)}` : `Booking ${formatDay(first)} – ${formatDay(last)}`,
        });
      }
      for (const b of billable) {
        await api.updateDayBooking(b._id, { invoice: invoice._id });
      }
      onCreated(invoice, !!existingInvoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate the invoice');
      setBusy(false);
    }
  }

  const hasOpen = !!openInvoices && openInvoices.length > 0;
  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });

  return (
    <Modal title={hasOpen ? 'Add to an invoice?' : 'Generate an invoice?'} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      {hasOpen ? (
        <>
          <p>
            This customer already has {openInvoices.length === 1 ? 'an invoice' : `${openInvoices.length} invoices`} from{' '}
            {monthName}. Add this booking to {openInvoices.length === 1 ? 'it' : 'one of them'}, or create a new draft?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
            {openInvoices.map((inv) => (
              <label key={inv._id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="booking-invoice-target"
                  checked={target === inv._id}
                  onChange={() => setTarget(inv._id)}
                  disabled={busy}
                />
                <span>
                  Add to {inv.invoiceNumber} · £{inv.total.toFixed(2)} · {inv.status}
                  {inv.subject && <span style={{ color: 'var(--muted)' }}> · {inv.subject}</span>}
                </span>
              </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="booking-invoice-target"
                checked={target === ''}
                onChange={() => setTarget('')}
                disabled={busy}
              />
              <span>Create a new draft invoice</span>
            </label>
          </div>
          {openInvoices.find((inv) => inv._id === target)?.status === 'sent' && (
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              That invoice has already been sent, so the customer will be told it has been updated.
            </p>
          )}
        </>
      ) : (
        <p>Create a draft invoice for this booking now? You can review and send it from Invoices.</p>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
          {hasOpen ? 'Not now' : 'No'}
        </button>
        <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={busy || openInvoices === null}>
          {busy
            ? target && hasOpen
              ? 'Adding…'
              : 'Generating…'
            : openInvoices === null
              ? 'Checking invoices…'
              : target && hasOpen
                ? 'Add to invoice'
                : hasOpen
                  ? 'Create new draft'
                  : 'Yes, create draft'}
        </button>
      </div>
    </Modal>
  );
}
