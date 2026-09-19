import { useEffect, useMemo, useState } from 'react';
import * as api from '../api/client';
import NewBookingModal from '../components/NewBookingModal';
import type { BoardingEditInitial, DayCareEditInitial } from '../components/NewBookingModal';
import { TrashIcon } from '../components/icons';
import type { Animal, AnnualLeave, Customer, DayBooking, VisitMapping } from '../types';
import { annualLeaveOn } from '../utils/annualLeave';
import { addDays, dateKey } from '../utils/visitPlan';

// How many dogs can be in each of the 4 sections at once, across the whole
// business (not per product/animal) -- flagged on the Occupancy tab once a
// day's section count reaches this. A plain constant rather than a Settings
// field for now; ask if this ever needs to vary by section or be
// staff-editable.
const CAPACITY_PER_SECTION = 4;

type Section = 'AM' | 'PM' | 'overnight';
const SECTIONS: Section[] = ['AM', 'PM', 'overnight'];
const SECTION_LABELS: Record<Section, string> = {
  AM: 'AM (8am–1pm)',
  PM: 'PM (1pm–6pm)',
  overnight: 'Overnight',
};

function productId(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product._id;
}
function productLabel(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product.name;
}
function productPrice(product: DayBooking['product']): number {
  return typeof product === 'string' ? 0 : product.price;
}
function animalId(animal: DayBooking['animal']): string {
  return typeof animal === 'string' ? animal : animal._id;
}
function animalLabel(animal: DayBooking['animal']): string {
  return typeof animal === 'string' ? animal : animal.name;
}
function customerLabel(customer: DayBooking['customer']): string {
  return typeof customer === 'string' ? customer : customer.name;
}

// Which of the 3 occupancy sections a row's PRODUCT actually occupies --
// checked against the raw product id (including the 2nd-dog product
// variants), not the display-only `boardingStay` flag
// admin/src/utils/visitMapping.ts's own isBoardingProduct/isDayCareProduct
// don't check. A boarding stay's attached leftover Day Care day carries
// boardingStay:true but is a real Day Care product, so it counts as Day
// Care occupancy on that date, not Overnight.
//
// There's no separate "Full Day" section -- a Full Day booking (or a
// boarding night, which also runs the whole day) occupies *both* AM and PM,
// the same physical daytime capacity a Half Day booking would use one half
// of, rather than having its own bucket. A boarding night additionally
// occupies Overnight, since the dog is on-site through the night too, not
// just during the day. Returns [] for a Walk/Visit product (out of scope
// here), an unmapped one, or the pick-up day's placeholder row
// (presence-only, never billed, and represents the tail end of the last
// night rather than a fresh occupied day).
function sectionsFor(mapping: VisitMapping, b: DayBooking): Section[] {
  const pid = productId(b.product);
  if (pid === mapping.boardingPerDayProduct || pid === mapping.boardingSecondDogPerDayProduct) {
    return b.placeholder ? [] : ['AM', 'PM', 'overnight'];
  }
  if (pid === mapping.dayCareFullDayProduct || pid === mapping.dayCareSecondDogFullDayProduct) {
    return ['AM', 'PM'];
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

interface StayEditHandlers {
  onEdit: (stayId: string) => void;
  onDelete: (stayId: string) => void;
}

type Tab = 'dashboard' | 'upcoming' | 'occupancy';
const TAB_LABELS: Record<Tab, string> = { dashboard: 'Dashboard', upcoming: 'Upcoming Stays', occupancy: 'Occupancy' };

export default function BoardingDayCarePage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [mapping, setMapping] = useState<VisitMapping | null>(null);
  const [boardingEdit, setBoardingEdit] = useState<BoardingEditInitial | null>(null);
  const [dayCareEdit, setDayCareEdit] = useState<DayCareEditInitial | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  // Bumped after an edit/delete so both Dashboard and Upcoming Stays refetch
  // -- simpler than threading a shared cache between two independently
  // data-fetching tabs.
  const [refreshSignal, setRefreshSignal] = useState(0);

  useEffect(() => {
    api.listAnimals().then(setAnimals).catch(() => {});
    api.listCustomers().then(setCustomers).catch(() => {});
    api.getVisitMapping().then(setMapping).catch(() => {});
  }, []);

  // Shared by Dashboard and Upcoming Stays -- reopens NewBookingModal
  // pre-filled to edit the clicked booking, same "edit = delete + recreate"
  // shape CustomerDetailPage.tsx's own openBoardingEdit and BookingsPage.tsx
  // use. A stayId with no overnight row is a standalone Day Care booking
  // (always exactly one day/one row), so it edits via dayCareInitial
  // instead of boardingInitial.
  async function handleEditStay(stayId: string) {
    setEditError(null);
    try {
      const rows = await api.getBoardingStay(stayId);
      if (rows.length === 0 || !mapping) return;
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const cust = sorted[0].customer;
      const custId = typeof cust === 'string' ? cust : cust._id;
      const isBoarding = sorted.some((r) => sectionsFor(mapping, r).includes('overnight'));
      if (isBoarding) {
        setBoardingEdit({
          stayId,
          customerId: custId,
          animalIds: [...new Set(sorted.map((r) => animalId(r.animal)))],
          startDate: dateKey(new Date(sorted[0].date)),
          endDate: dateKey(new Date(sorted[sorted.length - 1].date)),
          dropOffTime: sorted.find((r) => r.dropOffTime)?.dropOffTime ?? '',
          pickUpTime: sorted.find((r) => r.pickUpTime)?.pickUpTime ?? '',
        });
      } else {
        const b = sorted[0];
        setDayCareEdit({
          stayId,
          customerId: custId,
          animalId: animalId(b.animal),
          date: dateKey(new Date(b.date)),
          dropOffPeriod: b.dropOffPeriod ?? 'AM',
          dropOffTime: b.dropOffTime ?? '',
          collectionPeriod: b.collectionPeriod ?? 'PM',
          collectionTime: b.collectionTime ?? '',
        });
      }
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to load this booking');
    }
  }

  async function handleDeleteStay(stayId: string) {
    if (!window.confirm('This is part of a booking. Delete the whole booking (all its days and any travel)?')) {
      return;
    }
    setEditError(null);
    try {
      await api.deleteStay(stayId);
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Failed to remove this booking');
    }
  }

  const editHandlers: StayEditHandlers = { onEdit: handleEditStay, onDelete: handleDeleteStay };

  return (
    <div>
      <div className="page-header">
        <h1>Boarding &amp; Day Care</h1>
      </div>
      <div className="tabs">
        {(['dashboard', 'upcoming', 'occupancy'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {editError && <div className="error-banner">{editError}</div>}
      {tab === 'dashboard' && <DashboardTab mapping={mapping} refreshSignal={refreshSignal} {...editHandlers} />}
      {tab === 'upcoming' && <UpcomingStaysTab mapping={mapping} refreshSignal={refreshSignal} {...editHandlers} />}
      {tab === 'occupancy' && <OccupancyTab mapping={mapping} />}

      {(boardingEdit || dayCareEdit) && (
        <NewBookingModal
          animals={animals}
          customers={customers}
          boardingInitial={boardingEdit ?? undefined}
          dayCareInitial={dayCareEdit ?? undefined}
          onClose={() => {
            setBoardingEdit(null);
            setDayCareEdit(null);
          }}
          onCreated={() => {
            setBoardingEdit(null);
            setDayCareEdit(null);
            setRefreshSignal((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

function DashboardTab({ mapping, refreshSignal, onEdit, onDelete }: { mapping: VisitMapping | null; refreshSignal: number } & StayEditHandlers) {
  const [dayBookings, setDayBookings] = useState<DayBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A wide-ish window either side of today so a stay that started or ends
  // outside the visible "today" date is still fully captured for the
  // arriving/departing-today logic below (same tradeoff Upcoming Stays and
  // Occupancy both already accept for their own fetch windows) -- this same
  // window also always fully covers the *current calendar month* (30 days
  // either side of any day within a month reaches both its ends), which is
  // what the projected-income tiles below need.
  useEffect(() => {
    const from = addDays(new Date(), -30);
    const to = addDays(new Date(), 30);
    api
      .listDayBookings(dateKey(from), dateKey(addDays(to, 1)))
      .then(setDayBookings)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bookings'));
  }, [refreshSignal]);

  const today = new Date();
  const todayKey = dateKey(today);

  const todayCounts: Record<Section, number> = useMemo(() => {
    const counts: Record<Section, number> = { AM: 0, PM: 0, overnight: 0 };
    if (!dayBookings || !mapping) return counts;
    for (const b of dayBookings) {
      if (dateKey(new Date(b.date)) !== todayKey) continue;
      for (const section of sectionsFor(mapping, b)) counts[section] += b.quantity;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayBookings, mapping]);

  // This calendar month's projected income, split by Boarding vs Day Care --
  // "projected" because it includes every booking for the month regardless
  // of whether it's already happened or is still upcoming, priced at each
  // row's own product price x quantity (a placeholder row prices at 0 since
  // sectionsFor() already excludes it, matching it never being invoiced).
  const monthIncome = useMemo(() => {
    const result = { boarding: 0, dayCare: 0 };
    if (!dayBookings || !mapping) return result;
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    for (const b of dayBookings) {
      const date = new Date(b.date);
      if (date < monthStart || date > monthEnd) continue;
      const sections = sectionsFor(mapping, b);
      if (sections.length === 0) continue;
      const amount = productPrice(b.product) * b.quantity;
      if (sections.includes('overnight')) result.boarding += amount;
      else result.dayCare += amount;
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayBookings, mapping]);

  // Arrivals/departures only apply to an actual boarding stay (one with an
  // overnight row) -- a Day Care booking's stayId groups a single day whose
  // start and end date are the same, so grouping it the same way would
  // double-count it as both an arrival and a departure and it would never
  // reach the Day Care Today list. Every row of a Day Care-only stayId group
  // that falls today goes to dayCareToday instead.
  const { arrivals, departures, dayCareToday } = useMemo(() => {
    const empty = { arrivals: [] as DayBooking[], departures: [] as DayBooking[], dayCareToday: [] as DayBooking[] };
    if (!dayBookings || !mapping) return empty;
    const stays = new Map<string, DayBooking[]>();
    const standaloneToday: DayBooking[] = [];
    for (const b of dayBookings) {
      if (b.stayId) {
        const rows = stays.get(b.stayId) ?? [];
        rows.push(b);
        stays.set(b.stayId, rows);
      } else if (dateKey(new Date(b.date)) === todayKey && sectionsFor(mapping, b).length > 0) {
        standaloneToday.push(b);
      }
    }
    const arrivals: DayBooking[] = [];
    const departures: DayBooking[] = [];
    const dayCareToday: DayBooking[] = [...standaloneToday];
    for (const rows of stays.values()) {
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const isBoarding = sorted.some((r) => sectionsFor(mapping, r).includes('overnight'));
      if (isBoarding) {
        if (dateKey(new Date(sorted[0].date)) === todayKey) arrivals.push(sorted[0]);
        if (dateKey(new Date(sorted[sorted.length - 1].date)) === todayKey) departures.push(sorted[sorted.length - 1]);
      } else {
        for (const r of sorted) {
          if (dateKey(new Date(r.date)) === todayKey) dayCareToday.push(r);
        }
      }
    }
    return { arrivals, departures, dayCareToday };
  }, [dayBookings, mapping, todayKey]);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
        {SECTIONS.map((s) => (
          <div
            key={s}
            className="card"
            style={{
              textAlign: 'center',
              border: todayCounts[s] >= CAPACITY_PER_SECTION ? '1px solid var(--error)' : undefined,
            }}
          >
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem', fontWeight: 600 }}>{SECTION_LABELS[s]}</div>
            <div
              style={{
                fontSize: '2rem',
                fontWeight: 700,
                color: todayCounts[s] >= CAPACITY_PER_SECTION ? 'var(--error)' : 'var(--brand-green)',
              }}
            >
              {todayCounts[s]}/{CAPACITY_PER_SECTION}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem', fontWeight: 600 }}>
            This Month's Projected Income — Boarding
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>£{monthIncome.boarding.toFixed(2)}</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem', fontWeight: 600 }}>
            This Month's Projected Income — Day Care
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>£{monthIncome.dayCare.toFixed(2)}</div>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!dayBookings || !mapping ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <DashboardList
            title="Arriving Today"
            rows={arrivals}
            empty="No arrivals today."
            detail={(b) => b.dropOffTime || undefined}
            onEdit={onEdit}
            onDelete={onDelete}
          />
          <DashboardList
            title="Departing Today"
            rows={departures}
            empty="No departures today."
            detail={(b) => b.pickUpTime || undefined}
            onEdit={onEdit}
            onDelete={onDelete}
          />
          <DashboardList
            title="Day Care Today"
            rows={dayCareToday}
            empty="No day care today."
            detail={(b) => {
              const sections = sectionsFor(mapping, b);
              const label = sections.length > 1 ? 'Full Day' : SECTION_LABELS[sections[0]]?.split(' ')[0];
              const time = b.pickUpTime || b.collectionTime || b.dropOffTime;
              return time ? `${label} · collect ${time}` : label;
            }}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      )}
    </div>
  );
}

function DashboardList({
  title,
  rows,
  empty,
  detail,
  onEdit,
  onDelete,
}: {
  title: string;
  rows: DayBooking[];
  empty: string;
  /** A short piece of extra info shown between the dog and customer name -- a time or an AM/PM/Full Day label. */
  detail: (b: DayBooking) => string | undefined;
} & StayEditHandlers) {
  return (
    <div className="card" style={{ flex: '1 1 260px', minWidth: 260 }}>
      <div className="section-title" style={{ marginTop: 0 }}>
        {title} ({rows.length})
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">{empty}</div>
      ) : (
        rows.map((b) => (
          <div key={b._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
            <button
              type="button"
              className="btn-link"
              disabled={!b.stayId}
              onClick={() => b.stayId && onEdit(b.stayId)}
              style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}
            >
              <span style={{ fontWeight: 600, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {animalLabel(b.animal)}
              </span>
              {detail(b) && <span style={{ color: 'var(--accent-dark)', fontWeight: 600, flexShrink: 0 }}>{detail(b)}</span>}
              <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{customerLabel(b.customer)}</span>
            </button>
            {b.stayId && (
              <button type="button" className="icon-btn icon-btn-danger" title="Remove" style={{ flexShrink: 0 }} onClick={() => onDelete(b.stayId!)}>
                <TrashIcon />
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

interface StayEntry {
  key: string;
  stayId?: string;
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

function UpcomingStaysTab({ mapping, refreshSignal, onEdit, onDelete }: { mapping: VisitMapping | null; refreshSignal: number } & StayEditHandlers) {
  const [rangeDays, setRangeDays] = useState(30);
  const [dayBookings, setDayBookings] = useState<DayBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const from = new Date();
    const to = addDays(from, rangeDays);
    api
      .listDayBookings(dateKey(from), dateKey(addDays(to, 1)))
      .then(setDayBookings)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bookings'));
  }, [rangeDays, refreshSignal]);

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
        stayId,
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
      // A Half Day row occupies exactly one section, worth naming (the
      // product name alone doesn't say which half) -- a Full Day row
      // occupies both AM and PM, and the product name already says "Full
      // Day" unambiguously, so nothing more is appended for it.
      const sections = sectionsFor(mapping, b);
      const type = sections.length === 1 ? `${productLabel(b.product)} (${SECTION_LABELS[sections[0]]})` : productLabel(b.product);
      result.push({
        key: b._id,
        stayId: undefined,
        animal: animalLabel(b.animal),
        customer: customerLabel(b.customer),
        type,
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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.key} onClick={() => e.stayId && onEdit(e.stayId)} style={{ cursor: e.stayId ? 'pointer' : undefined }}>
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
                <td onClick={(ev) => ev.stopPropagation()}>
                  {e.stayId && (
                    <button type="button" className="icon-btn icon-btn-danger" title="Remove" onClick={() => onDelete(e.stayId!)}>
                      <TrashIcon />
                    </button>
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

const SECTION_COLORS: Record<Section, { bg: string; fg: string }> = {
  AM: { bg: '#fff4cc', fg: '#8a6d00' },
  PM: { bg: '#ede9fe', fg: '#6d28d9' },
  overnight: { bg: '#ccfbf1', fg: '#0f766e' },
};

// One section's row of slots within a day cell -- one small named box per
// occupied slot (not just a count), plus empty boxes up to the capacity
// limit so how much room is left is visible at a glance. Renders extra
// boxes (in red) past the limit rather than truncating real bookings.
function SectionSlotsRow({ section, bookings }: { section: Section; bookings: DayBooking[] }) {
  const slotCount = Math.max(CAPACITY_PER_SECTION, bookings.length);
  const colors = SECTION_COLORS[section];
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 3 }}>
        {section === 'overnight' ? 'Overnight' : section}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
        {Array.from({ length: slotCount }, (_, i) => {
          const booking = bookings[i];
          const overCapacity = i >= CAPACITY_PER_SECTION;
          return (
            <div
              key={i}
              title={booking ? `${animalLabel(booking.animal)} (${customerLabel(booking.customer)})` : undefined}
              style={{
                height: 26,
                borderRadius: 4,
                fontSize: '0.78rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                padding: '0 4px',
                border: booking ? 'none' : '1px dashed var(--border)',
                background: booking ? (overCapacity ? 'var(--error)' : colors.bg) : 'transparent',
                color: booking ? (overCapacity ? 'white' : colors.fg) : 'transparent',
              }}
            >
              {booking ? animalLabel(booking.animal) : ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OccupancyTab({ mapping }: { mapping: VisitMapping | null }) {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [dayBookings, setDayBookings] = useState<DayBooking[] | null>(null);
  const [annualLeave, setAnnualLeave] = useState<AnnualLeave[]>([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, anchorDate]);

  useEffect(() => {
    api.listAnnualLeave().then(setAnnualLeave).catch(() => {});
  }, []);

  function entriesForDay(date: Date): DayBooking[] {
    return (dayBookings ?? []).filter((b) => isSameDay(new Date(b.date), date));
  }

  // Every booking occupying each section that day -- the grid cell renders
  // one small named box per entry (not just a count), so staff can see at a
  // glance which dogs, not just how many.
  function bookingsBySection(date: Date): Record<Section, DayBooking[]> {
    const bySection: Record<Section, DayBooking[]> = { AM: [], PM: [], overnight: [] };
    if (!mapping) return bySection;
    for (const b of entriesForDay(date)) {
      for (const section of sectionsFor(mapping, b)) bySection[section].push(b);
    }
    return bySection;
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
              const bySection = bookingsBySection(date);
              const anyAtCapacity = SECTIONS.some((s) => bySection[s].length >= CAPACITY_PER_SECTION);
              const inMonth = viewMode === 'week' || date.getMonth() === anchorDate.getMonth();
              const leave = annualLeaveOn(date, annualLeave);
              return (
                <button
                  type="button"
                  key={dateKey(date)}
                  onClick={() => setSelectedDate(date)}
                  title={leave ? `Annual Leave: ${leave.name}` : undefined}
                  style={{
                    position: 'relative',
                    textAlign: 'left',
                    border: `1px solid ${anyAtCapacity ? 'var(--error)' : 'var(--border)'}`,
                    borderRadius: 8,
                    padding: 8,
                    background: leave ? '#fef2f2' : isToday(date) ? 'var(--sage-badge, #eef5ee)' : 'white',
                    opacity: inMonth ? 1 : 0.45,
                    cursor: 'pointer',
                  }}
                >
                  {leave && (
                    <svg
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                      preserveAspectRatio="none"
                    >
                      <line x1="4" y1="4" x2="100%" y2="100%" stroke="#dc2626" strokeWidth="2" opacity="0.55" />
                      <line x1="100%" y1="4" x2="4" y2="100%" stroke="#dc2626" strokeWidth="2" opacity="0.55" />
                    </svg>
                  )}
                  <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 6 }}>{date.getDate()}</div>
                  {SECTIONS.map((s) => (
                    <SectionSlotsRow key={s} section={s} bookings={bySection[s]} />
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
