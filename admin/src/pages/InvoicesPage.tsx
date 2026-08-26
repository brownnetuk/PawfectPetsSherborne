import { useEffect, useState } from 'react';
import * as api from '../api/client';
import ActionsMenu from '../components/ActionsMenu';
import DocumentFormModal from '../components/DocumentFormModal';
import { MailIcon, MailOpenIcon } from '../components/icons';
import InvoiceActivityPanel from '../components/InvoiceActivityPanel';
import InvoiceHtmlView from '../components/InvoiceHtmlView';
import Modal from '../components/Modal';
import QuoteHtmlView from '../components/QuoteHtmlView';
import RecordPaymentModal from '../components/RecordPaymentModal';
import RequestDepositModal from '../components/RequestDepositModal';
import SendPreviewModal, { customerLabel } from '../components/SendPreviewModal';
import { buildInvoicePdf } from '../pdf/invoicePdf';
import type { BusinessInfo, Invoice, InvoiceStatus, Quote, QuoteStatus } from '../types';

const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
const QUOTE_STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'declined', 'expired'];

// A partial payment doesn't change the invoice's underlying status (it stays
// "sent" until fully covered -- see InvoicesService.applyPayment()) -- this
// is purely a derived display badge layered alongside the real status, same
// idea as the "Read" badge next to it below.
function isPartiallyPaid(inv: Invoice): boolean {
  const paid = inv.amountPaid ?? 0;
  return inv.status === 'sent' && paid > 0 && paid < inv.total;
}

type Tab = 'invoices' | 'quotes';

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
  const [recordingPayment, setRecordingPayment] = useState<Invoice | null>(null);
  const [requestingDeposit, setRequestingDeposit] = useState<Invoice | null>(null);
  const [viewing, setViewing] = useState<Invoice | null>(null);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [activityVersion, setActivityVersion] = useState(0);

  function refresh() {
    api.listInvoices().then(setInvoices).catch((err) => setError(err.message));
    setActivityVersion((v) => v + 1);
  }
  useEffect(refresh, []);

  // Shows the invoice instantly as HTML (InvoiceHtmlView, below) once
  // businessInfo is available -- doesn't wait on the PDF, which is only
  // needed for the Download link and generates in the background.
  async function handleViewPdf(inv: Invoice) {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setViewing(inv);
    setPdfLoading(true);
    setPdfError(null);
    try {
      const info = businessInfo ?? (await api.getBusinessInfo());
      if (!businessInfo) setBusinessInfo(info);
      const doc = await buildInvoicePdf(inv, 'invoice', info);
      setPdfUrl(URL.createObjectURL(doc.output('blob')));
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to prepare the PDF download');
    } finally {
      setPdfLoading(false);
    }
  }

  function closePdf() {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setPdfError(null);
    setViewing(null);
  }

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

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div className="card" style={{ padding: 0, flex: 1, minWidth: 0 }}>
        {!invoices || invoices.length === 0 ? (
          <div className="empty-state">{invoices === null ? 'Loading…' : 'No invoices yet.'}</div>
        ) : viewing ? (
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)' }}>
              {invoices.map((inv) => (
                <div
                  key={inv._id}
                  onClick={() => inv._id !== viewing._id && handleViewPdf(inv)}
                  style={{
                    cursor: 'pointer',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    background: inv._id === viewing._id ? 'var(--sage)' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{inv.invoiceNumber}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{customerLabel(inv.customer)}</div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <ActionsMenu
                        items={[
                          { label: 'View', onClick: () => handleViewPdf(inv) },
                          { label: 'Edit', onClick: () => setEditing(inv) },
                          {
                            label: sendingId === inv._id ? 'Sending…' : 'Send',
                            onClick: () => setSendPreview(inv),
                            disabled: sendingId === inv._id,
                          },
                          { label: 'Payments', onClick: () => setRecordingPayment(inv) },
                          { label: 'Request Deposit', onClick: () => setRequestingDeposit(inv) },
                          { label: 'Delete', onClick: () => setDeleting(inv), danger: true, dividerBefore: true },
                        ]}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <span className={`badge badge-${inv.status}`}>{inv.status}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      £{(inv.total - (inv.amountPaid ?? 0)).toFixed(2)}
                    </span>
                  </div>
                  {isPartiallyPaid(inv) && (
                    <span className="badge badge-partially_paid" style={{ marginTop: 4 }}>
                      Partially Paid
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div style={{ flex: 1, minWidth: 0, padding: '20px 24px', maxHeight: '85vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, maxWidth: 900, margin: '0 auto 16px' }}>
                <h3 style={{ margin: 0 }}>Invoice {viewing.invoiceNumber}</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  {pdfUrl ? (
                    <a href={pdfUrl} download={`${viewing.invoiceNumber}.pdf`} className="btn btn-secondary btn-sm">
                      Download
                    </a>
                  ) : (
                    <button className="btn btn-secondary btn-sm" disabled>
                      {pdfLoading ? 'Preparing…' : 'Download'}
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={closePdf}>
                    Close
                  </button>
                </div>
              </div>
              {pdfError && <div className="error-banner" style={{ maxWidth: 900, margin: '0 auto 16px' }}>{pdfError}</div>}
              {businessInfo ? (
                <InvoiceHtmlView invoice={viewing} businessInfo={businessInfo} />
              ) : (
                <div className="empty-state">Loading…</div>
              )}
            </div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Customer</th>
                <th>Invoice Date</th>
                <th>Due Date</th>
                <th>Invoice Total</th>
                <th>Amount Paid</th>
                <th>Remaining Balance</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv._id} onClick={() => handleViewPdf(inv)} style={{ cursor: 'pointer' }}>
                  <td>{inv.invoiceNumber}</td>
                  <td>{customerLabel(inv.customer)}</td>
                  <td>{new Date(inv.issueDate).toLocaleDateString('en-GB')}</td>
                  <td>{new Date(inv.dueDate).toLocaleDateString('en-GB')}</td>
                  <td>£{inv.total.toFixed(2)}</td>
                  <td>£{(inv.amountPaid ?? 0).toFixed(2)}</td>
                  <td>£{(inv.total - (inv.amountPaid ?? 0)).toFixed(2)}</td>
                  <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span className={`badge badge-${inv.status}`}>
                        <select value={inv.status} onChange={(e) => handleStatusChange(inv._id, e.target.value)}>
                          {INVOICE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </span>
                      {inv.status !== 'draft' && (
                        <span
                          style={{ color: inv.openedAt ? 'var(--brand-green)' : 'var(--muted)', display: 'inline-flex' }}
                          title={inv.openedAt ? `Opened ${new Date(inv.openedAt).toLocaleString()}` : 'Sent, not yet opened'}
                        >
                          {inv.openedAt ? <MailOpenIcon /> : <MailIcon />}
                        </span>
                      )}
                    </span>
                    {isPartiallyPaid(inv) && <span className="badge badge-partially_paid">Partially Paid</span>}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <ActionsMenu
                      items={[
                        { label: 'View', onClick: () => handleViewPdf(inv) },
                        { label: 'Edit', onClick: () => setEditing(inv) },
                        {
                          label: sendingId === inv._id ? 'Sending…' : 'Send',
                          onClick: () => setSendPreview(inv),
                          disabled: sendingId === inv._id,
                        },
                        { label: 'Payments', onClick: () => setRecordingPayment(inv) },
                        { label: 'Request Deposit', onClick: () => setRequestingDeposit(inv) },
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
        {viewing && (
          <div style={{ width: 480, flexShrink: 0 }}>
            <InvoiceActivityPanel key={viewing._id} invoiceId={viewing._id} refreshToken={activityVersion} />
          </div>
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

      {recordingPayment && (
        <RecordPaymentModal
          invoice={recordingPayment}
          onClose={() => setRecordingPayment(null)}
          onSaved={() => {
            setRecordingPayment(null);
            refresh();
          }}
        />
      )}

      {requestingDeposit && (
        <RequestDepositModal
          invoice={requestingDeposit}
          onClose={() => setRequestingDeposit(null)}
          onSent={() => {
            setRequestingDeposit(null);
            refresh();
          }}
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
  const [viewing, setViewing] = useState<Quote | null>(null);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  function refresh() {
    api.listQuotes().then(setQuotes).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  async function handleViewPdf(q: Quote) {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setViewing(q);
    setPdfLoading(true);
    setPdfError(null);
    try {
      const info = businessInfo ?? (await api.getBusinessInfo());
      if (!businessInfo) setBusinessInfo(info);
      const doc = await buildInvoicePdf(q, 'quote', info);
      setPdfUrl(URL.createObjectURL(doc.output('blob')));
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to prepare the PDF download');
    } finally {
      setPdfLoading(false);
    }
  }

  function closePdf() {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setPdfError(null);
    setViewing(null);
  }

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
        ) : viewing ? (
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <div style={{ width: 420, flexShrink: 0, borderRight: '1px solid var(--border)' }}>
              <table>
                <tbody>
                  {quotes.map((q) => (
                    <tr
                      key={q._id}
                      onClick={() => q._id !== viewing._id && handleViewPdf(q)}
                      style={{
                        cursor: 'pointer',
                        background: q._id === viewing._id ? 'var(--sage)' : undefined,
                      }}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 600 }}>{q.quoteNumber}</div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                          {customerLabel(q.customer, q.manualCustomerName)}
                          {!q.customer && q.manualCustomerName && (
                            <span className="badge badge-partially_paid" style={{ marginLeft: 6 }}>
                              Manual
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span className={`badge badge-${q.status}`}>{q.status}</span>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>£{q.total.toFixed(2)}</div>
                      </td>
                      <td onClick={(e) => e.stopPropagation()} style={{ padding: '10px 8px 10px 0' }}>
                        <ActionsMenu
                          items={[
                            { label: 'View', onClick: () => handleViewPdf(q) },
                            { label: 'Edit', onClick: () => setEditing(q) },
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
            </div>

            <div style={{ flex: 1, minWidth: 0, padding: '20px 24px', maxHeight: '85vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, maxWidth: 900, margin: '0 auto 16px' }}>
                <h3 style={{ margin: 0 }}>Quote {viewing.quoteNumber}</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  {pdfUrl ? (
                    <a href={pdfUrl} download={`${viewing.quoteNumber}.pdf`} className="btn btn-secondary btn-sm">
                      Download
                    </a>
                  ) : (
                    <button className="btn btn-secondary btn-sm" disabled>
                      {pdfLoading ? 'Preparing…' : 'Download'}
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={closePdf}>
                    Close
                  </button>
                </div>
              </div>
              {pdfError && <div className="error-banner" style={{ maxWidth: 900, margin: '0 auto 16px' }}>{pdfError}</div>}
              {businessInfo ? (
                <QuoteHtmlView quote={viewing} businessInfo={businessInfo} />
              ) : (
                <div className="empty-state">Loading…</div>
              )}
            </div>
          </div>
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
                <tr key={q._id} onClick={() => handleViewPdf(q)} style={{ cursor: 'pointer' }}>
                  <td>{q.quoteNumber}</td>
                  <td>
                    {customerLabel(q.customer, q.manualCustomerName)}
                    {!q.customer && q.manualCustomerName && (
                      <span className="badge badge-partially_paid" style={{ marginLeft: 6 }}>
                        Manual
                      </span>
                    )}
                  </td>
                  <td>£{q.total.toFixed(2)}</td>
                  <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span className={`badge badge-${q.status}`}>
                        <select value={q.status} onChange={(e) => handleStatusChange(q._id, e.target.value)}>
                          {QUOTE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </span>
                      {q.status !== 'draft' && (
                        <span
                          style={{ color: q.openedAt ? 'var(--brand-green)' : 'var(--muted)', display: 'inline-flex' }}
                          title={q.openedAt ? `Opened ${new Date(q.openedAt).toLocaleString()}` : 'Sent, not yet opened'}
                        >
                          {q.openedAt ? <MailOpenIcon /> : <MailIcon />}
                        </span>
                      )}
                    </span>
                  </td>
                  <td>{new Date(q.validUntil).toLocaleDateString('en-GB')}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <ActionsMenu
                      items={[
                        { label: 'View', onClick: () => handleViewPdf(q) },
                        { label: 'Edit', onClick: () => setEditing(q) },
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

