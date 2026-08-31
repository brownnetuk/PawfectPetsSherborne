import { useEffect, useMemo, useState } from 'react';
import * as api from '../api/client';
import { PlusCircleIcon, TrashIcon } from '../components/icons';
import type { Animal, Customer, DayBooking, Product } from '../types';

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
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const weeks = useMemo(() => buildWeeks(viewMode, anchorDate), [viewMode, anchorDate]);

  useEffect(() => {
    api.listAnimals().then(setAnimals).catch(() => {});
    api.listCustomers().then(setCustomers).catch(() => {});
    api.listProducts().then(setProducts).catch(() => {});
  }, []);

  function refreshDayBookings() {
    const from = weeks[0][0];
    const to = addDays(weeks[weeks.length - 1][6], 1);
    api
      .listDayBookings(dateKey(from), dateKey(to))
      .then(setDayBookings)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bookings'));
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
        </div>
        <select
          className="select-inline"
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value as ViewMode)}
        >
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
      </div>

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
                // One badge per dog, not per booking -- a dog with a walk plus
                // an auto-added travel line still shows as a single entry.
                const animalsToday = Array.from(new Map(bookingsForDay(date).map((b) => [animalId(b.animal), b])).values());
                const selected = selectedDate && isSameDay(date, selectedDate);
                return (
                  <div
                    key={dateKey(date)}
                    onClick={() => setSelectedDate(date)}
                    style={{
                      minHeight: viewMode === 'week' ? 140 : 100,
                      padding: 8,
                      cursor: 'pointer',
                      borderRight: '1px solid var(--border)',
                      background: selected ? 'var(--accent-light)' : isToday(date) ? '#eef6ff' : undefined,
                      outline: selected ? '2px solid var(--accent)' : undefined,
                      outlineOffset: -2,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: inCurrentMonth ? 'var(--ink)' : 'var(--muted)', opacity: inCurrentMonth ? 1 : 0.6, marginBottom: 6 }}>
                      {date.getDate()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {animalsToday.slice(0, MAX_BADGES).map((b) => (
                        <span
                          key={animalId(b.animal)}
                          style={{
                            background: 'var(--sage-badge, #d9f2e3)',
                            color: 'var(--brand-green)',
                            fontSize: '0.75rem',
                            borderRadius: 4,
                            padding: '2px 6px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {animalLabel(b.animal)}
                        </span>
                      ))}
                      {animalsToday.length > MAX_BADGES && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                          +{animalsToday.length - MAX_BADGES} more
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
            animals={animals}
            customers={customers}
            products={products}
            onClose={() => setSelectedDate(null)}
            onChange={refreshDayBookings}
          />
        )}
      </div>
    </div>
  );
}

function DayDetailPanel({
  date,
  dayBookings,
  animals,
  customers,
  products,
  onClose,
  onChange,
}: {
  date: Date;
  dayBookings: DayBooking[];
  animals: Animal[];
  customers: Customer[];
  products: Product[];
  onClose: () => void;
  onChange: () => void;
}) {
  const [addAnimalId, setAddAnimalId] = useState('');
  const [addProductId, setAddProductId] = useState('');
  const [addQuantity, setAddQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ownerOf = (custId: string) => customers.find((c) => c._id === custId);
  const alreadyAdded = new Set(dayBookings.map((b) => animalId(b.animal)));

  const weekdayKey = WEEKDAY_KEYS[date.getDay()];
  const recommended = animals.filter((a) => {
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

  async function handleAdd() {
    if (!addAnimalId || !addProductId) {
      setError('Choose a dog and a product.');
      return;
    }
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

  async function handleQuickAdd(animal: Animal) {
    setBusy(true);
    setError(null);
    try {
      const mainProduct = defaultProductFor(animal.customer);
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

  async function handleUpdate(booking: DayBooking, patch: { product?: string; quantity?: number }) {
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

      <div className="section-title">Regular</div>
      {dayBookings.length === 0 ? (
        <div className="empty-state" style={{ padding: '10px 0' }}>
          No dogs added yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          {groupByAnimal(dayBookings).map((group) => (
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

      {recommended.length > 0 && (
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

      <div className="section-title">Add Dog</div>
      <div className="field">
        <select value={addAnimalId} onChange={(e) => handlePickAnimal(e.target.value)}>
          <option value="">Select a dog…</option>
          {animals.map((a) => (
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
    </div>
  );
}
