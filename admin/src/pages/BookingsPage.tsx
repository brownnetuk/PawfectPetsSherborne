import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from '../components/Modal';
import type { Animal, Booking, BookingStatus, Customer } from '../types';

const STATUSES: BookingStatus[] = ['requested', 'confirmed', 'in_progress', 'completed', 'cancelled'];

function customerLabel(customer: Booking['customer']): string {
  return typeof customer === 'string' ? customer : customer.name;
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  function refresh() {
    api.listBookings().then(setBookings).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  async function handleStatusChange(id: string, status: string) {
    await api.updateBookingStatus(id, status);
    refresh();
  }

  return (
    <div>
      <div className="page-header">
        <h1>Bookings</h1>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
          New booking
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {!bookings || bookings.length === 0 ? (
          <div className="empty-state">{bookings === null ? 'Loading…' : 'No bookings yet.'}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Service</th>
                <th>Dates</th>
                <th>Status</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b._id}>
                  <td>{customerLabel(b.customer)}</td>
                  <td style={{ textTransform: 'capitalize' }}>{b.serviceType}</td>
                  <td>
                    {new Date(b.startDate).toLocaleDateString()} – {new Date(b.endDate).toLocaleDateString()}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select value={b.status} onChange={(e) => handleStatusChange(b._id, e.target.value)}>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{b.price != null ? `£${b.price.toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <NewBookingModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function NewBookingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [selectedAnimals, setSelectedAnimals] = useState<string[]>([]);
  const [serviceType, setServiceType] = useState('boarding');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listCustomers().then(setCustomers).catch(() => {});
  }, []);

  useEffect(() => {
    if (!customerId) {
      setAnimals([]);
      return;
    }
    api.listAnimals(customerId).then(setAnimals).catch(() => {});
    setSelectedAnimals([]);
  }, [customerId]);

  function toggleAnimal(id: string) {
    setSelectedAnimals((s) => (s.includes(id) ? s.filter((a) => a !== id) : [...s, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || selectedAnimals.length === 0) {
      setError('Choose a customer and at least one pet.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createBooking({
        customer: customerId,
        animals: selectedAnimals,
        serviceType,
        startDate,
        endDate,
        price: price ? Number(price) : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create booking');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New booking" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="" disabled>
              Select a customer…
            </option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {customerId && (
          <div className="field">
            <label>Pets</label>
            {animals.length === 0 ? (
              <div className="field-hint" style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                This customer has no registered pets yet.
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
        )}
        <div className="field">
          <label>Service type</label>
          <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
            <option value="boarding">Boarding</option>
            <option value="daycare">Daycare</option>
            <option value="grooming">Grooming</option>
            <option value="walking">Walking</option>
          </select>
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
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create booking'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
