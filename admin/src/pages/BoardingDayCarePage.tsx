import { useEffect, useMemo, useState } from 'react';
import * as api from '../api/client';
import type { DayBooking, VisitMapping } from '../types';
import { addDays, dateKey } from '../utils/visitPlan';

// How many dogs can be in each of the 4 sections at once, across the whole
// business (not per product/animal) -- flagged on the Occupancy tab once a
// day's section count reaches this. A plain constant rather than a Settings
// field for now; ask if this ever needs to vary by section or be
// staff-editable.
const CAPACITY_PER_SECTION = 4;

type Section = 'AM' | 'PM' | 'fullDay' | 'overnight';
const SECTIONS: Section[] = ['AM', 'PM', 'fullDay', 'overnight'];
const SECTION_LABELS: Record<Section, string> = {
  AM: 'AM (8am–1pm)',
  PM: 'PM (1pm–6pm)',
  fullDay: 'Full Day',
  overnight: 'Overnight',
};

function productId(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product._id;
}
function productLabel(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product.name;
}
function animalLabel(animal: DayBooking['animal']): string {
  return typeof animal === 'string' ? animal : animal.name;
}
function customerLabel(customer: DayBooking['customer']): string {
  return typeof customer === 'string' ? customer : customer.name;
}

// Which of the 4 occupancy sections a row's PRODUCT actually occupies --
// checked against the raw product id (including the 2nd-dog product
// variants), not the display-only `boardingStay` flag
// admin/src/utils/visitMapping.ts's own isBoardingProduct/isDayCareProduct
// don't check. A boarding stay's attached leftover Day Care day carries
// boardingStay:true but is a real Day Care product, so it counts as Day
// Care occupancy on that date, not Overnight.
//
// A boarding night occupies AM, PM, *and* Overnight, not just Overnight --
// the dog is physically on-site the whole day, not just while asleep, so a
// boarding stay competes for daytime capacity the same as a day-care dog
// would. Returns [] for a Walk/Visit product (out of scope here), an
// unmapped one, or the pick-up day's placeholder row (presence-only, never
// billed, and represents the tail end of the last night rather than a
// fresh occupied day).
function sectionsFor(mapping: VisitMapping, b: DayBooking): Section[] {
  const pid = productId(b.product);
  if (pid === mapping.boardingPerDayProduct || pid === mapping.boardingSecondDogPerDayProduct) {
    return b.placeholder ? [] : ['AM', 'PM', 'overnight'];
  }
  if (pid === mapping.dayCareFullDayProduct || pid === mapping.dayCareSecondDogFullDayProduct) {
    return ['fullDay'];
  }
  if (pid === mapping.dayCareHalfDayProduct || pid === mapping.dayCareSecondDogHalfDayProduct) {
    // Half Day doesn't store which half separately. A standalone day-care
    // booking has dropOffPeriod/collectionPeriod (AM/AM or PM/PM for a half
    // day); a boarding stay's attached leftover day only has dropOffTime/
    // pickUpTime instead (see backend's day-booking.schema.ts). Falls back
    // to AM if genuinely nothing is set, so every row still lands somewhere.
    const period = b.dropOffPeriod ?? b.collectionPeriod;
    if (period) return [period === 'PM' ? 'PM' : 'AM'];
    const timeStr = b.dropOffTime || b.collectionTime || b.pickUpTime;
    if (timeStr) {
      const hour = parseInt(timeStr, 10);
      if (!Number.isNaN(hour)) return [hour < 13 ? 'AM' : 'PM'];
    }
    return ['AM'];
  }
  return [];
}

type Tab = 'upcoming' | 'occupancy';
const TAB_LABELS: Record<Tab, string> = { upcoming: 'Upcoming Stays', occupancy: 'Occupancy' };

export default function BoardingDayCarePage() {
  const [tab, setTab] = useState<Tab>('upcoming');
  return (
    <div>
      <div className="page-header">
        <h1>Boarding &amp; Day Care</h1>
      </div>
      <div className="tabs">
        {(['upcoming', 'occupancy'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {tab === 'upcoming' && <UpcomingStaysTab />}
      {tab === 'occupancy' && <OccupancyTab />}
    </div>
  );
}

interface StayEntry {
  key: string;
  animal: string;
  customer: string;
  type: string;
  startDate: Date;
  endDate: Date;
  dropOffTime?: string | null;
  pickUpTime?: string | null;
  invoiced: boolean;
}

const RANGE_OPTIONS = [
  { value: 30, label: 'Next 30 Days' },
  { value: 60, label: 'Next 60 Days' },
  { value: 90, label: 'Next 90 Days' },
];

function UpcomingStaysTab() {
  const [rangeDays, setRangeDays] = useState(30);
  const [dayBookings, setDayBookings] = useState<DayBooking[] | null>(null);
  const [mapping, setMapping] = useState<VisitMapping | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const from = new Date();
    const to = addDays(from, rangeDays);
    api
      .listDayBookings(dateKey(from), dateKey(addDays(to, 1)))
      .then(setDayBookings)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bookings'));
    api.getVisitMapping().then(setMapping).catch(() => {});
  }, [rangeDays]);

  const entries: StayEntry[] = useMemo(() => {
    if (!dayBookings || !mapping) return [];
    const stays = new Map<string, DayBooking[]>();
    const standalone: DayBooking[] = [];
    for (const b of dayBookings) {
      if (b.stayId) {
        const rows = stays.get(b.stayId) ?? [];
        rows.push(b);
        stays.set(b.stayId, rows);
      } else if (sectionsFor(mapping, b).length > 0) {
        standalone.push(b);
      }
    }
    const result: StayEntry[] = [];
    for (const [stayId, rows] of stays) {
      // A boarding stay's own rows aren't all "Boarding" (the trailing day
      // can be a real Day Care product) -- only non-placeholder boarding
      // rows count as billable nights for the summary label.
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const billableNights = sorted.filter((r) => sectionsFor(mapping, r).includes('overnight')).length;
      result.push({
        key: stayId,
        animal: animalLabel(sorted[0].animal),
        customer: customerLabel(sorted[0].customer),
        type: billableNights > 0 ? `Boarding × ${billableNights} night${billableNights === 1 ? '' : 's'}` : 'Day Care',
        startDate: new Date(sorted[0].date),
        endDate: new Date(sorted[sorted.length - 1].date),
        dropOffTime: sorted.find((r) => r.dropOffTime)?.dropOffTime,
        pickUpTime: sorted.find((r) => r.pickUpTime)?.pickUpTime,
        invoiced: sorted.filter((r) => !r.placeholder).every((r) => !!r.invoice),
      });
    }
    for (const b of standalone) {
      // Standalone (non-boarding-stay) rows only ever occupy one section --
      // the multi-section case (a boarding night occupying AM/PM/Overnight
      // at once) only applies to stay rows, already handled above.
      const section = sectionsFor(mapping, b)[0];
      result.push({
        key: b._id,
        animal: animalLabel(b.animal),
        customer: customerLabel(b.customer),
        type: `${productLabel(b.product)} (${SECTION_LABELS[section]})`,
        startDate: new Date(b.date),
        endDate: new Date(b.date),
        dropOffTime: b.dropOffTime ?? (b.dropOffPeriod ? b.dropOffPeriod : undefined),
        pickUpTime: b.pickUpTime ?? (b.collectionTime ?? (b.collectionPeriod ? b.collectionPeriod : undefined)),
        invoiced: !!b.invoice,
      });
    }
    result.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    return result;
  }, [dayBookings, mapping]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ color: 'var(--muted)', margin: 0 }}>Every upcoming boarding stay and day-care booking, soonest first.</p>
        <select className="select-inline" value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))}>
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!dayBookings || !mapping ? (
        <div className="empty-state">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="empty-state">No boarding or day-care bookings in this period.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Dog</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Dates</th>
              <th>Drop off</th>
              <th>Pick up</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.key}>
                <td>{e.animal}</td>
                <td>{e.customer}</td>
                <td>{e.type}</td>
                <td>
                  {e.startDate.getTime() === e.endDate.getTime()
                    ? e.startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : `${e.startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${e.endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                </td>
                <td>{e.dropOffTime || '—'}</td>
                <td>{e.pickUpTime || '—'}</td>
                <td>
                  {e.invoiced && (
                    <span title="Invoiced" style={{ color: 'var(--brand-green)' }}>
                      ✓
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type ViewMode = 'week' | 'month';

function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}
function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}
function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}
function buildWeeks(viewMode: ViewMode, anchorDate: Date): Date[][] {
  if (viewMode === 'week') {
    const start = startOfWeek(anchorDate);
    return [Array.from({ length: 7 }, (_, i) => addDays(start, i))];
  }
  const monthStart = startOfMonth(anchorDate);
  const nextMonthStart = addMonths(anchorDate, 1);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = addDays(startOfWeek(addDays(nextMonthStart, -1)), 7);
  const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000);
  const weeks: Date[][] = [];
  for (let w = 0; w < totalDays / 7; w++) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i)));
  }
  return weeks;
}
function rangeLabel(viewMode: ViewMode, weeks: Date[][], anchorDate: Date): string {
  if (viewMode === 'month') {
    return anchorDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }
  const [start, end] = [weeks[0][0], weeks[0][6]];
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startLabel = start.toLocaleDateString('en-GB', { day: 'numeric', month: sameMonth ? undefined : 'short' });
  const endLabel = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${startLabel} – ${endLabel}`;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function OccupancyTab() {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [dayBookings, setDayBookings] = useState<DayBooking[] | null>(null);
  const [mapping, setMapping] = useState<VisitMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const weeks = useMemo(() => buildWeeks(viewMode, anchorDate), [viewMode, anchorDate]);

  useEffect(() => {
    const from = weeks[0][0];
    const to = weeks[weeks.length - 1][6];
    api
      .listDayBookings(dateKey(from), dateKey(addDays(to, 1)))
      .then(setDayBookings)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bookings'));
    api.getVisitMapping().then(setMapping).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, anchorDate]);

  function entriesForDay(date: Date): DayBooking[] {
    return (dayBookings ?? []).filter((b) => isSameDay(new Date(b.date), date));
  }

  function countsForDay(date: Date): Record<Section, number> {
    const counts: Record<Section, number> = { AM: 0, PM: 0, fullDay: 0, overnight: 0 };
    if (!mapping) return counts;
    for (const b of entriesForDay(date)) {
      for (const section of sectionsFor(mapping, b)) counts[section] += b.quantity;
    }
    return counts;
  }

  function goToday() {
    setAnchorDate(new Date());
  }
  function goBack() {
    setAnchorDate((d) => (viewMode === 'week' ? addDays(d, -7) : addMonths(d, -1)));
  }
  function goForward() {
    setAnchorDate((d) => (viewMode === 'week' ? addDays(d, 7) : addMonths(d, 1)));
  }

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      <div className="card" style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={goBack} aria-label="Previous">
              ←
            </button>
            <button className="btn btn-secondary btn-sm" onClick={goToday}>
              Today
            </button>
            <button className="btn btn-secondary btn-sm" onClick={goForward} aria-label="Next">
              →
            </button>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{rangeLabel(viewMode, weeks, anchorDate)}</h2>
          </div>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')}>
              Week
            </button>
            <button className={viewMode === 'month' ? 'active' : ''} onClick={() => setViewMode('month')}>
              Month
            </button>
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center' }}>
              {label}
            </div>
          ))}
          {weeks.map((week) =>
            week.map((date) => {
              const counts = countsForDay(date);
              const anyAtCapacity = SECTIONS.some((s) => counts[s] >= CAPACITY_PER_SECTION);
              const inMonth = viewMode === 'week' || date.getMonth() === anchorDate.getMonth();
              return (
                <button
                  type="button"
                  key={dateKey(date)}
                  onClick={() => setSelectedDate(date)}
                  style={{
                    textAlign: 'left',
                    border: `1px solid ${anyAtCapacity ? 'var(--error)' : 'var(--border)'}`,
                    borderRadius: 8,
                    padding: 8,
                    minHeight: 96,
                    background: isToday(date) ? 'var(--sage-badge, #eef5ee)' : 'white',
                    opacity: inMonth ? 1 : 0.45,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 4 }}>{date.getDate()}</div>
                  {SECTIONS.map((s) => (
                    <div
                      key={s}
                      style={{
                        fontSize: '0.72rem',
                        color: counts[s] >= CAPACITY_PER_SECTION ? 'var(--error)' : 'var(--muted)',
                        fontWeight: counts[s] >= CAPACITY_PER_SECTION ? 700 : 400,
                      }}
                    >
                      {SECTION_LABELS[s].split(' ')[0]}: {counts[s]}/{CAPACITY_PER_SECTION}
                    </div>
                  ))}
                </button>
              );
            }),
          )}
        </div>
      </div>

      {selectedDate && (
        <div className="card" style={{ width: 320, flexShrink: 0, position: 'sticky', top: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
              {selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h2>
            <button type="button" className="icon-btn" onClick={() => setSelectedDate(null)} aria-label="Close">
              ✕
            </button>
          </div>
          {mapping &&
            SECTIONS.map((section) => {
              const rows = entriesForDay(selectedDate).filter((b) => sectionsFor(mapping, b).includes(section));
              if (rows.length === 0) return null;
              return (
                <div key={section} style={{ marginBottom: 14 }}>
                  <div className="section-title" style={{ marginTop: 0 }}>
                    {SECTION_LABELS[section]} ({rows.reduce((n, b) => n + b.quantity, 0)}/{CAPACITY_PER_SECTION})
                  </div>
                  {rows.map((b) => (
                    <div key={b._id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <span>{animalLabel(b.animal)}</span>
                      <span style={{ color: 'var(--muted)' }}>{customerLabel(b.customer)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          {mapping && entriesForDay(selectedDate).every((b) => sectionsFor(mapping, b).length === 0) && (
            <div className="empty-state">No boarding or day care that day.</div>
          )}
        </div>
      )}
    </div>
  );
}
