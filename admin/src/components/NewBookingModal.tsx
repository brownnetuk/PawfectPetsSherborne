import { useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import { addDays, buildVisitPlan, dateKey, parseYmd } from '../utils/visitPlan';
import type { VisitCount } from '../utils/visitPlan';
import type { Animal, Customer, DayBooking } from '../types';

function animalId(animal: DayBooking['animal']): string {
  return typeof animal === 'string' ? animal : animal._id;
}
function productIdOf(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product._id;
}

// Passed when reopening this modal from an animal already booked in the
// Visits section (Bookings page) -- pre-fills the form with that animal's
// detected date range, and switches Create into an Update that diffs
// against its existing day-by-day entries instead of just skipping them.
export interface NewBookingInitial {
  customerId: string;
  animalIds: string[];
  startDate: string;
  endDate: string;
  visitsPerDay: VisitCount;
  visitsFirstDay: VisitCount;
  visitsLastDay: VisitCount;
  editAnimalId: string;
  editEntries: { date: string; bookingId: string }[];
}

export default function NewBookingModal({
  animals,
  customers,
  initial,
  onClose,
  onCreated,
}: {
  animals: Animal[];
  customers: Customer[];
  initial?: NewBookingInitial;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [custId, setCustId] = useState(initial?.customerId ?? '');
  const [animalIds, setAnimalIds] = useState<string[]>(initial?.animalIds ?? []);
  const [visitsPerDay, setVisitsPerDay] = useState<VisitCount>(initial?.visitsPerDay ?? '1');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [visitsFirstDay, setVisitsFirstDay] = useState<VisitCount>(initial?.visitsFirstDay ?? '1');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [visitsLastDay, setVisitsLastDay] = useState<VisitCount>(initial?.visitsLastDay ?? '1');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; deleted: number; skipped: number } | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const customerAnimals = animals.filter((a) => a.customer === custId);

  function handleCustomerChange(id: string) {
    setCustId(id);
    setAnimalIds([]);
  }

  function toggleAnimal(id: string) {
    setAnimalIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Deletes every day of the detected range for the animal this modal was
  // opened to edit -- the whole booking, not just what's currently in the
  // form (so shrinking the range first then deleting still removes
  // everything the range originally covered).
  async function handleDelete() {
    if (!initial) return;
    setDeleting(true);
    setError(null);
    try {
      for (const entry of initial.editEntries) {
        await api.deleteDayBooking(entry.bookingId);
      }
      setConfirmDelete(false);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete this booking');
      setDeleting(false);
    }
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

      // Shared across every selected animal -- the product for a given day
      // doesn't depend on which animal is being booked.
      const { plan, missing } = buildVisitPlan(start, end, visitsPerDay, visitsFirstDay, visitsLastDay, mapping, bankHolidays);

      if (missing.length > 0) {
        setError(`No product is configured in Settings > Bookings > Visits for: ${missing.join(', ')}.`);
        setBusy(false);
        return;
      }

      const existing = await api.listDayBookings(dateKey(start), dateKey(addDays(end, 1)));
      // b.date is a UTC ISO string -- parse it back into a Date first so the
      // local getters undo the server's local-midnight-to-UTC offset, same
      // fix as productAvailability's dayTypeFor (a raw slice(0,10) compares
      // the wrong calendar day).
      const existingByKey = new Map(existing.map((b) => [`${animalId(b.animal)}|${dateKey(new Date(b.date))}`, b]));

      let created = 0;
      let updated = 0;
      let deleted = 0;
      let skipped = 0;

      // Editing an existing range: remove that animal's entries for any day
      // that's no longer in the (possibly shortened/moved) new range. Only
      // runs while the animal being edited is still checked below -- if
      // staff unchecked it, leave its existing entries alone rather than
      // silently deleting them.
      if (initial && animalIds.includes(initial.editAnimalId)) {
        const newDateKeys = new Set(plan.map((p) => dateKey(p.date)));
        for (const entry of initial.editEntries) {
          if (!newDateKeys.has(entry.date)) {
            await api.deleteDayBooking(entry.bookingId);
            deleted++;
          }
        }
      }

      for (const id of animalIds) {
        const animal = animals.find((a) => a._id === id);
        const owner = animal ? customers.find((c) => c._id === animal.customer) : undefined;
        const travelProductId = owner?.travelChargeable ? (owner.travelProduct ?? null) : null;
        const isEditAnimal = initial?.editAnimalId === id;

        for (const { date, productId } of plan) {
          const key = `${id}|${dateKey(date)}`;
          const existingEntry = existingByKey.get(key);

          if (existingEntry) {
            if (isEditAnimal) {
              if (productIdOf(existingEntry.product) !== productId) {
                await api.updateDayBooking(existingEntry._id, { product: productId });
                updated++;
              }
            } else {
              skipped++;
            }
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

      setResult({ created, updated, deleted, skipped });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the booking');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={initial ? 'Update Booking' : 'New Booking'} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      {result && (
        <div className="error-banner" style={{ background: 'var(--sage-badge, #d9f2e3)', color: 'var(--brand-green)' }}>
          {initial ? (
            <>
              Updated the booking: {result.created} added, {result.updated} changed, {result.deleted} removed
              {result.skipped > 0 ? `, ${result.skipped} left as-is` : ''}.
            </>
          ) : (
            <>
              Created {result.created} booking{result.created === 1 ? '' : 's'}
              {result.skipped > 0 ? `, skipped ${result.skipped} already booked` : ''}.
            </>
          )}
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
        <div className="modal-actions" style={{ justifyContent: initial ? 'space-between' : 'flex-end' }}>
          {initial && (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete booking
            </button>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {result ? 'Close' : 'Cancel'}
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? (initial ? 'Updating…' : 'Creating…') : initial ? 'Update booking' : 'Create booking'}
            </button>
          </div>
        </div>
      </form>

      {confirmDelete && (
        <Modal title="Delete this booking?" onClose={() => setConfirmDelete(false)}>
          <p>
            This permanently removes every day of this booking ({initial?.editEntries.length ?? 0} day
            {initial && initial.editEntries.length === 1 ? '' : 's'}) for this animal.
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete booking'}
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
