import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import CustomerBookingsCalendarModal from './CustomerBookingsCalendarModal';
import ScheduleSendModal from './ScheduleSendModal';
import { BookingsIcon, ChevronDownIcon, CreateInvoiceIcon } from './icons';
import type { Animal, DayBooking, Invoice, InvoiceTerm, LineItem, Product, VisitMapping } from '../types';
import {
  travelProductForCustomer,
  travelQuantityForCustomer,
  travelUnitsForBookings,
  withTravelQuantity,
} from '../utils/travelLines';
import { bookingInvoiceDueDate } from '../utils/invoiceDueDate';
import { customerPrice } from '../utils/customerPricing';
import { mergeLineItems, openInvoicesFor } from './BookingInvoicePrompt';

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

// The customer's dogs; if they have none (a cat-only customer), their other pets.
function petNamesFor(animals: Animal[]): string[] {
  const dogs = animals.filter((a) => a.species === 'dog');
  return (dogs.length > 0 ? dogs : animals).map((a) => a.name).sort((a, b) => a.localeCompare(b));
}

function lineItemsTotal(lineItems: LineItem[]): number {
  return lineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
}

type CreateMode = 'draft' | 'send' | 'schedule';

const CREATE_OPTIONS: { mode: CreateMode; label: string; hint: string }[] = [
  { mode: 'draft', label: 'Save as Draft', hint: 'Create it now and send it later from Invoices.' },
  { mode: 'send', label: 'Create & Send', hint: 'Create it and email it to the customer now.' },
  { mode: 'schedule', label: 'Schedule Send', hint: 'Create it, then pick when it’s emailed.' },
];

interface CustomerGroup {
  customerId: string;
  customerName: string;
  // The customer's dogs (or, with no dogs, their other pets), shown under the name.
  petNames: string[];
  // Every booking this customer has this month, invoiced or not -- for the
  // calendar view.
  monthBookings: DayBooking[];
  bookingIds: string[];
  // Booked products, without any travel line -- see linesFor.
  baseLineItems: LineItem[];
  // The customer's travel product, if they're travel-chargeable.
  travel: Product | null;
  // Travel charged for Visits (1 x Visit -> 1, 2 x Visit -> 2) and/or Walks
  // (one each), as the customer's Travel settings say.
  travelQuantity: number;
  // The customer's latest booked date this month -- the generated invoice
  // falls due on it, unless the payment term gives a later date.
  lastDate: string;
  // This customer's open (unpaid, not cancelled) invoices, offered to add the
  // bookings to instead of creating a new one.
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
  const [visitMapping, setVisitMapping] = useState<VisitMapping | null>(null);
  const [calendarFor, setCalendarFor] = useState<CustomerGroup | null>(null);
  // A single customer just invoiced from their card's create button.
  const [notice, setNotice] = useState<string | null>(null);
  // The customer whose create button was clicked, while asking draft / send / schedule.
  const [choosing, setChoosing] = useState<CustomerGroup | null>(null);
  // A just-created draft waiting on the Schedule Send dialog.
  const [scheduling, setScheduling] = useState<{ invoice: Invoice; customerName: string } | null>(null);

  function linesFor(g: CustomerGroup): LineItem[] {
    if (!g.travel) return g.baseLineItems;
    return withTravelQuantity(g.baseLineItems, g.travel, g.travelQuantity);
  }

  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const monthEndExclusive = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 1);
  const monthLabel = anchorDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  useEffect(() => {
    Promise.all([
      api.listDayBookings(dateKey(monthStart), dateKey(monthEndExclusive)),
      api.listInvoices(),
      api.listCustomers(),
      api.listProducts(),
      api.getVisitMapping(),
      api.listAnimals(),
    ])
      .then(([bookings, invoices, customers, products, mapping, animals]) => {
        setVisitMapping(mapping);
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
          const customer = customers.find((c) => c._id === cid);
          const byProduct = new Map<string, { name: string; price: number; quantity: number }>();
          for (const b of custBookings) {
            const pid = productId(b.product);
            const name = typeof b.product === 'string' ? b.product : b.product.name;
            // The customer's Pricing Override, if any, over the standard price.
            const standard = typeof b.product === 'string' ? 0 : b.product.price;
            const price = customerPrice(customer, { _id: pid, price: standard });
            const existing = byProduct.get(pid);
            if (existing) existing.quantity += b.quantity;
            else byProduct.set(pid, { name, price, quantity: b.quantity });
          }
          const booked: LineItem[] = Array.from(byProduct.values()).map((p) => ({
            description: p.name,
            quantity: p.quantity,
            unitPrice: p.price,
            discountPercent: 0,
          }));
          // Travel is counted from the Visits (2 x Visit -> 2 x Travel) and/or
          // Walks (one each) the customer is chargeable for, not from travel
          // rows booked -- older ones also sit on Day Care and Boarding days.
          const travel = travelProductForCustomer(customer, products);
          const travelQuantity = travel
            ? travelQuantityForCustomer(customer, travelUnitsForBookings(custBookings, mapping, travel))
            : 0;
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
            petNames: petNamesFor(animals.filter((a) => a.customer === cid)),
            monthBookings: bookings.filter((b) => customerId(b.customer) === cid),
            bookingIds: custBookings.map((b) => b._id),
            baseLineItems: travel ? withTravelQuantity(booked, travel, 0) : booked,
            travel,
            travelQuantity,
            lastDate,
            // Paid ones aren't offered: adding lines would reopen them.
            invoices: openInvoicesFor(custInvoices, cid),
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
  const selectedTotal = selected.reduce((sum, g) => sum + lineItemsTotal(linesFor(g)), 0);

  async function defaultTermForCreate(): Promise<InvoiceTerm | undefined> {
    const terms = await api.listInvoiceTerms();
    return terms.find((t: InvoiceTerm) => t.isDefault);
  }

  // A new invoice for the group's bookings, then links each booking to it.
  async function createFor(group: CustomerGroup, defaultTerm: InvoiceTerm | undefined): Promise<Invoice> {
    const today = new Date();
    const invoice = await api.createInvoice({
      customer: group.customerId,
      lineItems: linesFor(group),
      issueDate: formatYmd(today),
      dueDate: bookingInvoiceDueDate(today, defaultTerm, group.lastDate),
      paymentTerms: defaultTerm?.text,
      subject: `Bookings for ${monthLabel}`,
    });
    for (const bookingId of group.bookingIds) {
      await api.updateDayBooking(bookingId, { invoice: invoice._id });
    }
    return invoice;
  }

  // Adds the group's lines (bookings plus travel) to an existing invoice,
  // the same way a new booking's "Add to INV…" does (BookingInvoicePrompt),
  // then links each booking to it. Linking alone leaves the bookings showing
  // the invoice number while the invoice never bills them.
  async function matchTo(group: CustomerGroup, invoiceId: string) {
    // Re-read it so lines added since the list loaded aren't lost.
    const current = await api.getInvoice(invoiceId);
    const currentDue = dateKey(new Date(current.dueDate));
    await api.updateInvoice(invoiceId, {
      lineItems: mergeLineItems(current.lineItems, linesFor(group)),
      // Still due on the last date it covers, if these bookings run later.
      ...(group.lastDate > currentDue ? { dueDate: group.lastDate } : {}),
    });
    for (const bookingId of group.bookingIds) {
      await api.updateDayBooking(bookingId, { invoice: invoiceId });
    }
  }

  async function handleConfirm() {
    if (!groups || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      let invoiceCount = 0;
      let matchedCount = 0;
      if (toCreate.length > 0) {
        const defaultTerm = await defaultTermForCreate();
        for (const group of toCreate) {
          await createFor(group, defaultTerm);
          invoiceCount++;
        }
      }
      for (const group of toMatch) {
        await matchTo(group, matchInvoice[group.customerId]);
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

  // The card's create button: invoices just this customer, whether or not
  // they're ticked, then drops them from the list so Confirm & Create can't
  // invoice them twice. A new invoice is created as a draft and then, as
  // picked in the prompt, emailed now or handed to Schedule Send. With an
  // existing invoice picked in their dropdown, the bookings are just matched
  // to it (no prompt -- nothing new to send).
  async function handleCreateOne(group: CustomerGroup, mode: CreateMode) {
    setChoosing(null);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const matchId = matchInvoice[group.customerId];
      if (matchId) {
        await matchTo(group, matchId);
        const inv = group.invoices.find((i) => i._id === matchId);
        setNotice(`Added ${group.customerName}'s bookings to invoice ${inv?.invoiceNumber ?? ''}.`);
      } else {
        const invoice = await createFor(group, await defaultTermForCreate());
        if (mode === 'send') {
          try {
            await api.sendInvoiceEmail(invoice._id);
            setNotice(`Created invoice ${invoice.invoiceNumber} for ${group.customerName} and emailed it.`);
          } catch (err) {
            setError(
              `Created invoice ${invoice.invoiceNumber} for ${group.customerName} as a draft, but it couldn't be sent: ${
                err instanceof Error ? err.message : 'unknown error'
              }`,
            );
          }
        } else if (mode === 'schedule') {
          setScheduling({ invoice, customerName: group.customerName });
        } else {
          setNotice(`Created invoice ${invoice.invoiceNumber} for ${group.customerName} as a draft.`);
        }
      }
      setGroups((prev) => (prev ?? []).filter((g) => g.customerId !== group.customerId));
      if (expandedId === group.customerId) setExpandedId(null);
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to invoice ${group.customerName}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal title={`Generate Invoices — ${monthLabel}`} onClose={onClose}>
        {error && <div className="error-banner">{error}</div>}
        {notice && !result && (
          <div
            className="error-banner"
            style={{ background: 'var(--sage-badge, #d9f2e3)', color: 'var(--brand-green)', borderColor: 'transparent' }}
          >
            {notice}
          </div>
        )}
        {result ? (
          <div className="error-banner" style={{ background: 'var(--sage-badge, #d9f2e3)', color: 'var(--brand-green)' }}>
            {[
              result.invoiceCount > 0 && `Created ${result.invoiceCount} invoice${result.invoiceCount === 1 ? '' : 's'}`,
              result.matchedCount > 0 &&
                `added ${result.matchedCount} customer${result.matchedCount === 1 ? '' : 's'}’ bookings to existing invoices`,
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
              an existing invoice to add the bookings to it instead of creating a new one.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
              {groups.map((g) => {
                const expanded = expandedId === g.customerId;
                const ticked = !!included[g.customerId];
                const lineItems = linesFor(g);
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
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
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{g.customerName}</div>
                          {g.petNames.length > 0 && (
                            <div style={{ fontSize: '0.85rem', color: 'var(--ink)', overflowWrap: 'anywhere' }}>
                              {g.petNames.join(', ')}
                            </div>
                          )}
                          <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                            {lineItems.length} line item{lineItems.length === 1 ? '' : 's'}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCalendarFor(g);
                        }}
                        title={`${g.customerName}'s bookings this month`}
                        aria-label={`Show ${g.customerName}'s bookings on a calendar`}
                        // Sits snug against the create button beside it.
                        style={{ flexShrink: 0, marginRight: -8 }}
                      >
                        <BookingsIcon />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (matchInvoice[g.customerId]) void handleCreateOne(g, 'draft');
                          else setChoosing(g);
                        }}
                        title={
                          matchInvoice[g.customerId]
                            ? `Add ${g.customerName}'s bookings to the picked invoice now`
                            : `Create ${g.customerName}'s invoice now`
                        }
                        aria-label={`Create invoice for ${g.customerName}`}
                        style={{ flexShrink: 0 }}
                      >
                        <CreateInvoiceIcon />
                      </button>
                      <div style={{ fontWeight: 700, flexShrink: 0 }}>£{lineItemsTotal(lineItems).toFixed(2)}</div>
                    </div>
                    {(g.paidInvoice || g.invoices.length > 0) && (
                      // Indented to line up with the name, under the checkbox and chevron.
                      <div style={{ paddingLeft: 48, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {g.paidInvoice && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--warn, #cc7a24)' }}>
                            Invoice {g.paidInvoice.invoiceNumber} for this month is fully paid — skipped.
                          </div>
                        )}
                        {g.invoices.length > 0 && (
                          <select
                            className="select-inline"
                            value={matchInvoice[g.customerId] ?? ''}
                            disabled={!ticked}
                            onChange={(e) => setMatchInvoice({ ...matchInvoice, [g.customerId]: e.target.value })}
                            aria-label={`Invoice for ${g.customerName}`}
                            style={{ maxWidth: '100%', alignSelf: 'flex-start' }}
                          >
                            <option value="">New invoice</option>
                            {g.invoices.map((inv) => (
                              <option key={inv._id} value={inv._id}>
                                Add to {inv.invoiceNumber} · £{inv.total.toFixed(2)} · {inv.status}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
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
                          {lineItems.map((li, i) => (
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                padding: '10px 16px',
                borderTop: '1px solid var(--border)',
                marginTop: 8,
              }}
            >
              <span style={{ fontWeight: 600 }}>
                Total ({selected.length} selected)
              </span>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>£{selectedTotal.toFixed(2)}</span>
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              {[
                `${toCreate.length} invoice${toCreate.length === 1 ? '' : 's'} will be created`,
                toMatch.length > 0 &&
                  `${toMatch.length} customer${toMatch.length === 1 ? '' : 's'} added to existing invoices`,
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
      {choosing && (
        <Modal title={`Create invoice: ${choosing.customerName}`} onClose={() => setChoosing(null)}>
          <p style={{ marginTop: -6 }}>
            {choosing.customerName}'s bookings for {monthLabel}, £{lineItemsTotal(linesFor(choosing)).toFixed(2)}. What should
            happen to the new invoice?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CREATE_OPTIONS.map((opt) => (
              <button
                key={opt.mode}
                type="button"
                className="create-choice"
                onClick={() => void handleCreateOne(choosing, opt.mode)}
                disabled={busy}
              >
                <strong>{opt.label}</strong>
                <span>{opt.hint}</span>
              </button>
            ))}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setChoosing(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      )}
      {scheduling && (
        <ScheduleSendModal
          invoices={[scheduling.invoice]}
          onClose={() => {
            setNotice(
              `Created invoice ${scheduling.invoice.invoiceNumber} for ${scheduling.customerName} as a draft (not scheduled).`,
            );
            setScheduling(null);
          }}
          onScheduled={() => {
            setNotice(
              `Created invoice ${scheduling.invoice.invoiceNumber} for ${scheduling.customerName} and scheduled it to send.`,
            );
            setScheduling(null);
          }}
        />
      )}
      {calendarFor && (
        <CustomerBookingsCalendarModal
          customerName={calendarFor.customerName}
          anchorDate={anchorDate}
          bookings={calendarFor.monthBookings}
          visitMapping={visitMapping}
          onClose={() => setCalendarFor(null)}
        />
      )}
    </>
  );
}
