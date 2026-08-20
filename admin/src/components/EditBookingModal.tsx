import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { Animal, Booking, BookingStatus, ServiceType } from '../types';

const STATUSES: BookingStatus[] = ['requested', 'confirmed', 'in_progress', 'completed', 'cancelled'];

function customerId(customer: Booking['customer']): string {
  return typeof customer === 'string' ? customer : customer._id;
}

function animalId(animal: Animal | string): string {
  return typeof animal === 'string' ? animal : animal._id;
}

interface Props {
  booking: Booking;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditBookingModal({ booking, onClose, onSaved }: Props) {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [selectedAnimals, setSelectedAnimals] = useState<string[]>(booking.animals.map(animalId));
  const [serviceType, setServiceType] = useState<ServiceType>(booking.serviceType);
  const [startDate, setStartDate] = useState(booking.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(booking.endDate.slice(0, 10));
  const [price, setPrice] = useState(booking.price != null ? String(booking.price) : '');
  const [notes, setNotes] = useState(booking.notes ?? '');
  const [status, setStatus] = useState<BookingStatus>(booking.status);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listAnimals(customerId(booking.customer)).then(setAnimals).catch(() => {});
  }, [booking.customer]);

  function toggleAnimal(id: string) {
    setSelectedAnimals((s) => (s.includes(id) ? s.filter((a) => a !== id) : [...s, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedAnimals.length === 0) {
      setError('Select at least one pet.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.updateBooking(booking._id, {
        animals: selectedAnimals,
        serviceType,
        startDate,
        endDate,
        price: price ? Number(price) : undefined,
        notes: notes || undefined,
        status,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Edit booking" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Pets</label>
          {animals.length === 0 ? (
            <div className="field-hint" style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              Loading…
            </div>
          ) : (
            animals.map((a) => (
              <label key={a._id} style={{ display: 'block', fontWeight: 400, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={selectedAnimals.includes(a._id)}
                  onChange={() => toggleAnimal(a._id)}
                  style={{ marginRight: 8 }}
                />
                {a.name} ({a.species})
              </label>
            ))
          )}
        </div>
        <div className="field-row">
          <div className="field">
            <label>Service type</label>
            <select value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceType)}>
              <option value="boarding">Boarding</option>
              <option value="daycare">Daycare</option>
              <option value="grooming">Grooming</option>
              <option value="walking">Walking</option>
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as BookingStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div className="field">
            <label>End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
        </div>
        <div className="field">
          <label>Price (£)</label>
          <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
