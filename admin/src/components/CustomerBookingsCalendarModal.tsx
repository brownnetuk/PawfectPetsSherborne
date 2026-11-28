import Modal from './Modal';
import type { DayBooking, VisitMapping } from '../types';
import { isBoardingProduct, isDayCareProduct, isVisitProduct } from '../utils/visitMapping';

// Read-only month calendar of one customer's bookings -- opened from a
// customer card in Generate Invoices so staff can sanity-check what's about
// to be invoiced against the days actually booked.

type Kind = 'walk' | 'visit' | 'daycare' | 'boarding';

// Same colours as the Bookings calendar's badges.
const KIND_COLORS: Record<Kind, { bg: string; fg: string }> = {
  walk: { bg: 'var(--sage-badge, #d9f2e3)', fg: 'var(--brand-green)' },
  visit: { bg: '#fff4cc', fg: '#8a6d00' },
  daycare: { bg: '#ede9fe', fg: '#6d28d9' },
  boarding: { bg: '#ccfbf1', fg: '#0f766e' },
};
const KIND_LABELS: Record<Kind, string> = { walk: 'Walk', visit: 'Visit', daycare: 'Day Care', boarding: 'Boarding' };

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Monday-first weeks covering the whole month.
function monthWeeks(anchorDate: Date): Date[][] {
  const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const weeks: Date[][] = [];
  const cursor = new Date(start);
  do {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === anchorDate.getMonth());
  return weeks;
}

function productId(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product._id;
}
function productName(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product.name;
}
function animalName(animal: DayBooking['animal']): string {
  return typeof animal === 'string' ? animal : animal.name;
}
function bookingAnimalsLabel(b: DayBooking): string {
  const names = [animalName(b.animal), ...(b.additionalAnimals ?? []).map(animalName)];
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : names[0];
}

function bookingKind(mapping: VisitMapping | null, b: DayBooking): Kind {
  const pid = productId(b.product);
  if (b.boardingStay || (mapping && isBoardingProduct(mapping, pid))) return 'boarding';
  if (mapping && isDayCareProduct(mapping, pid)) return 'daycare';
  if (mapping && isVisitProduct(mapping, pid)) return 'visit';
  return 'walk';
}

export default function CustomerBookingsCalendarModal({
  customerName,
  anchorDate,
  bookings,
  visitMapping,
  onClose,
}: {
  customerName: string;
  anchorDate: Date;
  // This customer's bookings in the month (invoiced or not).
  bookings: DayBooking[];
  visitMapping: VisitMapping | null;
  onClose: () => void;
}) {
  const monthLabel = anchorDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const weeks = monthWeeks(anchorDate);
  const byDay = new Map<string, DayBooking[]>();
  for (const b of bookings) {
    const key = dateKey(new Date(b.date));
    const arr = byDay.get(key);
    if (arr) arr.push(b);
    else byDay.set(key, [b]);
  }
  const kindsUsed = (Object.keys(KIND_COLORS) as Kind[]).filter((k) =>
    bookings.some((b) => bookingKind(visitMapping, b) === k),
  );
  const todayKey = dateKey(new Date());

  return (
    <Modal title={`${customerName} — ${monthLabel}`} onClose={onClose} xl>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          marginBottom: 10,
          fontSize: '0.8rem',
        }}
      >
        {kindsUsed.map((k) => (
          <span
            key={k}
            style={{ background: KIND_COLORS[k].bg, color: KIND_COLORS[k].fg, borderRadius: 4, padding: '2px 8px' }}
          >
            {KIND_LABELS[k]}
          </span>
        ))}
        <span style={{ color: 'var(--muted)' }}>✓ already invoiced</span>
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            borderBottom: '1px solid var(--border)',
          }}
        >
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              style={{
                padding: '8px 4px',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                color: 'var(--muted)',
                textTransform: 'uppercase',
              }}
            >
              {label}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div
            key={wi}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              borderBottom: wi === weeks.length - 1 ? 'none' : '1px solid var(--border)',
            }}
          >
            {week.map((date, di) => {
              const key = dateKey(date);
              const inMonth = date.getMonth() === anchorDate.getMonth();
              const dayBookings = inMonth ? (byDay.get(key) ?? []) : [];
              return (
                <div
                  key={key}
                  style={{
                    minWidth: 0,
                    minHeight: 84,
                    padding: 4,
                    borderRight: di === 6 ? 'none' : '1px solid var(--border)',
                    background: key === todayKey ? '#eef6ff' : undefined,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      color: inMonth ? 'var(--ink)' : 'var(--muted)',
                      opacity: inMonth ? 1 : 0.5,
                      marginBottom: 4,
                    }}
                  >
                    {date.getDate()}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {dayBookings.map((b) => {
                      const kind = bookingKind(visitMapping, b);
                      const invoiced = !!b.invoice;
                      const product = productName(b.product);
                      const qty = b.quantity > 1 ? ` × ${b.quantity}` : '';
                      const time = b.visitTime ? ` (${b.visitTime})` : '';
                      const label = `${bookingAnimalsLabel(b)} · ${product}${qty}${time}`;
                      return (
                        <span
                          key={b._id}
                          className="customer-calendar-badge"
                          title={`${label}${invoiced ? ' — invoiced' : b.placeholder ? ' — pick-up day' : ''}`}
                          style={{
                            background: KIND_COLORS[kind].bg,
                            color: KIND_COLORS[kind].fg,
                            fontSize: '0.72rem',
                            lineHeight: 1.3,
                            borderRadius: 4,
                            padding: '2px 4px',
                            overflowWrap: 'anywhere',
                            opacity: invoiced ? 0.6 : 1,
                          }}
                        >
                          {invoiced ? '✓ ' : ''}
                          {bookingAnimalsLabel(b)}
                          {/* Pets only on a phone -- the product is in the tooltip. */}
                          <span className="customer-calendar-detail">
                            {b.placeholder ? ' · Pick-up' : ` · ${product}${qty}${time}`}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
