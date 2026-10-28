import { useState } from 'react';
import * as api from '../api/client';
import Modal from './Modal';
import type { Invoice } from '../types';

interface Props {
  // One invoice from its row's Actions menu, or the bulk selection.
  invoices: Invoice[];
  onClose: () => void;
  onScheduled: () => void;
}

// Only drafts can be scheduled (and an already scheduled one moved) -- see
// InvoicesService.scheduleSend().
export function canScheduleSend(inv: Invoice): boolean {
  return inv.status === 'draft' || inv.status === 'scheduled';
}

// e.g. "29/10/2026 09:00", shown under a scheduled invoice's status badge.
export function formatScheduledSend(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).replace(',', '');
}

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm", not an ISO string.
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Defaults to the invoice's current scheduled time when rescheduling one,
// otherwise 9am tomorrow.
function initialValue(invoices: Invoice[]): string {
  if (invoices.length === 1 && invoices[0].scheduledSendAt) {
    return toLocalInputValue(new Date(invoices[0].scheduledSendAt));
  }
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInputValue(d);
}

export default function ScheduleSendModal({ invoices, onClose, onScheduled }: Props) {
  const [sendAt, setSendAt] = useState(() => initialValue(invoices));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const schedulable = invoices.filter(canScheduleSend);
  const skipped = invoices.filter((inv) => !canScheduleSend(inv));
  const single = invoices.length === 1 ? invoices[0] : null;

  async function handleSchedule() {
    const when = new Date(sendAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      setError('Pick a date and time in the future.');
      return;
    }
    setSaving(true);
    setError(null);
    const failures: string[] = [];
    for (const inv of schedulable) {
      try {
        await api.scheduleInvoiceSend(inv._id, when.toISOString());
      } catch (err) {
        failures.push(err instanceof Error ? err.message : `${inv.invoiceNumber}: failed to schedule`);
      }
    }
    setSaving(false);
    if (failures.length > 0) {
      setError(failures.join(' '));
      return;
    }
    onScheduled();
  }

  return (
    <Modal
      title={
        single
          ? `${single.status === 'scheduled' ? 'Reschedule' : 'Schedule'} send: ${single.invoiceNumber}`
          : `Schedule send for ${schedulable.length} invoice${schedulable.length === 1 ? '' : 's'}`
      }
      onClose={onClose}
    >
      {error && <div className="error-banner">{error}</div>}
      {schedulable.length === 0 ? (
        <p>Only draft invoices can be scheduled. None of the selected invoices are drafts.</p>
      ) : (
        <>
          <p>
            {single ? 'The invoice is' : 'Each invoice is'} emailed to its customer at this date and time, then marked as
            sent. Until then it shows as <strong>scheduled</strong>.
          </p>
          {!single && (
            <p>
              <strong>{schedulable.map((inv) => inv.invoiceNumber).join(', ')}</strong>
            </p>
          )}
          {skipped.length > 0 && (
            <p className="hint">
              Skipped as they're not drafts: {skipped.map((inv) => inv.invoiceNumber).join(', ')}
            </p>
          )}
          <div className="field">
            <label>Send on</label>
            <input
              type="datetime-local"
              value={sendAt}
              min={toLocalInputValue(new Date())}
              onChange={(e) => setSendAt(e.target.value)}
              required
            />
          </div>
        </>
      )}
      <div className="modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        {schedulable.length > 0 && (
          <button type="button" className="btn btn-primary" onClick={handleSchedule} disabled={saving || !sendAt}>
            {saving ? 'Scheduling…' : 'Schedule Send'}
          </button>
        )}
      </div>
    </Modal>
  );
}
