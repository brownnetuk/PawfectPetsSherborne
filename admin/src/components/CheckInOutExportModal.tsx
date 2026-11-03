import { useEffect, useState, type FormEvent } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import {
  buildCheckInOutReportPdf,
  checkInOutReportFileName,
  stayInRange,
} from '../pdf/checkInOutReportPdf';
import type { BoardingBookingWithStatus } from '../types';

interface Props {
  mode: 'pdf' | 'email';
  /** Every booking on the Check In / Check Out tab; the range is applied here. */
  items: BoardingBookingWithStatus[];
  onClose: () => void;
  /** Called once the PDF has downloaded or the email has gone. */
  onDone: (message: string) => void;
}

function dayLabel(day: string): string {
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-GB');
}

function defaultMessage(businessName: string): string {
  return `Hi,\n\nPlease find attached the check in / check out report.\n\nKind regards,\n${businessName}`;
}

// Bookings > Check In / Check Out > Export: picks the period (a start and end
// date, or everything), then downloads the landscape report or -- for Email
// -- sends it as an attachment, to the business's own address by default.
export default function CheckInOutExportModal({ mode, items, onClose, onDone }: Props) {
  const [range, setRange] = useState<'dates' | 'all'>('dates');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('Check In / Check Out Report');
  const [message, setMessage] = useState(() => defaultMessage('PawfectPets Sherborne'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'email') return;
    api
      .getBusinessInfo()
      .then((info) => {
        if (info.email) setRecipient((current) => current || info.email);
        if (info.name) {
          setMessage((current) =>
            current === defaultMessage('PawfectPets Sherborne') ? defaultMessage(info.name) : current,
          );
        }
      })
      .catch(() => {});
  }, [mode]);

  const periodLabel = range === 'all' ? 'All dates' : from && to ? `${dayLabel(from)} – ${dayLabel(to)}` : '';
  const rows = range === 'all' ? items : items.filter(({ booking }) => stayInRange(booking, from, to));

  // Keep the email's subject in step with the period, unless it's been edited.
  useEffect(() => {
    setSubject((current) =>
      current.startsWith('Check In / Check Out Report')
        ? `Check In / Check Out Report${periodLabel ? ` – ${periodLabel}` : ''}`
        : current,
    );
  }, [periodLabel]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (range === 'dates' && from > to) {
      setError('The end date must be on or after the start date.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const doc = await buildCheckInOutReportPdf({ rows, periodLabel });
      const fileName = checkInOutReportFileName(periodLabel);
      if (mode === 'pdf') {
        doc.save(fileName);
        onDone(`Exported ${rows.length} booking${rows.length === 1 ? '' : 's'} to PDF.`);
      } else {
        await api.sendCheckInOutReportEmail({
          to: recipient.trim(),
          subject: subject.trim(),
          message,
          attachmentData: doc.output('datauristring'),
          attachmentName: fileName,
        });
        onDone(`Check in / check out report emailed to ${recipient.trim()}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : mode === 'pdf' ? 'Failed to build the PDF' : 'Failed to send this email');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={mode === 'pdf' ? 'Export to PDF' : 'Email report'} onClose={onClose}>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Period</label>
          <div className="tabs" style={{ marginBottom: 0, alignSelf: 'flex-start' }}>
            <button type="button" className={range === 'dates' ? 'active' : ''} onClick={() => setRange('dates')}>
              Start &amp; end date
            </button>
            <button type="button" className={range === 'all' ? 'active' : ''} onClick={() => setRange('all')}>
              All
            </button>
          </div>
        </div>
        {range === 'dates' && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 160px' }}>
              <label>Start date *</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
            </div>
            <div className="field" style={{ flex: '1 1 160px' }}>
              <label>End date *</label>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} required />
            </div>
          </div>
        )}
        {mode === 'email' && (
          <>
            <div className="field">
              <label>To *</label>
              <input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} required />
            </div>
            <div className="field">
              <label>Subject *</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </div>
            <div className="field">
              <label>Message</label>
              <textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
          </>
        )}
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 12px' }}>
          {range === 'dates' && !(from && to)
            ? 'Includes every booking whose stay falls within the dates you pick.'
            : `${rows.length} booking${rows.length === 1 ? '' : 's'} will be included.`}
        </p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? (mode === 'pdf' ? 'Exporting…' : 'Sending…') : mode === 'pdf' ? 'Export' : 'Send'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
