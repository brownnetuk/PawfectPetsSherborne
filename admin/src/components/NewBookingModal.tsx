import { useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import { AVAILABILITY_LABELS, dayTypeFor } from '../utils/productAvailability';
import type { Animal, Customer, DayBooking, ProductAvailability, VisitMapping } from '../types';

type VisitCount = '1' | '2';

// Maps (visit count, day type) onto the matching VisitMapping field --
// Settings > Bookings > Visits is where staff configure which product each
// combination uses.
const MAPPING_KEY: Record<VisitCount, Record<ProductAvailability, keyof VisitMapping>> = {
  '1': {
    weekday: 'oneVisitWeekdayProduct',
    weekend: 'oneVisitWeekendProduct',
    bank_holiday: 'oneVisitBankHolidayProduct',
  },
  '2': {
    weekday: 'twoVisitWeekdayProduct',
    weekend: 'twoVisitWeekendProduct',
    bank_holiday: 'twoVisitBankHolidayProduct',
  },
};

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function animalId(animal: DayBooking['animal']): string {
  return typeof animal === 'string' ? animal : animal._id;
}

export default function NewBookingModal({
  animals,
  customers,
  onClose,
  onCreated,
}: {
  animals: Animal[];
  customers: Customer[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [custId, setCustId] = useState('');
  const [animalIds, setAnimalIds] = useState<string[]>([]);
  const [visitsPerDay, setVisitsPerDay] = useState<VisitCount>('1');
  const [startDate, setStartDate] = useState('');
  const [visitsFirstDay, setVisitsFirstDay] = useState<VisitCount>('1');
  const [endDate, setEndDate] = useState('');
  const [visitsLastDay, setVisitsLastDay] = useState<VisitCount>('1');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);

  const customerAnimals = animals.filter((a) => a.customer === custId);

  function handleCustomerChange(id: string) {
    setCustId(id);
    setAnimalIds([]);
  }

  function toggleAnimal(id: string) {
    setAnimalIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!custId) {
      setError('Choose a customer.');
      return;
    }
    if (animalIds.length === 0) {
      setError('Choose at least one animal.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Choose a start and end date.');
      return;
    }
    const start = parseYmd(startDate);
    const end = parseYmd(endDate);
    if (end < start) {
      setError('End date must be on or after the start date.');
      return;
    }

    setBusy(true);
    try {
      const [mapping, bankHolidays] = await Promise.all([api.getVisitMapping(), api.listBankHolidays()]);

      const days: Date[] = [];
      for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

      // Shared across every selected animal -- the product for a given day
      // doesn't depend on which animal is being booked.
      const plan: { date: Date; productId: string }[] = [];
      const missing = new Set<string>();
      days.forEach((date, i) => {
        const visits: VisitCount =
          days.length === 1 ? visitsFirstDay : i === 0 ? visitsFirstDay : i === days.length - 1 ? visitsLastDay : visitsPerDay;
        const dayType = dayTypeFor(date, bankHolidays);
        const productId = mapping[MAPPING_KEY[visits][dayType]];
        if (!productId) {
          missing.add(`${visits} Visit (${AVAILABILITY_LABELS[dayType]})`);
        } else {
          plan.push({ date, productId });
        }
      });

      if (missing.size > 0) {
        setError(
          `No product is configured in Settings > Bookings > Visits for: ${Array.from(missing).join(', ')}.`,
        );
        setBusy(false);
        return;
      }

      const existing = await api.listDayBookings(dateKey(start), dateKey(addDays(end, 1)));
      // b.date is a UTC ISO string -- parse it back into a Date first so the
      // local getters undo the server's local-midnight-to-UTC offset, same
      // fix as productAvailability's dayTypeFor (a raw slice(0,10) compares
      // the wrong calendar day).
      const existingKeys = new Set(existing.map((b) => `${animalId(b.animal)}|${dateKey(new Date(b.date))}`));

      let created = 0;
      let skipped = 0;
      for (const id of animalIds) {
        const animal = animals.find((a) => a._id === id);
        const owner = animal ? customers.find((c) => c._id === animal.customer) : undefined;
        const travelProductId = owner?.travelChargeable ? (owner.travelProduct ?? null) : null;

        for (const { date, productId } of plan) {
          // Compares against the *local* calendar date, not the raw UTC ISO
          // slice -- same timezone-safety reasoning as productAvailability's
          // own dayTypeFor.
          const key = `${id}|${dateKey(date)}`;
          if (existingKeys.has(key)) {
            skipped++;
            continue;
          }
          await api.createDayBooking({ animal: id, date: dateKey(date), product: productId, quantity: 1 });
          created++;
          if (travelProductId && travelProductId !== productId) {
            await api.createDayBooking({ animal: id, date: dateKey(date), product: travelProductId, quantity: 1 });
            created++;
          }
        }
      }

      setResult({ created, skipped });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the booking');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New Booking" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      {result && (
        <div className="error-banner" style={{ background: 'var(--sage-badge, #d9f2e3)', color: 'var(--brand-green)' }}>
          Created {result.created} booking{result.created === 1 ? '' : 's'}
          {result.skipped > 0 ? `, skipped ${result.skipped} already booked` : ''}.
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Customer</label>
          <select value={custId} onChange={(e) => handleCustomerChange(e.target.value)}>
            <option value="">Select a customer…</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Animals</label>
          {!custId ? (
            <div className="field-hint" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              Select a customer first.
            </div>
          ) : customerAnimals.length === 0 ? (
            <div className="field-hint" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              This customer has no animals on file.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {customerAnimals.map((a) => (
                <label key={a._id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                  <input type="checkbox" checked={animalIds.includes(a._id)} onChange={() => toggleAnimal(a._id)} />
                  {a.name} ({a.species})
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="field">
          <label>How Many Visits per Day</label>
          <select value={visitsPerDay} onChange={(e) => setVisitsPerDay(e.target.value as VisitCount)}>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div className="field">
            <label>Visits on First Date</label>
            <select value={visitsFirstDay} onChange={(e) => setVisitsFirstDay(e.target.value as VisitCount)}>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
          <div className="field">
            <label>Visits on End Date</label>
            <select value={visitsLastDay} onChange={(e) => setVisitsLastDay(e.target.value as VisitCount)}>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {result ? 'Close' : 'Cancel'}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create booking'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
