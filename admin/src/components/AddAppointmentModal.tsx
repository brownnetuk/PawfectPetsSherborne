import { useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import { annualLeaveOn } from '../utils/annualLeave';
import { parseYmd } from '../utils/visitPlan';
import type { AnnualLeave, Customer } from '../types';

export default function AddAppointmentModal({
  customers,
  annualLeave = [],
  onClose,
  onCreated,
}: {
  customers: Customer[];
  annualLeave?: AnnualLeave[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [custId, setCustId] = useState('');
  const [reason, setReason] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!custId) {
      setError('Choose a customer.');
      return;
    }
    if (!reason.trim()) {
      setError('Enter a reason.');
      return;
    }
    if (!date || !time) {
      setError('Choose a date and time.');
      return;
    }
    const leave = annualLeaveOn(parseYmd(date), annualLeave);
    if (leave) {
      setError(`This date is marked as Annual Leave (${leave.name}) in Settings > Invoices. Bookings are blocked on that day.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createAppointment({ customer: custId, reason: reason.trim(), date, time });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create the appointment');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Add Appointment" onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Customer</label>
          <select value={custId} onChange={(e) => setCustId(e.target.value)} required>
            <option value="">Select a customer…</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Reason</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Meet and greet"
            required
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Date</label>
            <input type="date" lang="en-GB" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field">
            <label>Time</label>
            <input type="time" lang="en-GB" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Adding…' : 'Add appointment'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
