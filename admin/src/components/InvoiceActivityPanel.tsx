import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { AuditEventType, AuditLogEntry } from '../types';

// Maps each invoice-related event type to the existing badge palette (see
// index.css's .badge-* rules) rather than inventing new colours -- created
// events read as "good" (green), removals as "bad" (red), everything else
// (updates, sends, reads, payments) as neutral/informational (amber/blue).
function badgeClass(type: AuditEventType): string {
  if (type.endsWith('_created') || type === 'payment_received' || type === 'credit_note_issued') {
    return 'badge-active';
  }
  if (type.endsWith('_removed')) {
    return 'badge-overdue';
  }
  if (type.endsWith('_emailed') || type.endsWith('_read')) {
    return 'badge-sent';
  }
  return 'badge-partially_paid';
}

function activityLabel(entry: AuditLogEntry): string {
  return entry.title;
}

export default function InvoiceActivityPanel({
  invoiceId,
  refreshToken,
}: {
  invoiceId: string;
  refreshToken?: number;
}) {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    api
      .listAuditLogForInvoice(invoiceId)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [invoiceId, refreshToken]);

  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <h3 style={{ margin: '0 0 12px' }}>Activity</h3>
      <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: 6 }}>
        LOG
      </div>
      {entries === null ? (
        <div className="empty-state">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="empty-state">No activity recorded yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Activity</th>
                <th>Description</th>
                <th>User</th>
                <th>Date / Time</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e._id}>
                  <td>
                    <span className={`badge ${badgeClass(e.type)}`}>{activityLabel(e)}</span>
                  </td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{e.description ?? '—'}</td>
                  <td style={{ fontSize: '0.85rem' }}>{e.actor}</td>
                  <td style={{ fontSize: '0.85rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {new Date(e.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}{' '}
                    {new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
