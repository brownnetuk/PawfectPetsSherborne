import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import { ChevronDownIcon } from './icons';
import type { DayBooking, Invoice, InvoiceTerm, LineItem } from '../types';

function lineItemAmount(item: LineItem): number {
  return item.quantity * item.unitPrice * (1 - (item.discountPercent ?? 0) / 100);
}

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
function bookingInvoiceId(invoice: DayBooking['invoice']): string | null {
  if (!invoice) return null;
  return typeof invoice === 'string' ? invoice : invoice._id;
}
function invoiceCustomerId(customer: Invoice['customer']): string {
  return typeof customer === 'string' ? customer : customer._id;
}
function isFullyPaid(invoice: Invoice): boolean {
  return invoice.status === 'paid' || (invoice.amountPaid ?? 0) >= invoice.total;
}

interface CustomerGroup {
  customerId: string;
  customerName: string;
  bookingIds: string[];
  lineItems: LineItem[];
  total: number;
  // The customer's latest booked date this month -- the generated invoice
  // falls due on the last day of what it covers.
  lastDate: string;
  // This customer's non-cancelled invoices, offered for matching instead of
  // creating a new one.
  invoices: Invoice[];
  // A fully-paid invoice already covering this month (generated for it, or
  // linked from one of its bookings) -- such customers are skipped by default.
  paidInvoice: Invoice | null;
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
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [matchInvoice, setMatchInvoice] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ invoiceCount: number; matchedCount: number } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const monthEndExclusive = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1);
  const monthLabel = anchorDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  useEffect(() => {
    Promise.all([api.listDayBookings(dateKey(monthStart), dateKey(monthEndExclusive)), api.listInvoices()])
      .then(([bookings, invoices]) => {
        // Only what hasn't already been invoiced -- repeat runs this month
        // only pick up newly-added/changed bookings. Placeholder rows (boarding
        // pick-up-day presence markers) are never billed.
        const billable = bookings.filter((b) => !b.invoice && !b.placeholder);
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
          const lastDate = custBookings
            .map((b) => dateKey(new Date(b.date)))
            .sort()
            .at(-1)!;
          const custInvoices = invoices.filter(
            (inv) => invoiceCustomerId(inv.customer) === cid && inv.status !== 'cancelled'
          );
          // Invoices already covering this month: generated for it (subject
          // match) or linked from any of this customer's bookings this month.
          const monthInvoiceIds = new Set(
            bookings
              .filter((b) => customerId(b.customer) === cid)
              .map((b) => bookingInvoiceId(b.invoice))
              .filter((id): id is string => !!id)
          );
          const paidInvoice =
            custInvoices.find(
              (inv) => isFullyPaid(inv) && (inv.subject === `Bookings for ${monthLabel}` || monthInvoiceIds.has(inv._id))
            ) ?? null;
          built.push({
            customerId: cid,
            customerName: customerName(custBookings[0].customer),
            bookingIds: custBookings.map((b) => b._id),
            lineItems,
            total,
            lastDate,
            invoices: custInvoices,
            paidInvoice,
          });
        }
        built.sort((a, b) => a.customerName.localeCompare(b.customerName));
        setGroups(built);
        setIncluded(Object.fromEntries(built.map((g) => [g.customerId, !g.paidInvoice])));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this month’s bookings'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = (groups ?? []).filter((g) => included[g.customerId]);
  const toCreate = selected.filter((g) => !matchInvoice[g.customerId]);
  const toMatch = selected.filter((g) => matchInvoice[g.customerId]);

  async function handleConfirm() {
    if (!groups || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      let invoiceCount = 0;
      let matchedCount = 0;
      if (toCreate.length > 0) {
        const terms = await api.listInvoiceTerms();
        const defaultTerm = terms.find((t: InvoiceTerm) => t.isDefault);
        const issueDate = formatYmd(new Date());
        // Fallback only -- each invoice normally falls due on the last date
        // of the bookings it covers.
        let dueDate = issueDate;
        if (defaultTerm?.endOfMonth) dueDate = formatYmd(lastWorkingDayOfMonth(new Date()));
        else if (typeof defaultTerm?.plusDays === 'number') dueDate = formatYmd(addDays(new Date(), defaultTerm.plusDays));

        for (const group of toCreate) {
          const invoice = await api.createInvoice({
            customer: group.customerId,
            lineItems: group.lineItems,
            issueDate,
            dueDate: group.lastDate || dueDate,
            paymentTerms: defaultTerm?.text,
            subject: `Bookings for ${monthLabel}`,
          });
          for (const bookingId of group.bookingIds) {
            await api.updateDayBooking(bookingId, { invoice: invoice._id });
          }
          invoiceCount++;
        }
      }
      for (const group of toMatch) {
        for (const bookingId of group.bookingIds) {
          await api.updateDayBooking(bookingId, { invoice: matchInvoice[group.customerId] });
        }
        matchedCount++;
      }
      setResult({ invoiceCount, matchedCount });
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
          {[
            result.invoiceCount > 0 && `Created ${result.invoiceCount} invoice${result.invoiceCount === 1 ? '' : 's'}`,
            result.matchedCount > 0 &&
              `matched ${result.matchedCount} customer${result.matchedCount === 1 ? '' : 's'} to existing invoices`,
          ]
            .filter(Boolean)
            .join(' and ')}
          .
        </div>
      ) : loading ? (
        <div className="empty-state">Loading…</div>
      ) : !groups || groups.length === 0 ? (
        <div className="empty-state">Nothing to invoice for {monthLabel} — every booking is already invoiced.</div>
      ) : (
        <>
          <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
            One invoice per ticked customer, covering every not-yet-invoiced Walk and Visit booked in {monthLabel}. Pick
            an existing invoice to match the bookings to it instead of creating a new one.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
            {groups.map((g) => {
              const expanded = expandedId === g.customerId;
              const ticked = !!included[g.customerId];
              return (
                <div
                  key={g.customerId}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    opacity: ticked ? 1 : 0.55,
                  }}
                >
                  <div
                    onClick={() => setExpandedId(expanded ? null : g.customerId)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: 8 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={ticked}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setIncluded({ ...included, [g.customerId]: e.target.checked })}
                        aria-label={`Include ${g.customerName}`}
                      />
                      <span style={{ display: 'inline-flex', transform: expanded ? 'rotate(180deg)' : undefined, color: 'var(--muted)' }}>
                        <ChevronDownIcon />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{g.customerName}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                          {g.lineItems.length} line item{g.lineItems.length === 1 ? '' : 's'}
                        </div>
                        {g.paidInvoice && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--warn, #cc7a24)' }}>
                            Invoice {g.paidInvoice.invoiceNumber} for this month is fully paid — skipped.
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      {g.invoices.length > 0 && (
                        <select
                          className="select-inline"
                          value={matchInvoice[g.customerId] ?? ''}
                          disabled={!ticked}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setMatchInvoice({ ...matchInvoice, [g.customerId]: e.target.value })}
                          aria-label={`Invoice for ${g.customerName}`}
                        >
                          <option value="">New invoice</option>
                          {g.invoices.map((inv) => (
                            <option key={inv._id} value={inv._id}>
                              {inv.invoiceNumber} · £{inv.total.toFixed(2)} · {inv.status}
                            </option>
                          ))}
                        </select>
                      )}
                      <div style={{ fontWeight: 700 }}>£{g.total.toFixed(2)}</div>
                    </div>
                  </div>
                  {expanded && (
                    <table style={{ width: '100%', marginTop: 10, fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                          <th style={{ fontWeight: 600, paddingBottom: 4 }}>Item</th>
                          <th style={{ fontWeight: 600, paddingBottom: 4, textAlign: 'right' }}>Qty</th>
                          <th style={{ fontWeight: 600, paddingBottom: 4, textAlign: 'right' }}>Rate</th>
                          <th style={{ fontWeight: 600, paddingBottom: 4, textAlign: 'right' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.lineItems.map((li, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '4px 0' }}>{li.description}</td>
                            <td style={{ padding: '4px 0', textAlign: 'right' }}>{li.quantity}</td>
                            <td style={{ padding: '4px 0', textAlign: 'right' }}>£{li.unitPrice.toFixed(2)}</td>
                            <td style={{ padding: '4px 0', textAlign: 'right' }}>£{lineItemAmount(li).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
            {[
              `${toCreate.length} invoice${toCreate.length === 1 ? '' : 's'} will be created`,
              toMatch.length > 0 &&
                `${toMatch.length} customer${toMatch.length === 1 ? '' : 's'} matched to existing invoices`,
            ]
              .filter(Boolean)
              .join(', ')}
            .
          </p>
        </>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          {result ? 'Close' : 'Cancel'}
        </button>
        {!result && groups && groups.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={busy || selected.length === 0}>
            {busy ? 'Creating…' : 'Confirm & Create'}
          </button>
        )}
      </div>
    </Modal>
  );
}
