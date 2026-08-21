import { useEffect, useState } from 'react';
import * as api from '../api/client';
import ActionsMenu from '../components/ActionsMenu';
import DocumentFormModal from '../components/DocumentFormModal';
import Modal from '../components/Modal';
import { buildItemsTableHtml, interpolateBody, interpolateSubject } from '../utils/emailTemplate';
import type { BusinessInfo, Invoice, InvoiceStatus, Quote, QuoteStatus } from '../types';

const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
const QUOTE_STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'declined', 'expired'];

type Tab = 'invoices' | 'quotes';

// Populate returns null for a dangling reference (the customer was deleted
// after this invoice/quote was created) -- the type doesn't say so, but the
// real data can, so both helpers guard against it rather than crash.
function customerLabel(customer: Invoice['customer'] | Quote['customer']): string {
  if (!customer) return '(deleted customer)';
  return typeof customer === 'string' ? customer : customer.name;
}

// Same DD/MM/YYYY as the backend's formatUkDate, worked out from the stored
// date's own YYYY-MM-DD prefix rather than a Date object -- consistent with
// this file's other date helpers, and guarantees no timezone drift.
function formatUkDateFromIso(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function SendPreviewModal({
  kind,
  doc,
  onClose,
  onConfirm,
}: {
  kind: 'invoice' | 'quote';
  doc: Invoice | Quote;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [template, setTemplate] = useState<{ subject: string; body: string } | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getBusinessInfo().then(setBusinessInfo).catch(() => {});
    api
      .listEmailTemplates()
      .then((templates) => setTemplate(templates.find((t) => t.trigger === kind) ?? null))
      .catch(() => setTemplate(null));
  }, [kind]);

  async function handleConfirm() {
    setSubmitting(true);
    await onConfirm();
    setSubmitting(false);
    onClose();
  }

  const isInvoice = kind === 'invoice';
  const number = isInvoice ? (doc as Invoice).invoiceNumber : (doc as Quote).quoteNumber;
  const dueDate = isInvoice ? (doc as Invoice).dueDate : (doc as Quote).validUntil;

  let renderedSubject = '';
  let renderedBody = '';
  if (businessInfo && template) {
    const vars: Record<string, string | undefined> = {
      businessName: businessInfo.name,
      businessAddress: businessInfo.address,
      businessTown: businessInfo.town,
      businessPostcode: businessInfo.postcode,
      businessTelephone: businessInfo.telephone,
      businessEmail: businessInfo.email,
      businessWebsite: businessInfo.website,
      customer_name: customerLabel(doc.customer),
      subject: doc.subject,
      subtotal: doc.subtotal.toFixed(2),
      total: doc.total.toFixed(2),
      bank_name: businessInfo.bankName,
      sort_code: businessInfo.sortCode,
      account_number: businessInfo.accountNumber,
      ...(isInvoice
        ? {
            invoice_number: number,
            invoice_date: formatUkDateFromIso(doc.issueDate),
            due_date: formatUkDateFromIso(dueDate),
          }
        : {
            quote_number: number,
            quote_date: formatUkDateFromIso(doc.issueDate),
            valid_until: formatUkDateFromIso(dueDate),
          }),
    };
    const logoTag = businessInfo.logoImage
      ? `<img src="${businessInfo.logoImage}" alt="" style="max-height:60px;max-width:220px;display:block;" />`
      : '';
    const rawVars = { logo: logoTag, items_table: buildItemsTableHtml(doc.lineItems) };
    renderedSubject = interpolateSubject(template.subject, vars);
    renderedBody = interpolateBody(template.body, vars, rawVars, true);
  }

  return (
    <Modal title={`Send ${isInvoice ? 'Invoice' : 'Quote'} ${number}`} onClose={onClose} wide>
      {template === undefined && <div className="empty-state">Loading…</div>}
      {template === null && (
        <>
          <div className="error-banner">
            No {isInvoice ? 'Invoice' : 'Quote'} Template is set up yet — add one in Settings &gt; Email Templates
            first.
          </div>
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
      {template && businessInfo && (
        <>
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: -6 }}>
            This is exactly what will be emailed to {customerLabel(doc.customer)}.
          </p>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ background: 'var(--sage)', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textTransform: 'uppercase' }}>Subject</div>
              <div style={{ fontWeight: 600 }}>{renderedSubject}</div>
            </div>
            <div
              style={{ padding: '16px 20px', background: '#fff', lineHeight: 1.5, maxHeight: 420, overflowY: 'auto' }}
              dangerouslySetInnerHTML={{ __html: renderedBody }}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={submitting}>
              {submitting ? 'Sending…' : 'Send'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default function InvoicesPage() {
  const [tab, setTab] = useState<Tab>('invoices');

  return (
    <div>
      <div className="page-header">
        <h1>Invoices &amp; Quotes</h1>
      </div>

      <div className="tabs">
        <button className={tab === 'invoices' ? 'active' : ''} onClick={() => setTab('invoices')}>
          Invoices
        </button>
        <button className={tab === 'quotes' ? 'active' : ''} onClick={() => setTab('quotes')}>
          Quotes
        </button>
      </div>

      {tab === 'invoices' && <InvoicesTab />}
      {tab === 'quotes' && <QuotesTab />}
    </div>
  );
}

function InvoicesTab() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendPreview, setSendPreview] = useState<Invoice | null>(null);

  function refresh() {
    api.listInvoices().then(setInvoices).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  async function handleStatusChange(id: string, status: string) {
    await api.updateInvoiceStatus(id, status);
    refresh();
  }

  async function handleSend(inv: Invoice) {
    setSendingId(inv._id);
    setError(null);
    try {
      await api.sendInvoiceEmail(inv._id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to send invoice ${inv.invoiceNumber}`);
    } finally {
      setSendingId(null);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteInvoice(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete invoice');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
          New invoice
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {!invoices || invoices.length === 0 ? (
          <div className="empty-state">{invoices === null ? 'Loading…' : 'No invoices yet.'}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
                <th>Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv._id}>
                  <td>{inv.invoiceNumber}</td>
                  <td>{customerLabel(inv.customer)}</td>
                  <td>£{inv.total.toFixed(2)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <span className={`badge badge-${inv.status}`}>
                      <select value={inv.status} onChange={(e) => handleStatusChange(inv._id, e.target.value)}>
                        {INVOICE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </span>
                    {inv.openedAt && (
                      <span className="badge badge-read" title={`Opened ${new Date(inv.openedAt).toLocaleString()}`}>
                        Read
                      </span>
                    )}
                  </td>
                  <td>{new Date(inv.dueDate).toLocaleDateString()}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <ActionsMenu
                      items={[
                        { label: 'View / Edit', onClick: () => setEditing(inv) },
                        {
                          label: sendingId === inv._id ? 'Sending…' : 'Send',
                          onClick: () => setSendPreview(inv),
                          disabled: sendingId === inv._id,
                        },
                        { label: 'Delete', onClick: () => setDeleting(inv), danger: true, dividerBefore: true },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <DocumentFormModal
          kind="invoice"
          existing={null}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            refresh();
          }}
        />
      )}

      {editing && (
        <DocumentFormModal
          kind="invoice"
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {sendPreview && (
        <SendPreviewModal
          kind="invoice"
          doc={sendPreview}
          onClose={() => setSendPreview(null)}
          onConfirm={() => handleSend(sendPreview)}
        />
      )}

      {deleting && (
        <Modal title="Delete invoice?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently deletes invoice <strong>{deleting.invoiceNumber}</strong>.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete invoice'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function QuotesTab() {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [deleting, setDeleting] = useState<Quote | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendPreview, setSendPreview] = useState<Quote | null>(null);

  function refresh() {
    api.listQuotes().then(setQuotes).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  async function handleStatusChange(id: string, status: string) {
    await api.updateQuoteStatus(id, status);
    refresh();
  }

  async function handleSend(q: Quote) {
    setSendingId(q._id);
    setError(null);
    try {
      await api.sendQuoteEmail(q._id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to send quote ${q.quoteNumber}`);
    } finally {
      setSendingId(null);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await api.deleteQuote(deleting._id);
      setDeleting(null);
      refresh();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete quote');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
          New Quote
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {!quotes || quotes.length === 0 ? (
          <div className="empty-state">{quotes === null ? 'Loading…' : 'No quotes yet.'}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Quote</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Status</th>
                <th>Valid until</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q._id}>
                  <td>{q.quoteNumber}</td>
                  <td>{customerLabel(q.customer)}</td>
                  <td>£{q.total.toFixed(2)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <span className={`badge badge-${q.status}`}>
                      <select value={q.status} onChange={(e) => handleStatusChange(q._id, e.target.value)}>
                        {QUOTE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </span>
                    {q.openedAt && (
                      <span className="badge badge-read" title={`Opened ${new Date(q.openedAt).toLocaleString()}`}>
                        Read
                      </span>
                    )}
                  </td>
                  <td>{new Date(q.validUntil).toLocaleDateString()}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <ActionsMenu
                      items={[
                        { label: 'View / Edit', onClick: () => setEditing(q) },
                        {
                          label: sendingId === q._id ? 'Sending…' : 'Send',
                          onClick: () => setSendPreview(q),
                          disabled: sendingId === q._id,
                        },
                        { label: 'Delete', onClick: () => setDeleting(q), danger: true, dividerBefore: true },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <DocumentFormModal
          kind="quote"
          existing={null}
          onClose={() => setShowNew(false)}
          onSaved={() => {
            setShowNew(false);
            refresh();
          }}
        />
      )}

      {editing && (
        <DocumentFormModal
          kind="quote"
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {sendPreview && (
        <SendPreviewModal
          kind="quote"
          doc={sendPreview}
          onClose={() => setSendPreview(null)}
          onConfirm={() => handleSend(sendPreview)}
        />
      )}

      {deleting && (
        <Modal title="Delete quote?" onClose={() => setDeleting(null)}>
          {deleteError && <div className="error-banner">{deleteError}</div>}
          <p>
            This permanently deletes quote <strong>{deleting.quoteNumber}</strong>.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleteBusy}>
              {deleteBusy ? 'Deleting…' : 'Delete quote'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

