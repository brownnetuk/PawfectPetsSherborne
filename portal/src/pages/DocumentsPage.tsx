import { useEffect, useState } from 'react';
import { downloadPdf, fetchInvoices, fetchQuotes } from '../api';
import { formatDate, formatMoney } from '../format';
import type { InvoiceRecord, QuoteRecord } from '../types';

interface Row {
  id: string;
  number: string;
  subject?: string;
  issueDate: string;
  secondDateLabel: string;
  secondDate: string;
  total: number;
  status: string;
}

const STATUS_LABEL: Record<string, string> = {
  sent: 'Outstanding',
  overdue: 'Overdue',
  paid: 'Paid',
  cancelled: 'Cancelled',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
};

function invoiceRow(i: InvoiceRecord): Row {
  return {
    id: i._id,
    number: i.invoiceNumber,
    subject: i.subject,
    issueDate: i.issueDate,
    secondDateLabel: 'Due',
    secondDate: i.dueDate,
    total: i.total,
    status: i.status,
  };
}

function quoteRow(q: QuoteRecord): Row {
  return {
    id: q._id,
    number: q.quoteNumber,
    subject: q.subject,
    issueDate: q.issueDate,
    secondDateLabel: 'Valid until',
    secondDate: q.validUntil,
    total: q.total,
    status: q.status === 'sent' ? 'awaiting' : q.status,
  };
}

// Read-only list of the customer's invoices or quotes, each with a PDF
// download. Drafts are staff work-in-progress, so they're never shown.
export default function DocumentsPage({ kind }: { kind: 'invoices' | 'quotes' }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  // App.tsx keys this page by kind, so switching tabs remounts it fresh.
  useEffect(() => {
    const load =
      kind === 'invoices'
        ? fetchInvoices().then((list) => list.filter((i) => i.status !== 'draft' && i.status !== 'scheduled').map(invoiceRow))
        : fetchQuotes().then((list) => list.filter((q) => q.status !== 'draft').map(quoteRow));
    load.then(setRows).catch((err: Error) => setError(err.message));
  }, [kind]);

  const label = kind === 'invoices' ? 'Invoice' : 'Quote';

  async function download(row: Row) {
    setDownloading(row.id);
    setError('');
    try {
      await downloadPdf(kind, row.id, `${label} ${row.number}.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <section>
      {error && <div className="error-banner">{error}</div>}
      {!rows && !error && <p className="empty-state">Loading…</p>}
      {rows && rows.length === 0 && (
        <p className="empty-state">You don't have any {kind} yet.</p>
      )}
      {rows && rows.length > 0 && (
        <ul className="doc-list">
          {rows.map((row) => (
            <li key={row.id} className="doc-row">
              <div className="doc-main">
                <div className="doc-title">
                  {label} {row.number}
                  <span className={`badge badge-${row.status}`}>
                    {STATUS_LABEL[row.status] ?? 'Awaiting reply'}
                  </span>
                </div>
                {row.subject && <div className="doc-subject">{row.subject}</div>}
                <div className="muted small">
                  Issued {formatDate(row.issueDate)}
                  {row.secondDate && ` · ${row.secondDateLabel} ${formatDate(row.secondDate)}`}
                </div>
              </div>
              <div className="doc-side">
                <div className="doc-total">{formatMoney(row.total)}</div>
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => void download(row)}
                  disabled={downloading === row.id}
                >
                  {downloading === row.id ? 'Preparing…' : 'Download PDF'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {kind === 'quotes' && rows && rows.length > 0 && (
        <p className="muted small">To accept a quote or ask about it, just get in touch with us.</p>
      )}
    </section>
  );
}
