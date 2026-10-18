import { useEffect, useState } from 'react';
import { fetchBookings } from '../api';
import { formatDate } from '../format';
import type { BookingRecord } from '../types';

function when(b: BookingRecord): string {
  if (b.dropOffTime || b.collectionTime) {
    return [b.dropOffTime && `Drop-off ${b.dropOffTime}`, b.collectionTime && `Collection ${b.collectionTime}`]
      .filter(Boolean)
      .join(' · ');
  }
  return b.visitTime ?? '';
}

// Upcoming bookings first (soonest at the top), then past ones.
export default function BookingsPage() {
  const [bookings, setBookings] = useState<BookingRecord[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchBookings()
      .then((list) => setBookings(list.filter((b) => !b.placeholder)))
      .catch((err: Error) => setError(err.message));
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = (bookings ?? [])
    .filter((b) => new Date(b.date) >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = (bookings ?? []).filter((b) => new Date(b.date) < today).slice(0, 20);

  const list = (items: BookingRecord[]) => (
    <ul className="doc-list">
      {items.map((b) => {
        const pets = [b.animal?.name, ...(b.additionalAnimals ?? []).map((a) => a.name)].filter(Boolean);
        return (
          <li key={b._id} className="doc-row">
            <div className="doc-main">
              <div className="doc-title">{formatDate(b.date)}</div>
              <div className="muted small">
                {[b.product?.name, pets.join(', '), when(b)].filter(Boolean).join(' · ')}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section>
      <h2>Bookings</h2>
      {error && <p className="error">{error}</p>}
      {!bookings && !error && <p className="muted">Loading…</p>}
      {bookings && (
        <>
          <h3>Upcoming</h3>
          {upcoming.length ? list(upcoming) : <p className="muted">Nothing booked yet.</p>}
          {past.length > 0 && (
            <>
              <h3>Recent</h3>
              {list(past)}
            </>
          )}
        </>
      )}
    </section>
  );
}
