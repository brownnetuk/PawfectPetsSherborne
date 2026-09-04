import { useEffect, useMemo, useState } from 'react';
import * as api from '../api/client';
import AddAppointmentModal from '../components/AddAppointmentModal';
import GenerateInvoicesModal from '../components/GenerateInvoicesModal';
import NewBookingModal from '../components/NewBookingModal';
import type { NewBookingInitial } from '../components/NewBookingModal';
import ProductAvailabilityWarningModal from '../components/ProductAvailabilityWarningModal';
import { PlusCircleIcon, TrashIcon } from '../components/icons';
import { annualLeaveOn } from '../utils/annualLeave';
import { availabilityMismatch } from '../utils/productAvailability';
import { isVisitProduct, visitCountForProduct } from '../utils/visitMapping';
import type { Animal, AnnualLeave, Appointment, BankHoliday, Customer, DayBooking, Product, VisitMapping } from '../types';

type ViewMode = 'week' | 'month';

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Date.getDay() is 0=Sun..6=Sat -- this maps that index straight onto the
// Customer.regularDays weekday keys (Settings > Customer Defaults).
const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  d.setDate(d.getDate() + diff);
  return d;
}
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + months, 1);
  return d;
}
function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b);
}
function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

// Always a whole number of Mon-Sun weeks -- one row for Week view, however
// many the visible month needs (matching the screenshot's dimmed leading/
// trailing days from adjacent months) for Month view.
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

function animalId(animal: DayBooking['animal']): string {
  return typeof animal === 'string' ? animal : animal._id;
}
function animalLabel(animal: DayBooking['animal']): string {
  return typeof animal === 'string' ? animal : animal.name;
}
function customerLabel(customer: DayBooking['customer']): string {
  return typeof customer === 'string' ? customer : customer.name;
}
function productId(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product._id;
}
function productLabel(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product.name;
}

// Groups a day's bookings by dog, preserving first-seen order, so a dog
// with e.g. a walk plus an auto-added travel line renders as one card
// with both rows rather than two separate cards.
function groupByAnimal(bookings: DayBooking[]): DayBooking[][] {
  const groups = new Map<string, DayBooking[]>();
  for (const b of bookings) {
    const id = animalId(b.animal);
    const group = groups.get(id);
    if (group) group.push(b);
    else groups.set(id, [b]);
  }
  return Array.from(groups.values());
}

const MAX_BADGES = 3;

export default function BookingsPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [dayBookings, setDayBookings] = useState<DayBooking[] | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [bankHolidays, setBankHolidays] = useState<BankHoliday[]>([]);
  const [annualLeave, setAnnualLeave] = useState<AnnualLeave[]>([]);
  const [visitMapping, setVisitMapping] = useState<VisitMapping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  // 'new' opens a blank New Booking modal; a NewBookingInitial reopens it
  // pre-filled for editing an existing animal's date range (clicked from the
  // Visits section below).
  const [bookingModal, setBookingModal] = useState<'new' | NewBookingInitial | null>(null);
  // Filters both the calendar grid's badges and the day panel's Walks/Visits
  // sections -- both default on, so nothing changes until staff toggle one off.
  const [showWalks, setShowWalks] = useState(true);
  const [showVisits, setShowVisits] = useState(true);
  const [showAppointments, setShowAppointments] = useState(true);
  const [showGenerateInvoices, setShowGenerateInvoices] = useState(false);
  const [showAddAppointment, setShowAddAppointment] = useState(false);

  const weeks = useMemo(() => buildWeeks(viewMode, anchorDate), [viewMode, anchorDate]);

  useEffect(() => {
    api.listAnimals().then(setAnimals).catch(() => {});
    api.listCustomers().then(setCustomers).catch(() => {});
    api.listBankHolidays().then(setBankHolidays).catch(() => {});
    api.listAnnualLeave().then(setAnnualLeave).catch(() => {});
    api.listProducts().then(setProducts).catch(() => {});
    api.getVisitMapping().then(setVisitMapping).catch(() => {});
  }, []);

  function refreshDayBookings() {
    // ±1 day beyond what's actually shown -- badgesForDay's AM/PM inference
    // needs to see one day either side of the visible grid to tell whether a
    // boundary day is really the start/end of a run, not just cut off by the
    // fetch window.
    const from = addDays(weeks[0][0], -1);
    const to = addDays(weeks[weeks.length - 1][6], 2);
    api
      .listDayBookings(dateKey(from), dateKey(to))
      .then(setDayBookings)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bookings'));
    api
      .listAppointments(dateKey(from), dateKey(to))
      .then(setAppointments)
      .catch(() => {});
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refreshDayBookings, [viewMode, anchorDate]);

  function goToday() {
    setAnchorDate(new Date());
  }
  function goBack() {
    setAnchorDate((d) => (viewMode === 'week' ? addDays(d, -7) : addMonths(d, -1)));
  }
  function goForward() {
    setAnchorDate((d) => (viewMode === 'week' ? addDays(d, 7) : addMonths(d, 1)));
  }

  function bookingsForDay(date: Date): DayBooking[] {
    return (dayBookings ?? []).filter((b) => isSameDay(new Date(b.date), date));
  }

  function appointmentsForDay(date: Date): Appointment[] {
    return appointments.filter((a) => isSameDay(new Date(a.date), date)).sort((a, b) => a.time.localeCompare(b.time));
  }

  // Whether aid has a Visits-mapping entry on targetDate, within whatever
  // range is currently loaded (dayBookings) -- used only to tell a 1-visit
  // entry's AM/PM (start of a run vs end vs a middle/standalone day).
  // refreshDayBookings fetches one extra day either side of the visible grid
  // specifically so this stays accurate for a run starting/ending just
  // outside it; a run more than a day outside the visible range still can't
  // be seen this way, same limitation as the day panel's own narrower check.
  function hasVisitEntryOn(targetDate: Date, aid: string): boolean {
    if (!visitMapping) return false;
    return (dayBookings ?? []).some(
      (b) => animalId(b.animal) === aid && isSameDay(new Date(b.date), targetDate) && isVisitProduct(visitMapping, productId(b.product)),
    );
  }

  // Only used when a 1-visit entry has no explicit visitTime set (older
  // bookings, or ones created before this override existed): start of a run
  // of consecutive days = PM, end = AM, a middle/standalone day = PM.
  function inferVisitTime(date: Date, aid: string): 'AM' | 'PM' {
    const isStart = !hasVisitEntryOn(addDays(date, -1), aid);
    const isEnd = !hasVisitEntryOn(addDays(date, 1), aid);
    return isEnd && !isStart ? 'AM' : 'PM';
  }

  // One badge per Walk-type animal (plain name, unchanged), plus one or two
  // badges per Visit-type animal: "Name - AM"/"Name - PM" for a single visit
  // (worked out the same start/end/regular way as the day panel), or both
  // "Name - AM" and "Name - PM" for a 2-visit day -- the PM one is a display
  // placeholder only, not a second underlying booking.
  function badgesForDay(date: Date): { key: string; label: string; kind: 'walk' | 'visit' | 'appointment'; invoiced: boolean }[] {
    const byAnimal = new Map<string, DayBooking[]>();
    for (const b of bookingsForDay(date)) {
      const aid = animalId(b.animal);
      const arr = byAnimal.get(aid);
      if (arr) arr.push(b);
      else byAnimal.set(aid, [b]);
    }
    // Three passes (not one loop pushing per animal) so ordering reflects
    // the actual time of day across every animal -- AM visits first, then
    // walks, then PM visits -- not just each animal's own badges together.
    type Badge = { key: string; label: string; kind: 'walk' | 'visit' | 'appointment'; invoiced: boolean };
    const amVisitBadges: Badge[] = [];
    const walkBadges: Badge[] = [];
    const pmVisitBadges: Badge[] = [];
    for (const [aid, entries] of byAnimal) {
      const name = animalLabel(entries[0].animal);
      const walkEntries = entries.filter((b) => !visitMapping || !isVisitProduct(visitMapping, productId(b.product)));
      const visitEntries = entries.filter((b) => visitMapping && isVisitProduct(visitMapping, productId(b.product)));
      if (showWalks && walkEntries.length > 0) {
        walkBadges.push({ key: `${aid}-walk`, label: name, kind: 'walk', invoiced: walkEntries.every((b) => !!b.invoice) });
      }
      if (showVisits && visitEntries.length > 0) {
        const invoiced = visitEntries.every((b) => !!b.invoice);
        const count = visitMapping ? visitCountForProduct(visitMapping, productId(visitEntries[0].product)) : null;
        if (count === 2) {
          amVisitBadges.push({ key: `${aid}-visit-am`, label: `${name} - AM`, kind: 'visit', invoiced });
          pmVisitBadges.push({ key: `${aid}-visit-pm`, label: `${name} - PM`, kind: 'visit', invoiced });
        } else {
          const time = visitEntries[0].visitTime ?? inferVisitTime(date, aid);
          const badge: Badge = { key: `${aid}-visit`, label: `${name} - ${time}`, kind: 'visit', invoiced };
          if (time === 'AM') amVisitBadges.push(badge);
          else pmVisitBadges.push(badge);
        }
      }
    }
    const appointmentBadges: Badge[] = showAppointments
      ? appointmentsForDay(date).map((a) => ({
          key: `appt-${a._id}`,
          label: customerLabel(a.customer),
          kind: 'appointment',
          invoiced: false,
        }))
      : [];
    return [...amVisitBadges, ...walkBadges, ...pmVisitBadges, ...appointmentBadges];
  }

  // Clicked an animal in the Visits section: walk outward from that day
  // through this animal's consecutive Visits-mapping entries to find the
  // full date range, then reopen New Booking pre-filled so staff can adjust
  // the whole stay (dates, visit counts) rather than one day at a time.
  async function handleEditAnimalBooking(aid: string, fromDate: Date) {
    if (!visitMapping) return;
    const windowStart = addDays(fromDate, -60);
    const windowEnd = addDays(fromDate, 60);
    let all: DayBooking[];
    try {
      all = await api.listDayBookings(dateKey(windowStart), dateKey(addDays(windowEnd, 1)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load this booking');
      return;
    }
    const byDate = new Map(
      all
        .filter((b) => animalId(b.animal) === aid && isVisitProduct(visitMapping, productId(b.product)))
        .map((b) => [dateKey(new Date(b.date)), b]),
    );
    if (!byDate.has(dateKey(fromDate))) return;

    let start = fromDate;
    while (byDate.has(dateKey(addDays(start, -1)))) start = addDays(start, -1);
    let end = fromDate;
    while (byDate.has(dateKey(addDays(end, 1)))) end = addDays(end, 1);

    const rangeDates: Date[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) rangeDates.push(d);

    const editEntries = rangeDates.map((d) => ({ date: dateKey(d), bookingId: byDate.get(dateKey(d))!._id }));
    const countFor = (d: Date): '1' | '2' => (visitCountForProduct(visitMapping, productId(byDate.get(dateKey(d))!.product)) === 2 ? '2' : '1');
    const visitsFirstDay = countFor(start);
    const visitsLastDay = countFor(end);
    // "Regular"/middle default: the day after start if the range has a
    // genuine middle day, else just fall back to the first day's own count.
    const visitsPerDay = rangeDates.length > 2 ? countFor(addDays(start, 1)) : visitsFirstDay;
    // Prefer an explicit visitTime; fall back to the same start/end inference
    // used for display, checked against the full fetched window (not just
    // the visible calendar range, so this stays accurate).
    function amPmFor(d: Date): 'AM' | 'PM' {
      const entry = byDate.get(dateKey(d))!;
      if (entry.visitTime) return entry.visitTime;
      const isStart = !byDate.has(dateKey(addDays(d, -1)));
      const isEnd = !byDate.has(dateKey(addDays(d, 1)));
      return isEnd && !isStart ? 'AM' : 'PM';
    }
    const amPmFirstDay = amPmFor(start);
    const amPmLastDay = amPmFor(end);

    const animal = animals.find((a) => a._id === aid);
    if (!animal) return;

    setBookingModal({
      customerId: animal.customer,
      animalIds: [aid],
      startDate: dateKey(start),
      endDate: dateKey(end),
      visitsPerDay,
      visitsFirstDay,
      visitsLastDay,
      amPmFirstDay,
      amPmLastDay,
      editAnimalId: aid,
      editEntries,
    });
  }

  return (
    <div>
      <div className="page-header">
        <h1>Bookings</h1>
      </div>
      {error && <div className="error-banner">{error}</div>}

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
          <h2 style={{ margin: 0 }}>{rangeLabel(viewMode, weeks, anchorDate)}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setShowWalks((v) => !v)}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 20,
                padding: '4px 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: showWalks ? 'var(--sage-badge, #d9f2e3)' : 'transparent',
                color: showWalks ? 'var(--brand-green)' : 'var(--muted)',
              }}
            >
              Walks
            </button>
            <button
              type="button"
              onClick={() => setShowVisits((v) => !v)}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 20,
                padding: '4px 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: showVisits ? '#fff4cc' : 'transparent',
                color: showVisits ? '#8a6d00' : 'var(--muted)',
              }}
            >
              Visits
            </button>
            <button
              type="button"
              onClick={() => setShowAppointments((v) => !v)}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 20,
                padding: '4px 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: showAppointments ? '#dbeafe' : 'transparent',
                color: showAppointments ? '#1d4ed8' : 'var(--muted)',
              }}
            >
              Appointments
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            className="select-inline"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as ViewMode)}
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => setBookingModal('new')}>
            New Booking
          </button>
          <button
            className="btn btn-sm"
            style={{ background: '#1d4ed8', color: 'white' }}
            onClick={() => setShowAddAppointment(true)}
          >
            Add Appointment
          </button>
          <button className="btn btn-success btn-sm" onClick={() => setShowGenerateInvoices(true)}>
            Generate Invoice
          </button>
        </div>
      </div>

      {showGenerateInvoices && (
        <GenerateInvoicesModal
          anchorDate={anchorDate}
          onClose={() => setShowGenerateInvoices(false)}
          onGenerated={refreshDayBookings}
        />
      )}

      {showAddAppointment && (
        <AddAppointmentModal
          customers={customers}
          annualLeave={annualLeave}
          onClose={() => setShowAddAppointment(false)}
          onCreated={refreshDayBookings}
        />
      )}

      {bookingModal && (
        <NewBookingModal
          animals={animals}
          customers={customers}
          annualLeave={annualLeave}
          initial={bookingModal === 'new' ? undefined : bookingModal}
          onClose={() => setBookingModal(null)}
          onCreated={() => {
            refreshDayBookings();
          }}
        />
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div className="card" style={{ padding: 0, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                style={{
                  padding: '10px 12px',
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
                gridTemplateColumns: 'repeat(7, 1fr)',
                borderBottom: wi === weeks.length - 1 ? 'none' : '1px solid var(--border)',
              }}
            >
              {week.map((date) => {
                const inCurrentMonth = viewMode === 'week' || date.getMonth() === anchorDate.getMonth();
                const badges = badgesForDay(date);
                const selected = selectedDate && isSameDay(date, selectedDate);
                const leave = annualLeaveOn(date, annualLeave);
                return (
                  <div
                    key={dateKey(date)}
                    onClick={() => setSelectedDate(date)}
                    title={leave ? `Annual Leave: ${leave.name}` : undefined}
                    style={{
                      position: 'relative',
                      minHeight: viewMode === 'week' ? 140 : 100,
                      padding: 8,
                      cursor: 'pointer',
                      borderRight: '1px solid var(--border)',
                      background: leave ? '#fef2f2' : selected ? 'var(--accent-light)' : isToday(date) ? '#eef6ff' : undefined,
                      outline: selected ? '2px solid var(--accent)' : undefined,
                      outlineOffset: -2,
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
                    <div style={{ fontWeight: 700, color: inCurrentMonth ? 'var(--ink)' : 'var(--muted)', opacity: inCurrentMonth ? 1 : 0.6, marginBottom: 6 }}>
                      {date.getDate()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {badges.slice(0, MAX_BADGES).map((badge) => (
                        <span
                          key={badge.key}
                          title={badge.invoiced ? 'Invoiced' : undefined}
                          style={{
                            background:
                              badge.kind === 'appointment'
                                ? '#dbeafe'
                                : badge.kind === 'visit'
                                  ? '#fff4cc'
                                  : 'var(--sage-badge, #d9f2e3)',
                            color:
                              badge.kind === 'appointment'
                                ? '#1d4ed8'
                                : badge.kind === 'visit'
                                  ? '#8a6d00'
                                  : 'var(--brand-green)',
                            fontSize: '0.75rem',
                            borderRadius: 4,
                            padding: '2px 6px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {badge.invoiced ? '✓ ' : ''}
                          {badge.label}
                        </span>
                      ))}
                      {badges.length > MAX_BADGES && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                          +{badges.length - MAX_BADGES} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {selectedDate && (
          <DayDetailPanel
            date={selectedDate}
            dayBookings={bookingsForDay(selectedDate)}
            appointments={showAppointments ? appointmentsForDay(selectedDate) : []}
            animals={animals}
            customers={customers}
            products={products}
            bankHolidays={bankHolidays}
            annualLeave={annualLeaveOn(selectedDate, annualLeave)}
            visitMapping={visitMapping}
            showWalks={showWalks}
            showVisits={showVisits}
            onClose={() => setSelectedDate(null)}
            onChange={refreshDayBookings}
            onEditAnimal={handleEditAnimalBooking}
          />
        )}
      </div>
    </div>
  );
}

function DayDetailPanel({
  date,
  dayBookings,
  appointments,
  animals,
  customers,
  products,
  bankHolidays,
  annualLeave,
  visitMapping,
  showWalks,
  showVisits,
  onClose,
  onChange,
  onEditAnimal,
}: {
  date: Date;
  dayBookings: DayBooking[];
  appointments: Appointment[];
  animals: Animal[];
  customers: Customer[];
  products: Product[];
  bankHolidays: BankHoliday[];
  annualLeave?: AnnualLeave;
  visitMapping: VisitMapping | null;
  showWalks: boolean;
  showVisits: boolean;
  onClose: () => void;
  onChange: () => void;
  onEditAnimal: (animalId: string, date: Date) => void;
}) {
  const [addAnimalId, setAddAnimalId] = useState('');
  const [addProductId, setAddProductId] = useState('');
  const [addQuantity, setAddQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<{ message: string; onConfirm: () => void } | null>(null);

  async function handleRemoveAppointment(id: string) {
    setError(null);
    try {
      await api.deleteAppointment(id);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove this appointment');
    }
  }
  // A narrow ±1 day window, refetched whenever the selected day changes --
  // used only to tell whether a 1-visit entry sits at the start/end of a
  // consecutive run (for the AM/PM label below), not for anything editable.
  const [adjacentBookings, setAdjacentBookings] = useState<DayBooking[]>([]);

  useEffect(() => {
    api
      .listDayBookings(dateKey(addDays(date, -1)), dateKey(addDays(date, 2)))
      .then(setAdjacentBookings)
      .catch(() => setAdjacentBookings([]));
  }, [date]);

  const ownerOf = (custId: string) => customers.find((c) => c._id === custId);
  const alreadyAdded = new Set(dayBookings.map((b) => animalId(b.animal)));

  function hasVisitOn(targetDate: Date, aid: string): boolean {
    if (!visitMapping) return false;
    const key = dateKey(targetDate);
    return adjacentBookings.some(
      (b) => animalId(b.animal) === aid && dateKey(new Date(b.date)) === key && isVisitProduct(visitMapping, productId(b.product)),
    );
  }

  const walkBookings = showWalks ? dayBookings.filter((b) => !visitMapping || !isVisitProduct(visitMapping, productId(b.product))) : [];
  const visitBookings = showVisits ? dayBookings.filter((b) => visitMapping && isVisitProduct(visitMapping, productId(b.product))) : [];

  const weekdayKey = WEEKDAY_KEYS[date.getDay()];
  const recommended = animals.filter((a) => {
    if (a.species !== 'dog') return false;
    if (alreadyAdded.has(a._id)) return false;
    return ownerOf(a.customer)?.regularDays?.includes(weekdayKey);
  });

  function defaultProductFor(custId: string | undefined): string {
    const owner = custId ? ownerOf(custId) : undefined;
    return owner?.defaultProduct || (products[0]?._id ?? '');
  }

  // Mirrors the travel-line auto-add on new invoices (Customer Defaults > Travel):
  // if travel is chargeable for this dog's owner, add it as its own entry
  // alongside whatever was just booked, unless it's already the entry just
  // added or already present for this dog on this day.
  async function maybeAddTravel(petId: string, custId: string | undefined, mainProductId: string) {
    const owner = custId ? ownerOf(custId) : undefined;
    if (!owner?.travelChargeable || !owner.travelProduct || owner.travelProduct === mainProductId) return;
    const travelProduct = products.find((p) => p._id === owner.travelProduct);
    if (!travelProduct) return;
    const alreadyHasTravel = dayBookings.some(
      (b) => animalId(b.animal) === petId && productId(b.product) === travelProduct._id,
    );
    if (alreadyHasTravel) return;
    await api.createDayBooking({ animal: petId, date: dateKey(date), product: travelProduct._id, quantity: 1 });
  }

  function handlePickAnimal(id: string) {
    setAddAnimalId(id);
    const animal = animals.find((a) => a._id === id);
    setAddProductId(defaultProductFor(animal?.customer));
  }

  function handleAdd() {
    if (!addAnimalId || !addProductId) {
      setError('Choose a dog and a product.');
      return;
    }
    const product = products.find((p) => p._id === addProductId);
    const mismatch = product && availabilityMismatch(product, date, bankHolidays);
    if (mismatch) {
      setWarning({ message: mismatch, onConfirm: performAdd });
      return;
    }
    performAdd();
  }

  async function performAdd() {
    setBusy(true);
    setError(null);
    try {
      await api.createDayBooking({ animal: addAnimalId, date: dateKey(date), product: addProductId, quantity: addQuantity });
      const animal = animals.find((a) => a._id === addAnimalId);
      await maybeAddTravel(addAnimalId, animal?.customer, addProductId);
      setAddAnimalId('');
      setAddProductId('');
      setAddQuantity(1);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add this dog');
    } finally {
      setBusy(false);
    }
  }

  function handleQuickAdd(animal: Animal) {
    const mainProduct = defaultProductFor(animal.customer);
    const product = products.find((p) => p._id === mainProduct);
    const mismatch = product && availabilityMismatch(product, date, bankHolidays);
    if (mismatch) {
      setWarning({ message: mismatch, onConfirm: () => performQuickAdd(animal, mainProduct) });
      return;
    }
    performQuickAdd(animal, mainProduct);
  }

  async function performQuickAdd(animal: Animal, mainProduct: string) {
    setBusy(true);
    setError(null);
    try {
      await api.createDayBooking({
        animal: animal._id,
        date: dateKey(date),
        product: mainProduct,
        quantity: 1,
      });
      await maybeAddTravel(animal._id, animal.customer, mainProduct);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add this dog');
    } finally {
      setBusy(false);
    }
  }

  function handleUpdate(booking: DayBooking, patch: { product?: string; quantity?: number }) {
    if (patch.product) {
      const product = products.find((p) => p._id === patch.product);
      const mismatch = product && availabilityMismatch(product, date, bankHolidays);
      if (mismatch) {
        setWarning({ message: mismatch, onConfirm: () => performUpdate(booking, patch) });
        return;
      }
    }
    performUpdate(booking, patch);
  }

  async function performUpdate(booking: DayBooking, patch: { product?: string; quantity?: number }) {
    setError(null);
    try {
      await api.updateDayBooking(booking._id, patch);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update this entry');
    }
  }

  async function handleRemove(booking: DayBooking) {
    setError(null);
    try {
      await api.deleteDayBooking(booking._id);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove this entry');
    }
  }

  return (
    <div className="card" style={{ width: 360, flexShrink: 0, position: 'sticky', top: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
          {date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {annualLeave && (
        <div className="error-banner" style={{ background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}>
          Annual Leave: {annualLeave.name}. Nothing can be booked on this day.
        </div>
      )}
      {warning && (
        <ProductAvailabilityWarningModal
          message={warning.message}
          onCancel={() => setWarning(null)}
          onConfirm={() => {
            const { onConfirm } = warning;
            setWarning(null);
            onConfirm();
          }}
        />
      )}

      {showWalks && (
        <>
          <div className="section-title">Walks</div>
          {walkBookings.length === 0 ? (
            <div className="empty-state" style={{ padding: '10px 0' }}>
              No dogs added yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
              {groupByAnimal(walkBookings).map((group) => (
                <div
                  key={animalId(group[0].animal)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 10,
                    background: 'var(--card, #fff)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {animalLabel(group[0].animal)}
                    </span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flexShrink: 1,
                      }}
                    >
                      {customerLabel(group[0].customer)}
                    </span>
                  </div>
                  {group.map((b) => (
                    <div key={b._id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      {b.invoice && (
                        <span title="Invoiced" style={{ color: 'var(--brand-green)', fontSize: '0.85rem', flexShrink: 0 }}>
                          ✓
                        </span>
                      )}
                      <select
                        value={productId(b.product)}
                        onChange={(e) => handleUpdate(b, { product: e.target.value })}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: '0.8rem',
                          padding: '4px 6px',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                        }}
                      >
                        {products.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        defaultValue={b.quantity}
                        onBlur={(e) => {
                          const value = Number(e.target.value);
                          if (value >= 1 && value !== b.quantity) handleUpdate(b, { quantity: value });
                        }}
                        style={{
                          width: 44,
                          flexShrink: 0,
                          fontSize: '0.8rem',
                          padding: '4px 4px',
                          textAlign: 'center',
                          borderRadius: 6,
                          border: '1px solid var(--border)',
                        }}
                      />
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        title="Remove"
                        style={{ flexShrink: 0 }}
                        onClick={() => handleRemove(b)}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {visitBookings.length > 0 && (
        <>
          <div className="section-title">Visits</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {groupByAnimal(visitBookings).map((group) => {
              const aid = animalId(group[0].animal);
              const isStart = !hasVisitOn(addDays(date, -1), aid);
              const isEnd = !hasVisitOn(addDays(date, 1), aid);
              const oneVisitLabel = isEnd && !isStart ? 'AM' : 'PM';
              return (
                <div
                  key={aid}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 10,
                    background: 'var(--card, #fff)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => onEditAnimal(aid, date)}
                      title="Edit this booking"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        fontWeight: 700,
                        color: 'var(--accent)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {animalLabel(group[0].animal)}
                    </button>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--muted)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flexShrink: 1,
                      }}
                    >
                      {customerLabel(group[0].customer)}
                    </span>
                  </div>
                  {group.map((b) => {
                    const count = visitMapping ? visitCountForProduct(visitMapping, productId(b.product)) : null;
                    const label = count === 2 ? 'AM & PM' : (b.visitTime ?? oneVisitLabel);
                    return (
                      <div key={b._id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <span
                          style={{
                            background: 'var(--accent-light)',
                            color: 'var(--accent)',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            borderRadius: 4,
                            padding: '2px 6px',
                            flexShrink: 0,
                          }}
                        >
                          {label}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {productLabel(b.product)}
                        </span>
                        {b.invoice && (
                          <span title="Invoiced" style={{ color: 'var(--brand-green)', fontSize: '0.85rem', flexShrink: 0 }}>
                            ✓
                          </span>
                        )}
                        <button
                          type="button"
                          className="icon-btn icon-btn-danger"
                          title="Remove"
                          style={{ flexShrink: 0 }}
                          onClick={() => handleRemove(b)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}

      {appointments.length > 0 && (
        <>
          <div className="section-title">Appointments</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {appointments.map((appt) => (
              <div
                key={appt._id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 10,
                  background: 'var(--card, #fff)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {customerLabel(appt.customer)}
                  </span>
                  <span
                    style={{
                      background: '#dbeafe',
                      color: '#1d4ed8',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      borderRadius: 4,
                      padding: '2px 6px',
                      flexShrink: 0,
                    }}
                  >
                    {appt.time}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {appt.reason}
                  </span>
                  <button
                    type="button"
                    className="icon-btn icon-btn-danger"
                    title="Remove"
                    style={{ flexShrink: 0 }}
                    onClick={() => handleRemoveAppointment(appt._id)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!annualLeave && recommended.length > 0 && (
        <>
          <div className="section-title">Recommended</div>
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginTop: -8 }}>
            Based on each customer's regular days (Customer Defaults).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {recommended.map((a) => (
              <div
                key={a._id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 10,
                  background: 'var(--card, #fff)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{a.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {ownerOf(a.customer)?.name ?? '—'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleQuickAdd(a)}
                  disabled={busy}
                  title={`Add ${a.name} to this day`}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', lineHeight: 0 }}
                >
                  <PlusCircleIcon />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {!annualLeave && (
        <>
          <div className="section-title">Add Dog</div>
          <div className="field">
            <select value={addAnimalId} onChange={(e) => handlePickAnimal(e.target.value)}>
              <option value="">Select a dog…</option>
              {animals
                .filter((a) => a.species === 'dog')
                .map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name} ({ownerOf(a.customer)?.name ?? 'unknown owner'})
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <select value={addProductId} onChange={(e) => setAddProductId(e.target.value)}>
              <option value="">Select a product…</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Qty</label>
            <input
              type="number"
              min={1}
              value={addQuantity}
              onChange={(e) => setAddQuantity(Math.max(1, Number(e.target.value)))}
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleAdd} disabled={busy}>
            {busy ? 'Adding…' : 'Add to this day'}
          </button>
        </>
      )}
    </div>
  );
}
