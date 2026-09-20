import { useState } from 'react';
import * as api from '../api/client';
import DateInput from './DateInput';
import { TimeReadout } from './DateTimeReadout';
import Modal from './Modal';
import type { BoardingBooking } from '../types';

// "Amend dates" on the Booking Detail page -- mid-stay changes aren't
// accepted, so this is the only way to change a confirmed booking's dates.
// Recalculates the linked invoice's line items for the new dates; whatever's
// already been paid stays fixed and is absorbed into the new total (see
// backend's BoardingBookingsService.amendDates()).
export default function AmendBoardingBookingDatesModal({
  booking,
  onClose,
  onAmended,
}: {
  booking: BoardingBooking;
  onClose: () => void;
  onAmended: () => void;
}) {
  const [startDate, setStartDate] = useState(booking.startDate);
  const [dropOffTime, setDropOffTime] = useState(booking.dropOffTime);
  const [endDate, setEndDate] = useState(booking.endDate);
  const [pickUpTime, setPickUpTime] = useState(booking.pickUpTime);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.amendBoardingBookingDates(booking._id, {
        startDate,
        dropOffTime,
        endDate: booking.type === 'boarding' ? endDate : undefined,
        pickUpTime,
      });
      onAmended();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to amend the dates');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Amend dates — ${booking.reference}`} onClose={onClose}>
      <p style={{ fontSize: '0.88rem', color: 'var(--muted)', marginTop: -6 }}>
        Mid-stay changes aren't accepted -- amending the dates here updates the linked invoice to match. Whatever's
        already been paid stays fixed and is absorbed into the new balance.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field">
            <label>{booking.type === 'boarding' ? 'Start Date' : 'Date'}</label>
            <DateInput value={startDate} onChange={setStartDate} required />
          </div>
          <div className="field">
            <label>Drop Off Time</label>
            <input type="time" lang="en-GB" value={dropOffTime} onChange={(e) => setDropOffTime(e.target.value)} required />
            <TimeReadout value={dropOffTime} />
          </div>
        </div>
        {booking.type === 'boarding' && (
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
        )}
        {booking.type === 'dayCare' && (
          <div className="field">
            <label>Collection Time</label>
            <input type="time" lang="en-GB" value={pickUpTime} onChange={(e) => setPickUpTime(e.target.value)} required />
            <TimeReadout value={pickUpTime} />
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save dates'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
