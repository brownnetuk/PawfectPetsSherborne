import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { DayBooking, InvoiceTerm, LineItem } from '../types';

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function formatYmd(d: Date): string {
  return dateKey(d);
}
function lastWorkingDayOfMonth(date: Date): Date {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const dow = lastDay.getDay();
  if (dow === 0) lastDay.setDate(lastDay.getDate() - 2);
  else if (dow === 6) lastDay.setDate(lastDay.getDate() - 1);
  return lastDay;
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function customerId(customer: DayBooking['customer']): string {
  return typeof customer === 'string' ? customer : customer._id;
}
function customerName(customer: DayBooking['customer']): string {
  return typeof customer === 'string' ? customer : customer.name;
}
function productId(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product._id;
}

interface CustomerGroup {
  customerId: string;
  customerName: string;
  bookingIds: string[];
  lineItems: LineItem[];
  total: number;
}

export default function GenerateInvoicesModal({
  anchorDate,
  onClose,
  onGenerated,
}: {
  anchorDate: Date;
  onClose: () => void;
  onGenerated: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<CustomerGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ invoiceCount: number } | null>(null);

  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const monthEndExclusive = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1);
  const monthLabel = anchorDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  useEffect(() => {
    api
      .listDayBookings(dateKey(monthStart), dateKey(monthEndExclusive))
      .then((bookings) => {
        // Only what hasn't already been invoiced -- repeat runs this month
        // only pick up newly-added/changed bookings.
        const billable = bookings.filter((b) => !b.invoice);
        const byCustomer = new Map<string, { bookings: DayBooking[] }>();
        for (const b of billable) {
          const cid = customerId(b.customer);
          const entry = byCustomer.get(cid);
          if (entry) entry.bookings.push(b);
          else byCustomer.set(cid, { bookings: [b] });
        }
        const built: CustomerGroup[] = [];
        for (const [cid, { bookings: custBookings }] of byCustomer) {
          const byProduct = new Map<string, { name: string; price: number; quantity: number }>();
          for (const b of custBookings) {
            const pid = productId(b.product);
            const name = typeof b.product === 'string' ? b.product : b.product.name;
            const price = typeof b.product === 'string' ? 0 : b.product.price;
            const existing = byProduct.get(pid);
            if (existing) existing.quantity += b.quantity;
            else byProduct.set(pid, { name, price, quantity: b.quantity });
          }
          const lineItems: LineItem[] = Array.from(byProduct.values()).map((p) => ({
            description: p.name,
            quantity: p.quantity,
            unitPrice: p.price,
            discountPercent: 0,
          }));
          const total = lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
          built.push({
            customerId: cid,
            customerName: customerName(custBookings[0].customer),
            bookingIds: custBookings.map((b) => b._id),
            lineItems,
            total,
          });
        }
        built.sort((a, b) => a.customerName.localeCompare(b.customerName));
        setGroups(built);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this month’s bookings'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConfirm() {
    if (!groups) return;
    setBusy(true);
    setError(null);
    try {
      const terms = await api.listInvoiceTerms();
      const defaultTerm = terms.find((t: InvoiceTerm) => t.isDefault);
      const issueDate = formatYmd(new Date());
      let dueDate = issueDate;
      if (defaultTerm?.endOfMonth) dueDate = formatYmd(lastWorkingDayOfMonth(new Date()));
      else if (typeof defaultTerm?.plusDays === 'number') dueDate = formatYmd(addDays(new Date(), defaultTerm.plusDays));

      let invoiceCount = 0;
      for (const group of groups) {
        const invoice = await api.createInvoice({
          customer: group.customerId,
          lineItems: group.lineItems,
          issueDate,
          dueDate,
          paymentTerms: defaultTerm?.text,
          subject: `Bookings for ${monthLabel}`,
        });
        for (const bookingId of group.bookingIds) {
          await api.updateDayBooking(bookingId, { invoice: invoice._id });
        }
        invoiceCount++;
      }
      setResult({ invoiceCount });
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invoices');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Generate Invoices — ${monthLabel}`} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      {result ? (
        <div className="error-banner" style={{ background: 'var(--sage-badge, #d9f2e3)', color: 'var(--brand-green)' }}>
          Created {result.invoiceCount} invoice{result.invoiceCount === 1 ? '' : 's'}.
        </div>
      ) : loading ? (
        <div className="empty-state">Loading…</div>
      ) : !groups || groups.length === 0 ? (
        <div className="empty-state">Nothing to invoice for {monthLabel} — every booking is already invoiced.</div>
      ) : (
        <>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            One invoice per customer, covering every not-yet-invoiced Walk and Visit booked in {monthLabel}.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
            {groups.map((g) => (
              <div
                key={g.customerId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{g.customerName}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    {g.lineItems.length} line item{g.lineItems.length === 1 ? '' : 's'}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>£{g.total.toFixed(2)}</div>
              </div>
            ))}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            {groups.length} invoice{groups.length === 1 ? '' : 's'} will be created.
          </p>
        </>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {result ? 'Close' : 'Cancel'}
        </button>
        {!result && groups && groups.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={busy}>
            {busy ? 'Creating…' : 'Confirm & Create'}
          </button>
        )}
      </div>
    </Modal>
  );
}
