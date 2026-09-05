import { useState } from 'react';
import * as api from '../api/client';
import { DateReadout, TimeReadout } from './DateTimeReadout';
import Modal from './Modal';
import { addDays, buildVisitPlan, dateKey, parseYmd } from '../utils/visitPlan';
import type { VisitCount, VisitTime } from '../utils/visitPlan';
import { annualLeaveOn, rangeOverlapsAnnualLeave } from '../utils/annualLeave';
import { dayCareProductFor } from '../utils/visitMapping';
import type { Animal, AnnualLeave, Customer, DayBooking } from '../types';

type Service = 'visits' | 'daycare' | 'boarding';

type SubmitResult = { created: number; updated: number; deleted: number; skipped: number };

// Reserves enough vertical space for a two-line label so a longer label in
// one column of a field-row (e.g. "Visits on First Date") doesn't push its
// input down relative to the shorter labels beside it ("Start Date", "AM/PM").
const ROW_LABEL_STYLE: React.CSSProperties = { minHeight: 34 };

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
  amPmFirstDay: VisitTime;
  amPmLastDay: VisitTime;
  editAnimalId: string;
  editEntries: { date: string; bookingId: string }[];
}

export default function NewBookingModal({
  animals,
  customers,
  annualLeave = [],
  initial,
  initialCustomerId,
  onClose,
  onCreated,
}: {
  animals: Animal[];
  customers: Customer[];
  annualLeave?: AnnualLeave[];
  initial?: NewBookingInitial;
  // Pre-selects the customer without the full edit machinery `initial`
  // needs -- used by the Customer Detail page's Bookings tab, which already
  // knows the customer and just wants this modal opened ready to go.
  initialCustomerId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [custId, setCustId] = useState(initial?.customerId ?? initialCustomerId ?? '');
  // The Service picker only appears for a brand-new booking -- reopening this
  // modal to edit an existing range (`initial`) is Visits-only today, so
  // that flow stays locked to 'visits' rather than exposing a selector that
  // doesn't do anything there.
  const [service, setService] = useState<Service>('visits');
  const [animalIds, setAnimalIds] = useState<string[]>(initial?.animalIds ?? []);
  const [visitsPerDay, setVisitsPerDay] = useState<VisitCount>(initial?.visitsPerDay ?? '1');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [visitsFirstDay, setVisitsFirstDay] = useState<VisitCount>(initial?.visitsFirstDay ?? '1');
  const [amPmFirstDay, setAmPmFirstDay] = useState<VisitTime>(initial?.amPmFirstDay ?? 'PM');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [visitsLastDay, setVisitsLastDay] = useState<VisitCount>(initial?.visitsLastDay ?? '1');
  const [amPmLastDay, setAmPmLastDay] = useState<VisitTime>(initial?.amPmLastDay ?? 'AM');
  // Day Care -- single day, same-day drop off/collection.
  const [dayCareDate, setDayCareDate] = useState('');
  const [dropOffPeriod, setDropOffPeriod] = useState<VisitTime>('AM');
  const [dropOffTime, setDropOffTime] = useState('');
  const [collectionPeriod, setCollectionPeriod] = useState<VisitTime>('PM');
  const [collectionTime, setCollectionTime] = useState('');
  // Boarding -- date range, drop off on the first day and pick up on the last.
  const [boardingStartDate, setBoardingStartDate] = useState('');
  const [boardingDropOffTime, setBoardingDropOffTime] = useState('');
  const [boardingEndDate, setBoardingEndDate] = useState('');
  const [boardingPickUpTime, setBoardingPickUpTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
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

  // Finds an owner's travel product (if chargeable) so every service type
  // can auto-add it alongside the main product, same as the day panel's own
  // maybeAddTravel on BookingsPage.
  function travelProductFor(animalIdVal: string): string | null {
    const animal = animals.find((a) => a._id === animalIdVal);
    const owner = animal ? customers.find((c) => c._id === animal.customer) : undefined;
    return owner?.travelChargeable ? (owner.travelProduct ?? null) : null;
  }

  async function submitVisits() {
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
    if (rangeOverlapsAnnualLeave(start, end, annualLeave)) {
      setError('This date range overlaps a day marked as Annual Leave in Settings > Invoices. Bookings are blocked on those days.');
      return;
    }

    setBusy(true);
    try {
      const [mapping, bankHolidays] = await Promise.all([api.getVisitMapping(), api.listBankHolidays()]);

      // Shared across every selected animal -- the product for a given day
      // doesn't depend on which animal is being booked.
      const { plan, missing } = buildVisitPlan(
        start,
        end,
        visitsPerDay,
        visitsFirstDay,
        visitsLastDay,
        mapping,
        bankHolidays,
        amPmFirstDay,
        amPmLastDay,
      );

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
        const travelProductId = travelProductFor(id);
        const isEditAnimal = initial?.editAnimalId === id;

        for (const { date, productId, visitTime } of plan) {
          const key = `${id}|${dateKey(date)}`;
          const existingEntry = existingByKey.get(key);

          if (existingEntry) {
            if (isEditAnimal) {
              const patch: { product?: string; visitTime?: 'AM' | 'PM' | null } = {};
              if (productIdOf(existingEntry.product) !== productId) patch.product = productId;
              if ((existingEntry.visitTime ?? null) !== (visitTime ?? null)) patch.visitTime = visitTime ?? null;
              if (Object.keys(patch).length > 0) {
                await api.updateDayBooking(existingEntry._id, patch);
                updated++;
              }
            } else {
              skipped++;
            }
            continue;
          }

          await api.createDayBooking({ animal: id, date: dateKey(date), product: productId, quantity: 1, visitTime });
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

  async function submitDayCare() {
    if (!dayCareDate || !dropOffTime || !collectionTime) {
      setError('Choose a date, and both a drop off and collection time.');
      return;
    }
    const date = parseYmd(dayCareDate);
    const leave = annualLeaveOn(date, annualLeave);
    if (leave) {
      setError(`This date is marked as Annual Leave (${leave.name}) in Settings > Invoices. Bookings are blocked on that day.`);
      return;
    }

    setBusy(true);
    try {
      const mapping = await api.getVisitMapping();
      const productId = dayCareProductFor(mapping, dropOffPeriod, collectionPeriod);
      if (!productId) {
        const isFullDay = dropOffPeriod === 'AM' && collectionPeriod === 'PM';
        setError(`No product is configured in Settings > Bookings > Day Care for: ${isFullDay ? 'Full Day' : 'Half Day'}.`);
        setBusy(false);
        return;
      }

      const existing = await api.listDayBookings(dateKey(date), dateKey(addDays(date, 1)));
      const existingByKey = new Map(existing.map((b) => [`${animalId(b.animal)}|${dateKey(new Date(b.date))}`, b]));

      let created = 0;
      let skipped = 0;
      for (const id of animalIds) {
        if (existingByKey.has(`${id}|${dateKey(date)}`)) {
          skipped++;
          continue;
        }
        await api.createDayBooking({
          animal: id,
          date: dateKey(date),
          product: productId,
          quantity: 1,
          dropOffPeriod,
          dropOffTime,
          collectionPeriod,
          collectionTime,
        });
        created++;
        const travelProductId = travelProductFor(id);
        if (travelProductId && travelProductId !== productId) {
          await api.createDayBooking({ animal: id, date: dateKey(date), product: travelProductId, quantity: 1 });
          created++;
        }
      }

      setResult({ created, updated: 0, deleted: 0, skipped });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the booking');
    } finally {
      setBusy(false);
    }
  }

  async function submitBoarding() {
    if (!boardingStartDate || !boardingEndDate) {
      setError('Choose a start and end date.');
      return;
    }
    const start = parseYmd(boardingStartDate);
    const end = parseYmd(boardingEndDate);
    if (end < start) {
      setError('End date must be on or after the start date.');
      return;
    }
    if (!boardingDropOffTime || !boardingPickUpTime) {
      setError('Choose a drop off and pick up time.');
      return;
    }
    if (rangeOverlapsAnnualLeave(start, end, annualLeave)) {
      setError('This date range overlaps a day marked as Annual Leave in Settings > Invoices. Bookings are blocked on those days.');
      return;
    }

    setBusy(true);
    try {
      const mapping = await api.getVisitMapping();
      const productId = mapping.boardingPerDayProduct;
      if (!productId) {
        setError('No product is configured in Settings > Bookings > Boarding for Per Day.');
        setBusy(false);
        return;
      }

      const days: Date[] = [];
      for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

      const existing = await api.listDayBookings(dateKey(start), dateKey(addDays(end, 1)));
      const existingByKey = new Map(existing.map((b) => [`${animalId(b.animal)}|${dateKey(new Date(b.date))}`, b]));

      let created = 0;
      let skipped = 0;
      for (const id of animalIds) {
        const travelProductId = travelProductFor(id);
        for (let i = 0; i < days.length; i++) {
          const date = days[i];
          if (existingByKey.has(`${id}|${dateKey(date)}`)) {
            skipped++;
            continue;
          }
          const isFirst = i === 0;
          const isLast = i === days.length - 1;
          await api.createDayBooking({
            animal: id,
            date: dateKey(date),
            product: productId,
            quantity: 1,
            dropOffTime: isFirst ? boardingDropOffTime : undefined,
            pickUpTime: isLast ? boardingPickUpTime : undefined,
          });
          created++;
          if (travelProductId && travelProductId !== productId) {
            await api.createDayBooking({ animal: id, date: dateKey(date), product: travelProductId, quantity: 1 });
            created++;
          }
        }
      }

      setResult({ created, updated: 0, deleted: 0, skipped });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save the booking');
    } finally {
      setBusy(false);
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

    if (service === 'daycare') await submitDayCare();
    else if (service === 'boarding') await submitBoarding();
    else await submitVisits();
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
        {!initial && (
          <div className="field">
            <label>Service</label>
            <select value={service} onChange={(e) => setService(e.target.value as Service)}>
              <option value="visits">Visits</option>
              <option value="daycare">Day Care</option>
              <option value="boarding">Boarding</option>
            </select>
          </div>
        )}
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
        {service === 'visits' && (
          <>
            <div className="field">
              <label>How Many Visits per Day</label>
              <select value={visitsPerDay} onChange={(e) => setVisitsPerDay(e.target.value as VisitCount)}>
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </div>
            <div className="field-row" style={{ gridTemplateColumns: '1.4fr 1fr 1fr' }}>
              <div className="field">
                <label style={ROW_LABEL_STYLE}>Start Date</label>
                <input type="date" lang="en-GB" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                <DateReadout value={startDate} />
              </div>
              <div className="field">
                <label style={ROW_LABEL_STYLE}>Visits on First Date</label>
                <select value={visitsFirstDay} onChange={(e) => setVisitsFirstDay(e.target.value as VisitCount)}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </div>
              <div className="field">
                <label style={ROW_LABEL_STYLE}>AM/PM</label>
                <select
                  value={amPmFirstDay}
                  onChange={(e) => setAmPmFirstDay(e.target.value as VisitTime)}
                  disabled={visitsFirstDay === '2'}
                  title={visitsFirstDay === '2' ? 'A 2-visit day always covers both AM and PM' : undefined}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
            <div className="field-row" style={{ gridTemplateColumns: '1.4fr 1fr 1fr' }}>
              <div className="field">
                <label style={ROW_LABEL_STYLE}>End Date</label>
                <input type="date" lang="en-GB" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                <DateReadout value={endDate} />
              </div>
              <div className="field">
                <label style={ROW_LABEL_STYLE}>Visits on End Date</label>
                <select value={visitsLastDay} onChange={(e) => setVisitsLastDay(e.target.value as VisitCount)}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </div>
              <div className="field">
                <label style={ROW_LABEL_STYLE}>AM/PM</label>
                <select
                  value={amPmLastDay}
                  onChange={(e) => setAmPmLastDay(e.target.value as VisitTime)}
                  disabled={visitsLastDay === '2'}
                  title={visitsLastDay === '2' ? 'A 2-visit day always covers both AM and PM' : undefined}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </>
        )}
        {service === 'daycare' && (
          <>
            <div className="field">
              <label>Date</label>
              <input type="date" lang="en-GB" value={dayCareDate} onChange={(e) => setDayCareDate(e.target.value)} required />
              <DateReadout value={dayCareDate} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Drop Off</label>
                <select value={dropOffPeriod} onChange={(e) => setDropOffPeriod(e.target.value as VisitTime)}>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
              <div className="field">
                <label>Drop Off Time</label>
                <input type="time" lang="en-GB" value={dropOffTime} onChange={(e) => setDropOffTime(e.target.value)} required />
                <TimeReadout value={dropOffTime} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Collection</label>
                <select value={collectionPeriod} onChange={(e) => setCollectionPeriod(e.target.value as VisitTime)}>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
              <div className="field">
                <label>Collection Time</label>
                <input type="time" lang="en-GB" value={collectionTime} onChange={(e) => setCollectionTime(e.target.value)} required />
                <TimeReadout value={collectionTime} />
              </div>
            </div>
          </>
        )}
        {service === 'boarding' && (
          <>
            <div className="field-row">
              <div className="field">
                <label>Start Date</label>
                <input
                  type="date"
                  lang="en-GB"
                  value={boardingStartDate}
                  onChange={(e) => setBoardingStartDate(e.target.value)}
                  required
                />
                <DateReadout value={boardingStartDate} />
              </div>
              <div className="field">
                <label>Drop Off Time</label>
                <input
                  type="time"
                  lang="en-GB"
                  value={boardingDropOffTime}
                  onChange={(e) => setBoardingDropOffTime(e.target.value)}
                  required
                />
                <TimeReadout value={boardingDropOffTime} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>End Date</label>
                <input
                  type="date"
                  lang="en-GB"
                  value={boardingEndDate}
                  onChange={(e) => setBoardingEndDate(e.target.value)}
                  required
                />
                <DateReadout value={boardingEndDate} />
              </div>
              <div className="field">
                <label>Pick Up Time</label>
                <input
                  type="time"
                  lang="en-GB"
                  value={boardingPickUpTime}
                  onChange={(e) => setBoardingPickUpTime(e.target.value)}
                  required
                />
                <TimeReadout value={boardingPickUpTime} />
              </div>
            </div>
          </>
        )}
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
