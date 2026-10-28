import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { DayBooking, Invoice, LineItem, Product } from '../types';
import { travelProductForCustomer, travelUnitsForBookings, withTravelQuantity } from '../utils/travelLines';
import type { TravelUnits } from '../utils/travelLines';

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

// Invoices a new booking can still be added to: not paid or cancelled, and
// with something left to pay. Newest first.
export function openInvoicesFor(invoices: Invoice[], customerId: string): Invoice[] {
  return invoices
    .filter((inv) => {
      if (customerIdOf(inv.customer) !== customerId) return false;
      if (inv.status === 'paid' || inv.status === 'cancelled') return false;
      return !((inv.amountPaid ?? 0) > 0 && (inv.amountPaid ?? 0) >= inv.total);
    })
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
}

// -1 = issued before this month, 0 = this month, 1 = a later month.
export function issuedMonthOffset(invoice: Invoice, today = new Date()): -1 | 0 | 1 {
  const issued = new Date(invoice.issueDate);
  const diff = (issued.getFullYear() - today.getFullYear()) * 12 + (issued.getMonth() - today.getMonth());
  return diff < 0 ? -1 : diff > 0 ? 1 : 0;
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
// When the customer already has open invoices, staff can pick one instead
// and the new lines are added to it. Grouped as this month, later, earlier.
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
  // The customer's travel product and what these bookings would charge for
  // it, if they're travel-chargeable -- null while loading or not chargeable.
  const [travel, setTravel] = useState<{ product: Product; units: TravelUnits } | null>(null);
  // Walks only carry travel when staff tick it.
  const [walkTravel, setWalkTravel] = useState(false);

  // Boarding pick-up-day placeholders are presence markers, never billed.
  const billable = bookings.filter((b) => !b.placeholder);

  useEffect(() => {
    api
      .listInvoices(customerId)
      .then((invoices) => {
        const open = openInvoicesFor(invoices, customerId);
        setOpenInvoices(open);
        // Default to this month's latest -- the usual "add it to this month's
        // bill". Earlier and later ones are offered but never preselected.
        const thisMonth = open.find((inv) => issuedMonthOffset(inv) === 0);
        if (thisMonth) setTarget(thisMonth._id);
      })
      // Not being able to look is no reason to block creating a new one.
      .catch(() => setOpenInvoices([]));
    Promise.all([api.listProducts(), api.getCustomer(customerId), api.getVisitMapping()])
      .then(([products, customer, mapping]) => {
        const product = travelProductForCustomer(customer, products);
        if (product) setTravel({ product, units: travelUnitsForBookings(billable, mapping, product) });
      })
      // handleGenerate reloads these and reports any failure.
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      const [products, customer, mapping] = await Promise.all([
        api.listProducts(),
        api.getCustomer(customerId),
        api.getVisitMapping(),
      ]);
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
      // Travel is charged per Visit (2 x Visit -> 2 x Travel), plus per Walk
      // when ticked -- never for Day Care or Boarding, whatever travel rows
      // were booked alongside them.
      let lineItems = Array.from(byProduct.values());
      const travelProduct = travelProductForCustomer(customer, products);
      if (travelProduct) {
        const units = travelUnitsForBookings(billable, mapping, travelProduct);
        lineItems = withTravelQuantity(lineItems, travelProduct, units.visits + (walkTravel ? units.walks : 0));
      }

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
  const thisMonth = (openInvoices ?? []).filter((inv) => issuedMonthOffset(inv) === 0);
  // Soonest first.
  const later = (openInvoices ?? []).filter((inv) => issuedMonthOffset(inv) === 1).reverse();
  const earlier = (openInvoices ?? []).filter((inv) => issuedMonthOffset(inv) === -1);

  function invoiceOption(inv: Invoice) {
    return (
      <label key={inv._id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="radio"
          name="booking-invoice-target"
          checked={target === inv._id}
          onChange={() => setTarget(inv._id)}
          disabled={busy}
        />
        <span>
          Add to {inv.invoiceNumber} · {formatDay(dateKey(new Date(inv.issueDate)))} · £{inv.total.toFixed(2)} ·{' '}
          {inv.status}
          {inv.subject && <span style={{ color: 'var(--muted)' }}> · {inv.subject}</span>}
        </span>
      </label>
    );
  }
  const groupHeading: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)' };

  return (
    <Modal title={hasOpen ? 'Add to an invoice?' : 'Generate an invoice?'} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      {hasOpen ? (
        <>
          <p>
            This customer already has {openInvoices.length === 1 ? 'an open invoice' : `${openInvoices.length} open invoices`}.
            Add this booking to {openInvoices.length === 1 ? 'it' : 'one of them'}, or create a new draft?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0' }}>
            {thisMonth.length > 0 && <div style={groupHeading}>This month</div>}
            {thisMonth.map(invoiceOption)}
            {later.length > 0 && <div style={groupHeading}>Later months</div>}
            {later.map(invoiceOption)}
            {earlier.length > 0 && <div style={groupHeading}>Earlier</div>}
            {earlier.map(invoiceOption)}
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
      {travel && travel.units.walks > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: '8px 0' }}>
          <input type="checkbox" checked={walkTravel} onChange={(e) => setWalkTravel(e.target.checked)} disabled={busy} />
          <span>
            Add travel for walks ({travel.units.walks} × {travel.product.name})
          </span>
        </label>
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
