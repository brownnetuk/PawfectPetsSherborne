import { useEffect, useMemo, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { DayBooking, Invoice, VisitMapping } from '../types';
import { isBoardingProduct, isDayCareProduct, isVisitProduct } from '../utils/visitMapping';

// Invoices > Actions > "Link to Calendar Item": ties bookings already on the
// calendar (walks, visits, day care, boarding stays) for the invoice's
// customer to that invoice, or unties them. Linking only sets each booking's
// `invoice` -- the same field Generate Invoices sets -- so the bookings show
// the invoice number on the calendar and Generate Invoices skips them. The
// invoice's lines are left alone unless "Add lines" is ticked (Draft or
// Scheduled invoices only, via the same attach-invoice sync an edited
// booking uses).

type Kind = 'walk' | 'visit' | 'daycare' | 'boarding';
const KIND_LABELS: Record<Kind, string> = { walk: 'Walk', visit: 'Visit', daycare: 'Day Care', boarding: 'Boarding' };
// Same colours as the Bookings calendar's badges.
const KIND_COLORS: Record<Kind, { bg: string; fg: string }> = {
  walk: { bg: 'var(--sage-badge, #d9f2e3)', fg: 'var(--brand-green)' },
  visit: { bg: '#fff4cc', fg: '#8a6d00' },
  daycare: { bg: '#ede9fe', fg: '#6d28d9' },
  boarding: { bg: '#ccfbf1', fg: '#0f766e' },
};

function refId(ref: { _id: string } | string | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref._id;
}
function animalName(animal: DayBooking['animal']): string {
  return typeof animal === 'string' ? animal : animal.name;
}
function productName(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product.name;
}
function invoiceNumberOf(invoice: DayBooking['invoice']): string {
  return invoice && typeof invoice !== 'string' ? invoice.invoiceNumber : 'another invoice';
}
function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function bookingKind(mapping: VisitMapping | null, b: DayBooking): Kind {
  const pid = refId(b.product) ?? '';
  if (b.boardingStay || (mapping && isBoardingProduct(mapping, pid))) return 'boarding';
  if (mapping && isDayCareProduct(mapping, pid)) return 'daycare';
  if (mapping && isVisitProduct(mapping, pid)) return 'visit';
  return 'walk';
}

// One tickable calendar item: a single day's booking, or a whole boarding
// stay (every billable row sharing its stayId), so a stay is linked as a unit.
interface Item {
  key: string;
  kind: Kind;
  rows: DayBooking[];
  start: string;
  end: string;
  dogs: string;
  products: string;
  // Every row is on this invoice.
  linkedHere: boolean;
  // Some row is on a different invoice -- shown, but can't be ticked here.
  otherInvoice: string | null;
}

function buildItems(bookings: DayBooking[], mapping: VisitMapping | null, invoiceId: string): Item[] {
  const groups = new Map<string, DayBooking[]>();
  for (const b of bookings) {
    if (b.placeholder) continue;
    const key = b.stayId ? `stay:${b.stayId}` : b._id;
    const arr = groups.get(key);
    if (arr) arr.push(b);
    else groups.set(key, [b]);
  }
  const items: Item[] = [];
  for (const [key, rows] of groups) {
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const dogNames = new Set<string>();
    const productNames = new Set<string>();
    for (const r of rows) {
      dogNames.add(animalName(r.animal));
      for (const a of r.additionalAnimals ?? []) dogNames.add(animalName(a));
      productNames.add(productName(r.product));
    }
    const other = rows.find((r) => {
      const id = refId(r.invoice);
      return id && id !== invoiceId;
    });
    items.push({
      key,
      kind: rows.some((r) => r.boardingStay) ? 'boarding' : bookingKind(mapping, rows[0]),
      rows,
      start: rows[0].date,
      end: rows[rows.length - 1].date,
      dogs: [...dogNames].join(', '),
      products: [...productNames].join(', '),
      linkedHere: rows.every((r) => refId(r.invoice) === invoiceId),
      otherInvoice: other ? invoiceNumberOf(other.invoice) : null,
    });
  }
  // Newest first -- the bookings being invoiced are usually recent ones.
  return items.sort((a, b) => b.start.localeCompare(a.start));
}

interface Props {
  invoice: Invoice;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function LinkCalendarItemsModal({ invoice, onClose, onSaved }: Props) {
  const customerId = refId(invoice.customer) ?? '';
  const customerName = typeof invoice.customer === 'string' ? '' : invoice.customer.name;
  const [items, setItems] = useState<Item[] | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [month, setMonth] = useState('');
  const [showOther, setShowOther] = useState(false);
  const [addLines, setAddLines] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAddLines = invoice.status === 'draft' || invoice.status === 'scheduled';

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listDayBookingsForCustomer(customerId), api.getVisitMapping().catch(() => null)])
      .then(([bookings, mapping]) => {
        if (cancelled) return;
        const built = buildItems(bookings, mapping, invoice._id);
        setItems(built);
        setTicked(Object.fromEntries(built.filter((i) => i.linkedHere).map((i) => [i.key, true])));
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load the bookings'));
    return () => {
      cancelled = true;
    };
  }, [customerId, invoice._id]);

  const months = useMemo(() => [...new Set((items ?? []).map((i) => monthKey(i.start)))], [items]);
  const visible = (items ?? []).filter(
    (i) => (!month || monthKey(i.start) === month) && (showOther || !i.otherInvoice),
  );
  const tickable = visible.filter((i) => !i.otherInvoice);
  const toLink = (items ?? []).filter((i) => !i.otherInvoice && !i.linkedHere && ticked[i.key]);
  const toUnlink = (items ?? []).filter((i) => i.linkedHere && !ticked[i.key]);
  const otherCount = (items ?? []).filter((i) => i.otherInvoice).length;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const linkIds = toLink.flatMap((i) => i.rows.filter((r) => !refId(r.invoice)).map((r) => r._id));
      if (linkIds.length > 0) {
        if (addLines && canAddLines) {
          await api.attachDayBookingsToInvoice(linkIds, invoice._id);
        } else {
          for (const id of linkIds) await api.updateDayBooking(id, { invoice: invoice._id });
        }
      }
      const unlinkIds = toUnlink.flatMap((i) => i.rows.filter((r) => refId(r.invoice) === invoice._id).map((r) => r._id));
      for (const id of unlinkIds) await api.updateDayBooking(id, { invoice: null });
      const parts = [
        toLink.length > 0 && `linked ${toLink.length} calendar item${toLink.length === 1 ? '' : 's'}`,
        toUnlink.length > 0 && `unlinked ${toUnlink.length}`,
      ].filter(Boolean);
      const message = `${invoice.invoiceNumber}: ${parts.join(' and ')}.`;
      onSaved(message.charAt(0).toUpperCase() + message.slice(1));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the links');
      setSaving(false);
    }
  }

  const allVisibleTicked = tickable.length > 0 && tickable.every((i) => ticked[i.key]);

  return (
    <Modal title={`Link ${invoice.invoiceNumber} to Calendar Items`} onClose={onClose} wide>
      {error && <div className="error-banner">{error}</div>}
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
        Tick {customerName ? `${customerName}'s` : 'the customer’s'} bookings that this invoice covers. Linked bookings
        show {invoice.invoiceNumber} on the calendar and Generate Invoices skips them. Untick one to unlink it. The
        invoice’s lines aren’t changed{canAddLines ? ' unless you tick “Add lines” below' : ''}.
      </p>

      {items === null && !error ? (
        <div className="empty-state">Loading…</div>
      ) : items && items.length === 0 ? (
        <div className="empty-state">No calendar bookings for this customer.</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            <select className="select-inline" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
              <option value="">All months</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {new Date(`${m}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                </option>
              ))}
            </select>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={allVisibleTicked}
                disabled={tickable.length === 0}
                onChange={(e) =>
                  setTicked({ ...ticked, ...Object.fromEntries(tickable.map((i) => [i.key, e.target.checked])) })
                }
              />
              Select all shown
            </label>
            {otherCount > 0 && (
              <label className="check-inline">
                <input type="checkbox" checked={showOther} onChange={(e) => setShowOther(e.target.checked)} />
                Show {otherCount} on other invoices
              </label>
            )}
          </div>

          <div
            style={{
              maxHeight: '50vh',
              overflowY: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          >
            {visible.length === 0 ? (
              <div className="empty-state">No bookings to show.</div>
            ) : (
              visible.map((i) => {
                const colors = KIND_COLORS[i.kind];
                const dates = i.start === i.end ? formatDay(i.start) : `${formatDay(i.start)} – ${formatDay(i.end)}`;
                return (
                  <label
                    key={i.key}
                    className="check-row"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--border)',
                      opacity: i.otherInvoice ? 0.6 : 1,
                      cursor: i.otherInvoice ? 'default' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!ticked[i.key] && !i.otherInvoice}
                      disabled={!!i.otherInvoice}
                      onChange={(e) => setTicked({ ...ticked, [i.key]: e.target.checked })}
                    />
                    <span
                      style={{
                        background: colors.bg,
                        color: colors.fg,
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: '0.78rem',
                        flexShrink: 0,
                      }}
                    >
                      {KIND_LABELS[i.kind]}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <strong>{dates}</strong>
                      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                        {' '}
                        · {i.dogs} · {i.products}
                        {i.kind === 'boarding' && i.rows.length > 1 ? ` · ${i.rows.length} days` : ''}
                      </span>
                    </span>
                    {i.otherInvoice ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>On {i.otherInvoice}</span>
                    ) : i.linkedHere ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--brand-green)' }}>Linked</span>
                    ) : null}
                  </label>
                );
              })
            )}
          </div>

          {canAddLines && toLink.length > 0 && (
            <label className="check-inline" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={addLines} onChange={(e) => setAddLines(e.target.checked)} />
              Add lines to {invoice.invoiceNumber} for the newly linked bookings
            </label>
          )}
        </>
      )}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving || (toLink.length === 0 && toUnlink.length === 0)}
        >
          {saving
            ? 'Saving…'
            : toLink.length === 0 && toUnlink.length === 0
              ? 'Save'
              : [toLink.length > 0 && `Link ${toLink.length}`, toUnlink.length > 0 && `Unlink ${toUnlink.length}`]
                  .filter(Boolean)
                  .join(', ')}
        </button>
      </div>
    </Modal>
  );
}
