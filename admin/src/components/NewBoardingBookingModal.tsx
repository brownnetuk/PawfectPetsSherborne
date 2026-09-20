import { useState } from 'react';
import * as api from '../api/client';
import CustomerPicker from './CustomerPicker';
import DateInput from './DateInput';
import { TimeReadout } from './DateTimeReadout';
import Modal from './Modal';
import type { Animal, Customer } from '../types';

// Direct (no-quote) creation for the new reference-numbered Boarding & Day
// Care workflow -- staff's "+ New booking" on the Bookings tab. Distinct
// from NewBookingModal.tsx (the older Visits/Day Care/Boarding calendar
// entry form): this always raises an invoice immediately (see backend's
// BoardingBookingsService.createDirect()), and only covers Boarding/Day Care
// since Visits aren't part of this workflow.
export default function NewBoardingBookingModal({
  animals,
  customers,
  onClose,
  onCreated,
}: {
  animals: Animal[];
  customers: Customer[];
  onClose: () => void;
  onCreated: (bookingId: string) => void;
}) {
  const [custId, setCustId] = useState('');
  const [type, setType] = useState<'boarding' | 'dayCare'>('boarding');
  const [animalIds, setAnimalIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [dropOffTime, setDropOffTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pickUpTime, setPickUpTime] = useState('');
  const [dropOffPeriod, setDropOffPeriod] = useState<'AM' | 'PM'>('AM');
  const [collectionPeriod, setCollectionPeriod] = useState<'AM' | 'PM'>('PM');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const customerAnimals = animals.filter((a) => a.customer === custId);

  function toggleAnimal(id: string) {
    setAnimalIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function handleCustomerChange(id: string) {
    setCustId(id);
    setAnimalIds([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!custId) {
      setError('Choose a customer.');
      return;
    }
    if (animalIds.length === 0) {
      setError('Choose at least one animal.');
      return;
    }
    if (!startDate || !dropOffTime || !pickUpTime || (type === 'boarding' && !endDate)) {
      setError('Fill in the dates and times.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.createBoardingBooking({
        customer: custId,
        animals: animalIds,
        type,
        startDate,
        dropOffTime,
        endDate: type === 'boarding' ? endDate : undefined,
        pickUpTime,
        dropOffPeriod: type === 'dayCare' ? dropOffPeriod : undefined,
        collectionPeriod: type === 'dayCare' ? collectionPeriod : undefined,
        notes: notes.trim() || undefined,
      });
      onCreated(created._id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the booking');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New booking" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Customer</label>
          <CustomerPicker customers={customers} value={custId} onChange={handleCustomerChange} />
        </div>
        <div className="field">
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as 'boarding' | 'dayCare')}>
            <option value="boarding">Boarding</option>
            <option value="dayCare">Day Care</option>
          </select>
        </div>
        <div className="field">
          <label>Animals</label>
          {!custId ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Select a customer first.</div>
          ) : customerAnimals.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>This customer has no animals on file.</div>
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
        {type === 'boarding' ? (
          <>
            <div className="field-row">
              <div className="field">
                <label>Start Date</label>
                <DateInput value={startDate} onChange={setStartDate} required />
              </div>
              <div className="field">
                <label>Drop Off Time</label>
                <input type="time" lang="en-GB" value={dropOffTime} onChange={(e) => setDropOffTime(e.target.value)} required />
                <TimeReadout value={dropOffTime} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>End Date</label>
                <DateInput value={endDate} onChange={setEndDate} required />
              </div>
              <div className="field">
                <label>Pick Up Time</label>
                <input type="time" lang="en-GB" value={pickUpTime} onChange={(e) => setPickUpTime(e.target.value)} required />
                <TimeReadout value={pickUpTime} />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="field">
              <label>Date</label>
              <DateInput value={startDate} onChange={setStartDate} required />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Drop Off</label>
                <select value={dropOffPeriod} onChange={(e) => setDropOffPeriod(e.target.value as 'AM' | 'PM')}>
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
                <select value={collectionPeriod} onChange={(e) => setCollectionPeriod(e.target.value as 'AM' | 'PM')}>
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
              <div className="field">
                <label>Collection Time</label>
                <input type="time" lang="en-GB" value={pickUpTime} onChange={(e) => setPickUpTime(e.target.value)} required />
                <TimeReadout value={pickUpTime} />
              </div>
            </div>
          </>
        )}
        <div className="field">
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create booking'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
