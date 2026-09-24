import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api/client';
import { useAuth } from '../auth/AuthContext';
import AddPaymentModal from '../components/AddPaymentModal';
import AmendBoardingBookingDatesModal from '../components/AmendBoardingBookingDatesModal';
import Badge from '../components/Badge';
import FormFillModal from '../components/FormFillModal';
import Modal from '../components/Modal';
import NewBoardingBookingModal from '../components/NewBoardingBookingModal';
import NewBookingModal from '../components/NewBookingModal';
import type { BoardingEditInitial, DayCareEditInitial } from '../components/NewBookingModal';
import SignaturePad from '../components/SignaturePad';
import ViewAnimalModal from '../components/ViewAnimalModal';
import ViewCustomerModal from '../components/ViewCustomerModal';
import ViewFormSubmissionModal from '../components/ViewFormSubmissionModal';
import { ChevronDownIcon, TrashIcon } from '../components/icons';
import { buildChecklistPdf, buildChecklistsPdf } from '../pdf/checklistPdf';
import {
  BOOKING_STATUS_LABELS,
  type Animal,
  type AnnualLeave,
  type BoardingBookingStage,
  type BoardingBookingWithStatus,
  type BookingStatusLabel,
  type ChecklistAssignment,
  type ChecklistTemplate,
  type Customer,
  type DayBooking,
  type FormSubmissionRecord,
  type Invoice,
  type Payment,
  type VisitMapping,
} from '../types';
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
function parseHour(time: string | null | undefined): number | null {
  if (!time) return null;
  const hour = parseInt(time, 10);
  return Number.isNaN(hour) ? null : hour;
}

// A stay's last row is dated by the calendar day its leftover Day Care block
// STARTS on (see backend's computeBoardingPlan day-offset comment), which
// isn't necessarily the day pick-up actually happens -- if that block's
// duration pushes pick-up time earlier in the clock than drop-off time, it
// crossed midnight. Every 24h boarding block preserves time-of-day, so
// comparing the two clock times (rather than redoing the hours/boardingDays
// math) reliably detects that using only what's already on the stay's rows.
function stayEndDate(lastRowDate: Date, dropOffTime: string | null | undefined, pickUpTime: string | null | undefined): Date {
  if (dropOffTime && pickUpTime && pickUpTime < dropOffTime) return addDays(lastRowDate, 1);
  return lastRowDate;
}

function sectionsFor(mapping: VisitMapping, b: DayBooking): Section[] {
  const pid = productId(b.product);
  if (pid === mapping.boardingPerDayProduct || pid === mapping.boardingSecondDogPerDayProduct) {
    if (b.placeholder) return [];
    let sections: Section[] = ['AM', 'PM', 'overnight'];
    // Middle nights of a stay have neither field set and stay full
    // occupancy. The first/last calendar day of the stay only has the dog
    // there for part of the day -- trim by the actual drop-off/pick-up time
    // (dropOffTime is only ever set on the stay's first row, pickUpTime only
    // on its last -- see backend's day-booking.schema.ts) rather than always
    // treating every boarding row as full-day-plus-overnight.
    const dropHour = parseHour(b.dropOffTime);
    if (dropHour !== null && dropHour >= 13) sections = sections.filter((s) => s !== 'AM');
    const pickHour = parseHour(b.pickUpTime);
    if (pickHour !== null) {
      sections = sections.filter((s) => s !== 'overnight'); // leaving that day, not staying the night
      if (pickHour < 13) sections = sections.filter((s) => s !== 'PM');
    }
    return sections;
  }
  if (pid === mapping.dayCareFullDayProduct || pid === mapping.dayCareSecondDogFullDayProduct) {
    let sections: Section[] = ['AM', 'PM'];
    // Only trim a boarding stay's attached leftover Full Day by its actual
    // times (same reasoning as the boarding branch above) -- a standalone
    // Full Day booking's own product selection already guarantees an AM
    // drop-off and PM collection, so it always spans both.
    if (b.boardingStay) {
      const dropHour = parseHour(b.dropOffTime);
      if (dropHour !== null && dropHour >= 13) sections = sections.filter((s) => s !== 'AM');
      const pickHour = parseHour(b.pickUpTime);
      if (pickHour !== null && pickHour < 13) sections = sections.filter((s) => s !== 'PM');
    }
    return sections;
  }
  if (
    pid === mapping.dayCareHalfDayProduct ||
    pid === mapping.dayCareSecondDogHalfDayProduct ||
    pid === mapping.boardingHalfDayProduct ||
    pid === mapping.boardingSecondDogHalfDayProduct
  ) {
    // Half Day doesn't store which half separately. A standalone day-care
    // booking has dropOffPeriod/collectionPeriod (AM/AM or PM/PM for a half
    // day); a boarding stay's attached leftover day only has dropOffTime/
    // pickUpTime instead (see backend's day-booking.schema.ts). Falls back
    // to AM if genuinely nothing is set, so every row still lands somewhere.
    const period = b.dropOffPeriod ?? b.collectionPeriod;
    if (period) return [period === 'PM' ? 'PM' : 'AM'];
    const timeStr = b.dropOffTime || b.collectionTime || b.pickUpTime;
    const hour = parseHour(timeStr);
    if (hour !== null) return [hour < 13 ? 'AM' : 'PM'];
    return ['AM'];
  }
  return [];
}

interface StayEditHandlers {
  onEdit: (stayId: string) => void;
  onDelete: (stayId: string) => void;
}

type Tab = 'dashboard' | 'bookings' | 'occupancy' | 'checklists';
const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'Dashboard',
  bookings: 'Bookings',
  occupancy: 'Occupancy',
  checklists: 'Checklists',
};

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
  // One-shot: set to jump the Bookings tab straight to a specific booking's
  // detail (e.g. clicking a name in the Dashboard's Arriving Today list) --
  // BookingsTab consumes it once and reports back via onOpenBookingConsumed.
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);
  // Set alongside openBookingId when the Dashboard's "Check In"/"Check Out"
  // button (not just the row itself) was clicked -- BookingDetail consumes
  // this once too, to jump straight into that form instead of just opening
  // the booking's detail page.
  const [openBookingAutoStage, setOpenBookingAutoStage] = useState<'checkIn' | 'checkOut' | undefined>(undefined);

  function handleNavigateToBooking(bookingId: string, autoStage?: 'checkIn' | 'checkOut') {
    setTab('bookings');
    setOpenBookingId(bookingId);
    setOpenBookingAutoStage(autoStage);
  }

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
        const dropOffTime = sorted.find((r) => r.dropOffTime)?.dropOffTime ?? '';
        const pickUpTime = sorted.find((r) => r.pickUpTime)?.pickUpTime ?? '';
        setBoardingEdit({
          stayId,
          customerId: custId,
          animalIds: [...new Set(sorted.map((r) => animalId(r.animal)))],
          startDate: dateKey(new Date(sorted[0].date)),
          endDate: dateKey(stayEndDate(new Date(sorted[sorted.length - 1].date), dropOffTime, pickUpTime)),
          dropOffTime,
          pickUpTime,
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
        {(['dashboard', 'bookings', 'occupancy', 'checklists'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {editError && <div className="error-banner">{editError}</div>}
      {tab === 'dashboard' && (
        <DashboardTab mapping={mapping} refreshSignal={refreshSignal} onNavigateToBooking={handleNavigateToBooking} {...editHandlers} />
      )}
      {tab === 'occupancy' && <OccupancyTab mapping={mapping} />}
      {tab === 'bookings' && (
        <BookingsTab
          animals={animals}
          customers={customers}
          openBookingId={openBookingId}
          openBookingAutoStage={openBookingAutoStage}
          onOpenBookingConsumed={() => {
            setOpenBookingId(null);
            setOpenBookingAutoStage(undefined);
          }}
        />
      )}
      {tab === 'checklists' && <ChecklistsTab />}

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

function DashboardTab({
  mapping,
  refreshSignal,
  onEdit,
  onDelete,
  onNavigateToBooking,
}: {
  mapping: VisitMapping | null;
  refreshSignal: number;
  onNavigateToBooking: (bookingId: string, autoStage?: 'checkIn' | 'checkOut') => void;
} & StayEditHandlers) {
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
        const dropOffTime = sorted.find((r) => r.dropOffTime)?.dropOffTime;
        const pickUpTime = sorted.find((r) => r.pickUpTime)?.pickUpTime;
        if (dateKey(new Date(sorted[0].date)) === todayKey) arrivals.push(sorted[0]);
        if (dateKey(stayEndDate(new Date(sorted[sorted.length - 1].date), dropOffTime, pickUpTime)) === todayKey) {
          departures.push(sorted[sorted.length - 1]);
        }
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
            checkStage="checkIn"
            onEdit={onEdit}
            onDelete={onDelete}
            onNavigateToBooking={onNavigateToBooking}
          />
          <DashboardList
            title="Departing Today"
            rows={departures}
            empty="No departures today."
            detail={(b) => b.pickUpTime || undefined}
            checkStage="checkOut"
            onEdit={onEdit}
            onDelete={onDelete}
            onNavigateToBooking={onNavigateToBooking}
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
            onNavigateToBooking={onNavigateToBooking}
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
  checkStage,
  onEdit,
  onDelete,
  onNavigateToBooking,
}: {
  title: string;
  rows: DayBooking[];
  empty: string;
  /** A short piece of extra info shown between the dog and customer name -- a time or an AM/PM/Full Day label. */
  detail: (b: DayBooking) => string | undefined;
  // Set for Arriving/Departing Today (not Day Care Today) -- shows a
  // "Check In"/"Check Out" button next to Remove that jumps straight into
  // that form, skipping the "open the booking, find the Forms card, click
  // Fill in" detour.
  checkStage?: 'checkIn' | 'checkOut';
  onNavigateToBooking: (bookingId: string, autoStage?: 'checkIn' | 'checkOut') => void;
} & StayEditHandlers) {
  // A stayId either belongs to the new reference-numbered BoardingBooking
  // workflow (jump straight to its detail page, optionally straight into
  // autoStage's form) or predates it/was created outside it (fall back to
  // the legacy edit-modal behaviour -- which has no check-in/check-out
  // concept, so autoStage is simply dropped in that case).
  async function handleRowClick(stayId: string, autoStage?: 'checkIn' | 'checkOut') {
    try {
      const booking = await api.getBoardingBookingByStay(stayId);
      if (booking) {
        onNavigateToBooking(booking._id, autoStage);
        return;
      }
    } catch {
      // fall through to legacy edit
    }
    onEdit(stayId);
  }

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
              onClick={() => b.stayId && handleRowClick(b.stayId)}
              style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}
            >
              <span style={{ fontWeight: 600, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {animalLabel(b.animal)}
              </span>
              {detail(b) && <span style={{ color: 'var(--accent-dark)', fontWeight: 600, flexShrink: 0 }}>{detail(b)}</span>}
              <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{customerLabel(b.customer)}</span>
            </button>
            {checkStage && b.stayId && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ flexShrink: 0 }}
                onClick={() => handleRowClick(b.stayId!, checkStage)}
              >
                {checkStage === 'checkIn' ? 'Check In' : 'Check Out'}
              </button>
            )}
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

// A stable (not re-randomized on every render), distinct-looking colour per
// booking rather than per section -- so the same dog's boarding stay reads
// as one colour across every day it spans, and a different booking sharing
// a day with it is visually distinguishable. Hashes the stay (or the row
// itself, for a standalone day-care booking) rather than the animal, since
// two different stays for the same dog should still read as separate
// bookings. Mid-tone (not the pale tint colorForBooking used to return) --
// the timeline bar itself carries the colour now, not text sitting on it.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function colorForBooking(b: DayBooking): string {
  const hue = hashString(b.stayId ?? b._id) % 360;
  return `hsl(${hue}, 60%, 62%)`;
}

// Same category check sectionsFor() uses (Boarding Per Day/Half Day, Day
// Care Half/Full Day), but also true for a placeholder row -- it's unbilled
// and sectionsFor deliberately excludes it from capacity, but it still
// represents a real dog on-site that morning, so the timeline still shows it.
function isOccupancyRow(mapping: VisitMapping, b: DayBooking): boolean {
  const pid = productId(b.product);
  return [
    mapping.boardingPerDayProduct,
    mapping.boardingSecondDogPerDayProduct,
    mapping.boardingHalfDayProduct,
    mapping.boardingSecondDogHalfDayProduct,
    mapping.dayCareFullDayProduct,
    mapping.dayCareSecondDogFullDayProduct,
    mapping.dayCareHalfDayProduct,
    mapping.dayCareSecondDogHalfDayProduct,
  ].some((p) => p === pid);
}

function hourFraction(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h + (m || 0) / 60) / 24;
}

// Where a booking's presence bar starts/ends on a 24h axis for the day it's
// on. "Exact" means a real drop-off/collection time or period is on this
// row, so that end gets a rounded cap; when neither is set, presence
// defaults to the day's own edge with a square "continues" cap -- a
// boarding stay's middle night (present all day, before and after this one),
// or the unset side of its first/last day.
function timelineSpan(b: DayBooking): { start: number; end: number; startExact: boolean; endExact: boolean } {
  let start = 0;
  let startExact = false;
  if (b.dropOffTime) {
    start = hourFraction(b.dropOffTime);
    startExact = true;
  } else if (b.dropOffPeriod) {
    start = b.dropOffPeriod === 'PM' ? 13 / 24 : 8 / 24;
    startExact = true;
  }
  let end = 1;
  let endExact = false;
  const pickup = b.pickUpTime || b.collectionTime;
  if (pickup) {
    end = hourFraction(pickup);
    endExact = true;
  } else if (b.collectionPeriod) {
    end = b.collectionPeriod === 'AM' ? 13 / 24 : 18 / 24;
    endExact = true;
  }
  return { start, end, startExact, endExact };
}

// Light background bands marking the AM (8am-1pm) / PM (1pm-6pm) reference
// zones on the same 24h axis timelineSpan positions bars against; overnight
// (either side) is left untinted.
const TIMELINE_BANDS = 'linear-gradient(to right, transparent 0 33.333%, #fff6de 33.333% 54.167%, #efeafd 54.167% 75%, transparent 75% 100%)';

// One booking's presence for one day, as a bar on the 24h axis rather than a
// named box in a fixed AM/PM/Overnight grid -- its position and length
// reflect the actual drop-off/collection time instead of snapping to a
// section. `hideLabel` drops the dog-name column for the bigger day modal,
// where the name's already shown as a heading above.
function TimelineRow({ booking, large, hideLabel }: { booking: DayBooking; large?: boolean; hideLabel?: boolean }) {
  const span = timelineSpan(booking);
  const color = colorForBooking(booking);
  const height = large ? 22 : 12;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: large ? 0 : 3 }}>
      {!hideLabel && (
        <span
          title={`${animalLabel(booking.animal)} (${customerLabel(booking.customer)})`}
          style={{
            width: 40,
            flexShrink: 0,
            fontSize: '0.65rem',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {animalLabel(booking.animal)}
        </span>
      )}
      <div style={{ position: 'relative', flex: 1, height, borderRadius: 4, background: TIMELINE_BANDS }}>
        <div
          style={{
            position: 'absolute',
            left: `${span.start * 100}%`,
            width: `${Math.max(2, (span.end - span.start) * 100)}%`,
            top: 0,
            height,
            background: color,
            borderTopLeftRadius: span.startExact ? 4 : 0,
            borderBottomLeftRadius: span.startExact ? 4 : 0,
            borderTopRightRadius: span.endExact ? 4 : 0,
            borderBottomRightRadius: span.endExact ? 4 : 0,
          }}
        />
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
  const [selectedBooking, setSelectedBooking] = useState<DayBooking | null>(null);

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

  // The rows the timeline actually draws a bar for -- see isOccupancyRow.
  function occupancyEntriesForDay(date: Date): DayBooking[] {
    if (!mapping) return [];
    return entriesForDay(date)
      .filter((b) => isOccupancyRow(mapping, b))
      .sort((a, b) => timelineSpan(a).start - timelineSpan(b).start);
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
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '-6px 0 12px' }}>
          Each bar spans the day proportionally to its actual drop-off/collection time -- tinted bands mark AM
          (8am–1pm) and PM (1pm–6pm); untinted is overnight.
        </p>
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
                  {occupancyEntriesForDay(date).map((b) => (
                    <TimelineRow key={b._id} booking={b} />
                  ))}
                </button>
              );
            }),
          )}
        </div>
      </div>

      {selectedDate && (
        <Modal
          title={selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          onClose={() => setSelectedDate(null)}
          wide
          headerActions={
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedDate((d) => (d ? addDays(d, -1) : d))}
                aria-label="Previous day"
              >
                ←
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedDate((d) => (d ? addDays(d, 1) : d))}
                aria-label="Next day"
              >
                →
              </button>
            </div>
          }
        >
          {occupancyEntriesForDay(selectedDate).length === 0 ? (
            <div className="empty-state">No boarding or day care that day.</div>
          ) : (
            occupancyEntriesForDay(selectedDate).map((b) => {
              const pickup = b.pickUpTime || b.collectionTime;
              return (
                <div key={b._id} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <button
                      type="button"
                      className="btn-link"
                      style={{ fontSize: '0.9rem', fontWeight: 700, padding: 0 }}
                      onClick={() => setSelectedBooking(b)}
                    >
                      {animalLabel(b.animal)}
                    </button>
                    <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{customerLabel(b.customer)}</span>
                  </div>
                  {(b.dropOffTime || pickup) && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 6 }}>
                      {b.dropOffTime && `Drop off ${b.dropOffTime}`}
                      {b.dropOffTime && pickup && ' · '}
                      {pickup && `Collect ${pickup}`}
                    </div>
                  )}
                  <TimelineRow booking={b} large hideLabel />
                </div>
              );
            })
          )}
          {occupancyEntriesForDay(selectedDate).length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>12am</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>8am</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>1pm</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>6pm</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>12am</span>
            </div>
          )}
        </Modal>
      )}

      {selectedBooking && <BookingDetailModal booking={selectedBooking} onClose={() => setSelectedBooking(null)} />}
    </div>
  );
}

// Clicking a dog's name in the day modal opens this -- every row of the same
// stay (boarding stay, or a day-care day + its travel row), plus whichever
// invoice they've been billed on and the payments recorded against it, so
// staff can see a booking's full picture (dates, invoice status, deposit/
// payments) without leaving the calendar.
function BookingDetailModal({ booking, onClose }: { booking: DayBooking; onClose: () => void }) {
  const [rows, setRows] = useState<DayBooking[] | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const stayRows = booking.stayId ? await api.getBoardingStay(booking.stayId) : [booking];
        if (cancelled) return;
        setRows(stayRows);
        const invoiceRef = stayRows.find((r) => r.invoice)?.invoice;
        const invoiceId = invoiceRef ? (typeof invoiceRef === 'string' ? invoiceRef : invoiceRef._id) : null;
        if (!invoiceId) {
          setInvoice(null);
          setPayments(null);
          return;
        }
        const [inv, allPayments] = await Promise.all([api.getInvoice(invoiceId), api.listPayments()]);
        if (cancelled) return;
        setInvoice(inv);
        setPayments(
          allPayments.filter((p) => {
            const pid = typeof p.invoice === 'string' ? p.invoice : p.invoice?._id;
            return pid === invoiceId;
          }),
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load this booking');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [booking]);

  const balanceDue = invoice ? invoice.total - (invoice.amountPaid ?? 0) : 0;

  return (
    <Modal title={`${animalLabel(booking.animal)} · ${customerLabel(booking.customer)}`} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      {!rows ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>Times</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => !r.placeholder)
                .map((r) => {
                  const pickup = r.pickUpTime || r.collectionTime;
                  return (
                    <tr key={r._id}>
                      <td>{new Date(r.date).toLocaleDateString('en-GB')}</td>
                      <td>{productLabel(r.product)}</td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                        {r.dropOffTime && `Drop off ${r.dropOffTime}`}
                        {r.dropOffTime && pickup && ' · '}
                        {pickup && `Collect ${pickup}`}
                        {!r.dropOffTime && !pickup && '—'}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>

          <div className="section-title" style={{ marginTop: 16 }}>
            Invoice
          </div>
          {!invoice ? (
            <div className="empty-state">Not yet invoiced.</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <strong>{invoice.invoiceNumber}</strong>
                  <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                    Total £{invoice.total.toFixed(2)} · Paid £{(invoice.amountPaid ?? 0).toFixed(2)}
                    {balanceDue > 0 ? ` · Balance £${balanceDue.toFixed(2)}` : ' · Paid in full'}
                  </div>
                </div>
                <Badge value={invoice.status} />
              </div>

              <div className="section-title">Payments</div>
              {!payments || payments.length === 0 ? (
                <div className="empty-state">No payments recorded yet.</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Payment ID</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p._id}>
                        <td>{p.paymentId}</td>
                        <td>{new Date(p.date).toLocaleDateString('en-GB')}</td>
                        <td>£{p.amount.toFixed(2)}</td>
                        <td>{p.paymentMethod || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}

function boardingCustomerLabel(customer: BoardingBookingWithStatus['booking']['customer']): string {
  return typeof customer === 'string' ? customer : customer.name;
}
function boardingAnimalNames(animals: BoardingBookingWithStatus['booking']['animals']): string {
  return animals.map((a) => (typeof a === 'string' ? a : a.name)).join(', ');
}
// Names only, dropping any unpopulated (bare-id) entries -- used to
// pre-populate a check-in/check-out form's "Pet" group so staff aren't
// re-selecting a dog the booking already names.
function boardingPetNames(animals: BoardingBookingWithStatus['booking']['animals']): string[] {
  return animals.map((a) => (typeof a === 'string' ? null : a.name)).filter((n): n is string => !!n);
}
function formatDateRange(booking: BoardingBookingWithStatus['booking']): string {
  const start = new Date(booking.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (booking.type === 'dayCare' || booking.startDate === booking.endDate) return start;
  const end = new Date(booking.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${start} – ${end}`;
}

// Shared by the list's read-only pill and the detail header's editable one.
const STATUS_PILL_COLORS: Record<BookingStatusLabel, { bg: string; color: string }> = {
  Confirmed: { bg: '#f1efe8', color: 'var(--muted)' },
  'Invoice Raised': { bg: 'var(--info-light)', color: 'var(--info)' },
  'Deposit Requested': { bg: 'var(--accent-light)', color: 'var(--accent-dark)' },
  'Deposit Paid': { bg: 'var(--sage-badge)', color: 'var(--brand-green)' },
  'Pre Check In Complete': { bg: 'var(--sage-badge)', color: 'var(--brand-green)' },
  'Check In Complete': { bg: 'var(--sage-badge)', color: 'var(--brand-green)' },
  'In Progress': { bg: 'var(--accent-light)', color: 'var(--accent-dark)' },
  'Check Out Complete': { bg: 'var(--sage-badge)', color: 'var(--brand-green)' },
  'Booking Complete': { bg: 'var(--sage-badge)', color: 'var(--brand-green)' },
};

function BookingsTab({
  animals,
  customers,
  openBookingId,
  openBookingAutoStage,
  onOpenBookingConsumed,
}: {
  animals: Animal[];
  customers: Customer[];
  // Set by another tab (e.g. Dashboard's Arriving Today) to jump straight to
  // a specific booking's detail -- consumed once, then cleared via
  // onOpenBookingConsumed so navigating back to the list afterward behaves
  // normally.
  openBookingId?: string | null;
  // Set alongside openBookingId to also jump straight into that booking's
  // Check In/Check Out form (see BookingDetail's autoStage prop) rather than
  // just opening its detail page.
  openBookingAutoStage?: 'checkIn' | 'checkOut';
  onOpenBookingConsumed?: () => void;
}) {
  const [items, setItems] = useState<BoardingBookingWithStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Captured from openBookingAutoStage at the same moment selectedId is set
  // below -- openBookingId/openBookingAutoStage themselves get cleared
  // (via onOpenBookingConsumed) right after, so comparing against the props
  // on a later render would always see them already reset to null.
  const [autoStage, setAutoStage] = useState<'checkIn' | 'checkOut' | undefined>(undefined);
  const [showNew, setShowNew] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [viewTab, setViewTab] = useState<'current' | 'archive'>('current');
  const [archiving, setArchiving] = useState<string | null>(null);

  useEffect(() => {
    api.listBoardingBookings().then(setItems).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bookings'));
  }, [refreshSignal]);

  async function handleArchive(id: string, archived: boolean) {
    setArchiving(id);
    setError(null);
    try {
      await api.archiveBoardingBooking(id, archived);
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update this booking');
    } finally {
      setArchiving(null);
    }
  }

  useEffect(() => {
    if (openBookingId) {
      setSelectedId(openBookingId);
      setAutoStage(openBookingAutoStage);
      onOpenBookingConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openBookingId]);

  if (selectedId) {
    return (
      <BookingDetail
        id={selectedId}
        autoStage={autoStage}
        onBack={() => {
          setSelectedId(null);
          setRefreshSignal((n) => n + 1);
        }}
        onChanged={() => setRefreshSignal((n) => n + 1)}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          + New booking
        </button>
      </div>
      <div className="tabs">
        <button className={viewTab === 'current' ? 'active' : ''} onClick={() => setViewTab('current')}>
          Current
        </button>
        <button className={viewTab === 'archive' ? 'active' : ''} onClick={() => setViewTab('archive')}>
          Archive
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="card">
        {(() => {
          if (!items) return <div className="empty-state">Loading…</div>;
          const filtered = items.filter(({ booking }) => (viewTab === 'archive' ? booking.archived : !booking.archived));
          if (filtered.length === 0) {
            return <div className="empty-state">{viewTab === 'archive' ? 'No archived bookings.' : 'No bookings yet.'}</div>;
          }
          return (
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Customer</th>
                  <th>Dog(s)</th>
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Drop off</th>
                  <th>Pick up</th>
                  <th>Invoiced</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ booking, status }) => (
                  <tr
                    key={booking._id}
                    onClick={() => {
                      setAutoStage(undefined);
                      setSelectedId(booking._id);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{booking.reference}</td>
                    <td>{boardingCustomerLabel(booking.customer)}</td>
                    <td>{boardingAnimalNames(booking.animals)}</td>
                    <td>{booking.type === 'boarding' ? 'Boarding' : 'Day Care'}</td>
                    <td>{formatDateRange(booking)}</td>
                    <td>{booking.dropOffTime || '—'}</td>
                    <td>{booking.pickUpTime || '—'}</td>
                    <td>
                      {booking.invoice && (
                        <span title="Invoiced" style={{ color: 'var(--brand-green)' }}>
                          ✓
                        </span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: 999,
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          ...STATUS_PILL_COLORS[status],
                        }}
                      >
                        {status}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={archiving === booking._id}
                        onClick={() => handleArchive(booking._id, !booking.archived)}
                      >
                        {booking.archived ? 'Unarchive' : 'Archive'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}
      </div>
      {showNew && (
        <NewBoardingBookingModal
          animals={animals}
          customers={customers}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setRefreshSignal((n) => n + 1);
            setAutoStage(undefined);
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
}

const STAGE_DOT_SIZE = 26;

function StageDot({ stage }: { stage: BoardingBookingStage }) {
  const base: React.CSSProperties = {
    width: STAGE_DOT_SIZE,
    height: STAGE_DOT_SIZE,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.72rem',
    flexShrink: 0,
  };
  if (stage.done) {
    return <div style={{ ...base, background: 'var(--brand-green)', color: '#fff' }}>✓</div>;
  }
  if (stage.current) {
    return (
      <div style={{ ...base, background: '#fff', border: '2px solid var(--accent)', color: 'var(--accent)', fontWeight: 700 }} />
    );
  }
  return <div style={{ ...base, background: '#fff', border: '2px solid var(--border)', color: 'var(--muted)' }} />;
}

function BookingDetail({
  id,
  autoStage,
  onBack,
  onChanged,
}: {
  id: string;
  // Set by the Dashboard's "Check In"/"Check Out" button -- jumps straight
  // into that form (or, if it's already done, straight to viewing what was
  // submitted) once this booking's data has loaded, instead of leaving staff
  // to find and click "Fill in" themselves in the Forms card below.
  autoStage?: 'checkIn' | 'checkOut';
  onBack: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<BoardingBookingWithStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAmend, setShowAmend] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [fillFor, setFillFor] = useState<{
    stage: 'checkIn' | 'checkOut';
    submissionId: string;
    referenceSubmission?: FormSubmissionRecord | null;
    presetPetNames?: string[];
  } | null>(null);
  const [viewSubmission, setViewSubmission] = useState<FormSubmissionRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [viewCustomer, setViewCustomer] = useState<Customer | null>(null);
  const [viewAnimal, setViewAnimal] = useState<Animal | null>(null);

  function refresh() {
    api
      .getBoardingBooking(id)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load this booking'));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [id]);

  async function handleRequestPayment(type: 'deposit' | 'full') {
    setRequesting(true);
    setError(null);
    try {
      await api.requestBoardingBookingPayment(id, type);
      refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request payment');
    } finally {
      setRequesting(false);
    }
  }

  // `value` is '' for the "Automatic" option -- clears the override rather
  // than setting a literal status.
  async function handleSetStatus(value: string) {
    setSavingStatus(true);
    setError(null);
    try {
      const updated = await api.setBoardingBookingStatus(id, (value || null) as BookingStatusLabel | null);
      setData(updated);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change the status');
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleDelete(deleteAll = false) {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteBoardingBooking(id, deleteAll);
      onChanged();
      onBack();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete this booking');
      setDeleting(false);
    }
  }

  async function handleViewCustomer() {
    if (!data) return;
    const customerId = typeof data.booking.customer === 'string' ? data.booking.customer : data.booking.customer._id;
    try {
      setViewCustomer(await api.getCustomer(customerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load this customer');
    }
  }

  async function handleViewAnimal(animalId: string) {
    if (!data) return;
    const customerId = typeof data.booking.customer === 'string' ? data.booking.customer : data.booking.customer._id;
    try {
      const animals = await api.listAnimals(customerId);
      const animal = animals.find((a) => a._id === animalId);
      if (animal) setViewAnimal(animal);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load this pet');
    }
  }

  async function handleSendPreCheckIn() {
    setError(null);
    try {
      await api.sendBoardingBookingPreCheckIn(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the pre-check-in link');
    }
  }

  async function handleViewSubmission(submissionId?: string) {
    if (!submissionId) return;
    try {
      setViewSubmission(await api.getFormSubmission(submissionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load that submission');
    }
  }

  async function startCheckIn() {
    if (!data) return;
    const workflow = await api.getBoardingWorkflowSettings();
    const formId = data.booking.type === 'boarding' ? workflow.checkInFormBoarding : workflow.checkInFormDayCare;
    if (!formId) {
      setError(`No check-in form is configured for ${data.booking.type === 'boarding' ? 'Boarding' : 'Day Care'} yet -- set one in Settings > Boarding first.`);
      return;
    }
    const customer = data.booking.customer;
    const customerId = typeof customer === 'string' ? customer : customer._id;
    const submission = await api.createFormSubmission({
      form: formId,
      customer: customerId,
      animals: data.booking.animals.map((a) => (typeof a === 'string' ? a : a._id)),
      recipientEmail: typeof customer === 'string' ? '' : customer.email,
      recipientName: typeof customer === 'string' ? undefined : customer.name,
    });
    setFillFor({ stage: 'checkIn', submissionId: submission._id, presetPetNames: boardingPetNames(data.booking.animals) });
  }

  async function startCheckOut() {
    if (!data) return;
    const workflow = await api.getBoardingWorkflowSettings();
    const formId = data.booking.type === 'boarding' ? workflow.checkOutFormBoarding : workflow.checkOutFormDayCare;
    if (!formId) {
      setError(`No check-out form is configured for ${data.booking.type === 'boarding' ? 'Boarding' : 'Day Care'} yet -- set one in Settings > Boarding first.`);
      return;
    }
    const customer = data.booking.customer;
    const customerId = typeof customer === 'string' ? customer : customer._id;
    const submission = await api.createFormSubmission({
      form: formId,
      customer: customerId,
      animals: data.booking.animals.map((a) => (typeof a === 'string' ? a : a._id)),
      recipientEmail: typeof customer === 'string' ? '' : customer.email,
      recipientName: typeof customer === 'string' ? undefined : customer.name,
    });
    // Shown read-only above the check-out form, so staff can see what was
    // recorded at drop-off while filling in collection details.
    const referenceSubmission = data.booking.checkInSubmission
      ? await api.getFormSubmission(data.booking.checkInSubmission).catch(() => null)
      : null;
    setFillFor({
      stage: 'checkOut',
      submissionId: submission._id,
      referenceSubmission,
      presetPetNames: boardingPetNames(data.booking.animals),
    });
  }

  async function handleFormSubmitted(submissionId: string) {
    if (!fillFor) return;
    try {
      if (fillFor.stage === 'checkIn') await api.recordBoardingBookingCheckIn(id, submissionId);
      else await api.recordBoardingBookingCheckOut(id, submissionId);
      refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record this');
    } finally {
      setFillFor(null);
    }
  }

  // Fires once, as soon as data first loads -- guarded by a ref rather than
  // just checking autoStage (a prop, stays set for this component's whole
  // lifetime) so it doesn't re-fire every time refresh() runs afterward
  // (e.g. once handleFormSubmitted's own refresh() lands). Mirrors exactly
  // what clicking the matching Forms-card row would do: already done ->
  // view what was submitted, otherwise start filling it in.
  const autoStageFired = useRef(false);
  useEffect(() => {
    if (!data || !autoStage || autoStageFired.current) return;
    autoStageFired.current = true;
    if (autoStage === 'checkIn') {
      if (data.booking.checkInSubmission) handleViewSubmission(data.booking.checkInSubmission);
      else startCheckIn();
    } else {
      if (data.booking.checkOutSubmission) handleViewSubmission(data.booking.checkOutSubmission);
      else startCheckOut();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, autoStage]);

  if (error && !data) {
    return (
      <div>
        <a onClick={onBack} style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--muted)' }}>
          ← Back to bookings
        </a>
        <div className="error-banner">{error}</div>
      </div>
    );
  }
  if (!data) return <div className="empty-state">Loading…</div>;

  const { booking, invoice, stages, status } = data;
  const balance = invoice ? invoice.total - (invoice.amountPaid ?? 0) : 0;

  return (
    <div>
      <a onClick={onBack} style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--muted)' }}>
        ← Back to bookings
      </a>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <h1 style={{ margin: 0 }}>{booking.reference}</h1>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: '0.78rem',
              fontWeight: 600,
              ...STATUS_PILL_COLORS[status],
            }}
          >
            {status}
          </span>
          <select
            value={booking.statusOverride ?? ''}
            onChange={(e) => handleSetStatus(e.target.value)}
            disabled={savingStatus}
            title="Override the status manually, or choose Automatic to let it follow the booking's progress"
            style={{ fontSize: '0.78rem', padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)', color: 'var(--muted)' }}
          >
            <option value="">Automatic</option>
            {BOOKING_STATUS_LABELS.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {booking.invoice && (
            <button className="btn btn-secondary" onClick={() => setShowAmend(true)}>
              Amend dates
            </button>
          )}
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            Delete booking
          </button>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, marginTop: 14 }}>
        <div className="card">
          <div className="section-title">Progress</div>
          {stages.map((stage, i) => (
            <div key={stage.key} style={{ display: 'flex', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <StageDot stage={stage} />
                {i < stages.length - 1 && (
                  <div style={{ width: 2, flex: 1, minHeight: 18, background: stage.done ? 'var(--brand-green)' : 'var(--border)' }} />
                )}
              </div>
              <div style={{ paddingBottom: 18 }}>
                <div
                  style={{
                    fontWeight: stage.current ? 700 : 600,
                    fontSize: '0.82rem',
                    color: stage.current ? 'var(--accent)' : stage.done ? 'var(--ink)' : 'var(--muted)',
                  }}
                >
                  {stage.label}
                </div>
                {stage.sub && <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{stage.sub}</div>}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="section-title">Booking details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}>
                <span style={{ color: 'var(--muted)' }}>Customer</span>
                <a onClick={handleViewCustomer} style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--accent)' }}>
                  {boardingCustomerLabel(booking.customer)}
                </a>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}>
                <span style={{ color: 'var(--muted)' }}>Dog(s)</span>
                <span style={{ fontWeight: 600 }}>
                  {booking.animals.map((a, i) => {
                    const animalId = typeof a === 'string' ? a : a._id;
                    const animalName = typeof a === 'string' ? a : a.name;
                    return (
                      <span key={animalId}>
                        {i > 0 && ', '}
                        <a onClick={() => handleViewAnimal(animalId)} style={{ cursor: 'pointer', color: 'var(--accent)' }}>
                          {animalName}
                        </a>
                      </span>
                    );
                  })}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}><span style={{ color: 'var(--muted)' }}>Type</span><span>{booking.type === 'boarding' ? 'Boarding' : 'Day Care'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}><span style={{ color: 'var(--muted)' }}>Notes</span><span>{booking.notes || '—'}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}><span style={{ color: 'var(--muted)' }}>Drop off</span><span>{new Date(booking.startDate).toLocaleDateString('en-GB')}, {booking.dropOffTime}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}><span style={{ color: 'var(--muted)' }}>Pick up</span><span>{new Date(booking.endDate).toLocaleDateString('en-GB')}, {booking.pickUpTime}</span></div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="section-title" style={{ marginBottom: 0 }}>Invoice</div>
              {invoice && balance > 0 && (
                <button className="btn btn-secondary" onClick={() => setShowAddPayment(true)}>
                  Add payment
                </button>
              )}
            </div>
            {!invoice ? (
              <div className="empty-state">Not yet invoiced.</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}><span style={{ color: 'var(--muted)' }}>Invoice</span><span style={{ fontWeight: 600, color: 'var(--accent)' }}>{invoice.invoiceNumber}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}><span style={{ color: 'var(--muted)' }}>Status</span><Badge value={invoice.status} /></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}><span style={{ color: 'var(--muted)' }}>Payment requested</span><span>{booking.paymentRequestType === 'deposit' ? 'Deposit' : booking.paymentRequestType === 'full' ? 'Full payment' : 'Not yet'}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}><span style={{ color: 'var(--muted)' }}>Total</span><span>£{invoice.total.toFixed(2)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}><span style={{ color: 'var(--muted)' }}>Paid so far</span><span>£{(invoice.amountPaid ?? 0).toFixed(2)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.88rem' }}><span style={{ color: 'var(--muted)' }}>Balance</span><span style={{ fontWeight: 600 }}>£{balance.toFixed(2)}</span></div>
                </div>
                {!booking.paymentRequestType && (
                  <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                    <button className="btn btn-secondary" disabled={requesting} onClick={() => handleRequestPayment('deposit')}>
                      Request deposit
                    </button>
                    <button className="btn btn-secondary" disabled={requesting} onClick={() => handleRequestPayment('full')}>
                      Request full payment
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card">
            <div className="section-title">Forms</div>
            <FormRow
              label="Pre-check-in"
              sub={booking.preCheckInSentAt ? `Sent ${new Date(booking.preCheckInSentAt).toLocaleDateString('en-GB')}` : 'Not yet sent'}
              status={booking.preCheckInSubmission ? 'Completed' : booking.preCheckInSentAt ? 'Sent' : 'Not started'}
              onClick={
                booking.preCheckInSubmission
                  ? () => handleViewSubmission(booking.preCheckInSubmission)
                  : booking.invoice
                    ? handleSendPreCheckIn
                    : undefined
              }
              actionLabel={!booking.preCheckInSubmission && booking.invoice ? 'Send now' : undefined}
            />
            <FormRow
              label="Check-in"
              sub={booking.checkInAt ? `${new Date(booking.checkInAt).toLocaleString('en-GB')} · ${booking.checkInBy}` : 'Not yet'}
              status={booking.checkInSubmission ? 'Completed' : 'Not started'}
              onClick={booking.checkInSubmission ? () => handleViewSubmission(booking.checkInSubmission) : startCheckIn}
              actionLabel={!booking.checkInSubmission ? 'Fill in' : undefined}
            />
            <FormRow
              label="Check-out"
              sub={booking.checkOutAt ? `${new Date(booking.checkOutAt).toLocaleString('en-GB')} · ${booking.checkOutBy}` : 'Not yet'}
              status={booking.checkOutSubmission ? 'Completed' : 'Not started'}
              onClick={booking.checkOutSubmission ? () => handleViewSubmission(booking.checkOutSubmission) : startCheckOut}
              actionLabel={!booking.checkOutSubmission ? 'Fill in' : undefined}
            />
          </div>
        </div>
      </div>

      {showAmend && (
        <AmendBoardingBookingDatesModal
          booking={booking}
          onClose={() => setShowAmend(false)}
          onAmended={() => {
            refresh();
            onChanged();
          }}
        />
      )}
      {showAddPayment && invoice && (
        <AddPaymentModal
          initialInvoiceId={invoice._id}
          onClose={() => setShowAddPayment(false)}
          onSaved={() => {
            setShowAddPayment(false);
            refresh();
            onChanged();
          }}
        />
      )}
      {fillFor && (
        <FormFillModal
          submissionId={fillFor.submissionId}
          title={fillFor.stage === 'checkIn' ? 'Check-in' : 'Check-out'}
          referenceSubmission={fillFor.referenceSubmission}
          referenceLabel="Check-in details"
          presetPetNames={fillFor.presetPetNames}
          onClose={() => setFillFor(null)}
          onSubmitted={handleFormSubmitted}
        />
      )}
      {viewSubmission && <ViewFormSubmissionModal submission={viewSubmission} onClose={() => setViewSubmission(null)} />}
      {confirmDelete && (
        <Modal title="Delete this booking?" onClose={() => setConfirmDelete(false)}>
          <p>
            This permanently removes {booking.reference}, its calendar entries, and its invoice
            {invoice ? ` (${invoice.invoiceNumber})` : ''}. If that invoice has payments recorded against it, remove
            those first.
          </p>
          {deleteError && (
            <>
              <div className="error-banner">{deleteError}</div>
              {deleteError.includes('recorded against it') && (
                <p className="hint">
                  "Delete all" below removes those payments/credit notes first (each properly reversed off the
                  invoice and bank balances, not just deleted), then the booking as normal.
                </p>
              )}
            </>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            {deleteError?.includes('recorded against it') && (
              <button type="button" className="btn btn-danger" onClick={() => handleDelete(true)} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete all'}
              </button>
            )}
            <button type="button" className="btn btn-danger" onClick={() => handleDelete(false)} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete booking'}
            </button>
          </div>
        </Modal>
      )}
      {viewCustomer && <ViewCustomerModal customer={viewCustomer} onClose={() => setViewCustomer(null)} />}
      {viewAnimal && <ViewAnimalModal animal={viewAnimal} onClose={() => setViewAnimal(null)} />}
    </div>
  );
}

function FormRow({
  label,
  sub,
  status,
  onClick,
  actionLabel,
}: {
  label: string;
  sub: string;
  status: 'Completed' | 'Sent' | 'Not started';
  onClick?: () => void;
  actionLabel?: string;
}) {
  const pillColors: Record<string, { bg: string; color: string }> = {
    Completed: { bg: 'var(--sage-badge)', color: 'var(--brand-green)' },
    Sent: { bg: 'var(--accent-light)', color: 'var(--accent-dark)' },
    'Not started': { bg: '#f1efe8', color: 'var(--muted)' },
  };
  const c = pillColors[status];
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: '1px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onClick={onClick}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{label}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{sub}</div>
      </div>
      <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, background: c.bg, color: c.color }}>
        {actionLabel ?? status}
      </span>
    </div>
  );
}

function ChecklistsTab() {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [assignments, setAssignments] = useState<ChecklistAssignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [pickedTemplateId, setPickedTemplateId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [exportingDay, setExportingDay] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);

  const weeks = useMemo(() => buildWeeks(viewMode, anchorDate), [viewMode, anchorDate]);

  function refresh() {
    const from = weeks[0][0];
    const to = weeks[weeks.length - 1][6];
    api
      .listChecklistAssignments(dateKey(from), dateKey(addDays(to, 1)))
      .then(setAssignments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load checklists'));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [viewMode, anchorDate]);

  useEffect(() => {
    api.listChecklistTemplates().then(setTemplates).catch(() => {});
  }, []);

  function assignmentsForDay(date: Date): ChecklistAssignment[] {
    return (assignments ?? []).filter((a) => isSameDay(new Date(a.date), date));
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

  async function handleAssign() {
    if (!selectedDate || !pickedTemplateId) return;
    setAssigning(true);
    setError(null);
    try {
      await api.assignChecklist({ template: pickedTemplateId, date: dateKey(selectedDate) });
      setPickedTemplateId('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign this checklist');
    } finally {
      setAssigning(false);
    }
  }

  async function handleUnassign(id: string) {
    if (!window.confirm("Remove this checklist from this day? Its ticked-off progress won't be kept.")) return;
    try {
      await api.deleteChecklistAssignment(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove this checklist');
    }
  }

  async function handleExportDay() {
    if (!selectedDate) return;
    const dayAssignments = assignmentsForDay(selectedDate);
    if (dayAssignments.length === 0) return;
    setExportingDay(true);
    setError(null);
    try {
      const subtitle = selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const doc = await buildChecklistsPdf(dayAssignments, subtitle);
      doc.save(`Checklists - ${dateKey(selectedDate)}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate the PDF');
    } finally {
      setExportingDay(false);
    }
  }

  async function handleExportAll() {
    if (!assignments || assignments.length === 0) return;
    setExportingAll(true);
    setError(null);
    try {
      const subtitle = rangeLabel(viewMode, weeks, anchorDate);
      const doc = await buildChecklistsPdf(assignments, subtitle);
      doc.save(`Checklists - ${subtitle}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate the PDF');
    } finally {
      setExportingAll(false);
    }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={handleExportAll} disabled={exportingAll || !assignments?.length}>
              {exportingAll ? 'Exporting…' : 'Export all'}
            </button>
            <div className="tabs" style={{ marginBottom: 0 }}>
              <button className={viewMode === 'week' ? 'active' : ''} onClick={() => setViewMode('week')}>
                Week
              </button>
              <button className={viewMode === 'month' ? 'active' : ''} onClick={() => setViewMode('month')}>
                Month
              </button>
            </div>
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
              const dayAssignments = assignmentsForDay(date);
              const inMonth = viewMode === 'week' || date.getMonth() === anchorDate.getMonth();
              return (
                <button
                  type="button"
                  key={dateKey(date)}
                  onClick={() => setSelectedDate(date)}
                  style={{
                    textAlign: 'left',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 8,
                    minHeight: 90,
                    background: isToday(date) ? 'var(--sage-badge, #eef5ee)' : 'white',
                    opacity: inMonth ? 1 : 0.45,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 6 }}>{date.getDate()}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {dayAssignments.map((a) => {
                      const done = a.completed.filter(Boolean).length;
                      const allDone = done === a.items.length;
                      return (
                        <span
                          key={a._id}
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            borderRadius: 4,
                            padding: '2px 6px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            background: allDone ? 'var(--sage-badge, #d9f2e3)' : '#fff4cc',
                            color: allDone ? 'var(--brand-green)' : '#8a6d00',
                          }}
                        >
                          {allDone ? '✓ ' : ''}
                          {a.name} ({done}/{a.items.length})
                        </span>
                      );
                    })}
                  </div>
                </button>
              );
            }),
          )}
        </div>
      </div>

      {selectedDate && (
        <Modal
          title={selectedDate.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          onClose={() => setSelectedDate(null)}
          wide
          headerActions={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportDay}
              disabled={exportingDay || assignmentsForDay(selectedDate).length === 0}
            >
              {exportingDay ? 'Exporting…' : 'Export day'}
            </button>
          }
        >
          <div className="field" style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label>Assign a checklist</label>
              <select value={pickedTemplateId} onChange={(e) => setPickedTemplateId(e.target.value)}>
                <option value="">Choose…</option>
                {templates.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleAssign} disabled={!pickedTemplateId || assigning}>
              {assigning ? 'Adding…' : 'Add'}
            </button>
          </div>

          {assignmentsForDay(selectedDate).length === 0 ? (
            <div className="empty-state">No checklists assigned to this day yet.</div>
          ) : (
            assignmentsForDay(selectedDate).map((a) => (
              <AssignmentCard
                key={a._id}
                assignment={a}
                onChanged={refresh}
                onError={setError}
                onRemove={() => handleUnassign(a._id)}
              />
            ))
          )}
        </Modal>
      )}
    </div>
  );
}

// One assigned checklist's card in the day panel -- items with tick + who
// ticked them, a notes area, and a sign-off signature at the bottom. Kept as
// its own component (rather than inlined in ChecklistsTab) so the notes
// textarea can hold its own draft state without fighting the parent's
// refresh-on-every-change re-renders.
function AssignmentCard({
  assignment,
  onChanged,
  onError,
  onRemove,
}: {
  assignment: ChecklistAssignment;
  onChanged: () => void;
  onError: (message: string) => void;
  onRemove: () => void;
}) {
  const { staff } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(assignment.notes ?? '');
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const allDone = assignment.items.length > 0 && assignment.completed.every(Boolean);
  const doneCount = assignment.completed.filter(Boolean).length;

  useEffect(() => {
    if (!notesDirty) setNotes(assignment.notes ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.notes]);

  async function handleToggle(index: number) {
    try {
      await api.toggleChecklistItem(assignment._id, index);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to update this checklist');
    }
  }

  async function saveNotes() {
    setNotesDirty(false);
    try {
      await api.updateChecklistAssignment(assignment._id, { notes });
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save notes');
    }
  }

  async function handleSignatureChange(dataUrl: string | undefined) {
    setSavingSignature(true);
    try {
      await api.updateChecklistAssignment(assignment._id, { signatureImage: dataUrl ?? '' });
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save signature');
    } finally {
      setSavingSignature(false);
    }
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      const doc = await buildChecklistPdf(assignment);
      const dateLabel = dateKey(new Date(assignment.date));
      doc.save(`${assignment.name} - ${dateLabel}.pdf`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to generate the PDF');
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setExpanded((v) => !v)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span
            style={{
              display: 'inline-block',
              marginTop: 3,
              transform: expanded ? 'rotate(180deg)' : undefined,
              color: 'var(--muted)',
            }}
          >
            <ChevronDownIcon />
          </span>
          <div>
            <strong style={{ fontSize: '0.9rem' }}>{assignment.name}</strong>
            {allDone ? (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: 'var(--brand-green)',
                  background: 'var(--sage-badge, #d9f2e3)',
                  borderRadius: 4,
                  padding: '2px 6px',
                }}
              >
                ✓ Completed
              </span>
            ) : (
              <span style={{ marginLeft: 8, fontSize: '0.72rem', color: 'var(--muted)' }}>
                {doneCount}/{assignment.items.length}
              </span>
            )}
            {assignment.completeByTime && (
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Complete by {assignment.completeByTime}</div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            className="btn-link"
            style={{ fontSize: '0.78rem' }}
            title="Export this checklist as a PDF"
            onClick={(e) => {
              e.stopPropagation();
              handleExportPdf();
            }}
            disabled={exportingPdf}
          >
            {exportingPdf ? 'Exporting…' : 'Export PDF'}
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            title="Remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {!expanded ? null : assignment.items.map((item, i) => (
        <div key={i} style={{ padding: '4px 0' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '0.85rem',
              textDecoration: assignment.completed[i] ? 'line-through' : undefined,
              color: assignment.completed[i] ? 'var(--muted)' : undefined,
            }}
          >
            <input
              type="checkbox"
              checked={!!assignment.completed[i]}
              disabled={allDone}
              onChange={() => handleToggle(i)}
            />
            {item}
          </label>
          {assignment.completedBy[i] && (
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginLeft: 24 }}>
              Completed by {assignment.completedBy[i]}
            </div>
          )}
        </div>
      ))}

      {expanded && (
        <div className="field" style={{ marginTop: 10 }}>
          <label>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotesDirty(true);
            }}
            onBlur={() => notesDirty && saveNotes()}
            rows={2}
            disabled={allDone}
            style={{ fontSize: '0.85rem', width: '100%' }}
          />
        </div>
      )}

      {expanded && allDone && (
        <div className="field" style={{ marginTop: 10 }}>
          <label>Signature{staff?.name ? ` (${staff.name})` : ''}</label>
          <SignaturePad
            value={assignment.signatureImage}
            onChange={handleSignatureChange}
            readOnly={!!assignment.signatureImage}
          />
          {savingSignature && <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>Saving…</div>}
          {!savingSignature && assignment.signedBy && (
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 4 }}>
              Signed by {assignment.signedBy}
              {assignment.signedAt ? ` on ${new Date(assignment.signedAt).toLocaleString('en-GB')}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
