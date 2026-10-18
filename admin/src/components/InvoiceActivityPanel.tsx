import { useEffect, useState } from 'react';
import * as api from '../api/client';
import { ChevronDownIcon } from './icons';
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

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// A collapsible strip that sits above the invoice preview rather than a
// separate column, so the PDF gets the full width. Each entry is condensed
// to a badge + timestamp line with the description and user underneath.
export default function InvoiceActivityPanel({
  invoiceId,
  refreshToken,
  open,
  onToggle,
}: {
  invoiceId: string;
  refreshToken?: number;
  open: boolean;
  onToggle: () => void;
}) {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    api
      .listAuditLogForInvoice(invoiceId)
      .then(setEntries)
      .catch(() => setEntries([]));
  }, [invoiceId, refreshToken]);

  const latest = entries?.[0];

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)' }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          font: 'inherit',
          color: 'inherit',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-flex', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }}>
          <ChevronDownIcon />
        </span>
        <strong>Activity</strong>
        {entries && <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>({entries.length})</span>}
        {!open && latest && (
          <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Latest: {activityLabel(latest)} · {formatWhen(latest.createdAt)}
          </span>
        )}
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '4px 12px 8px', maxHeight: 260, overflowY: 'auto' }}>
          {entries === null ? (
            <div style={{ padding: '6px 0', fontSize: '0.85rem', color: 'var(--muted)' }}>Loading…</div>
          ) : entries.length === 0 ? (
            <div style={{ padding: '6px 0', fontSize: '0.85rem', color: 'var(--muted)' }}>No activity recorded yet.</div>
          ) : (
            entries.map((e) => (
              <div key={e._id} style={{ padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span className={`badge ${badgeClass(e.type)}`}>{activityLabel(e)}</span>
                  <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatWhen(e.createdAt)}</span>
                </div>
                <div style={{ color: 'var(--muted)', marginTop: 2 }}>
                  {e.description ?? '—'} · {e.actor}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
