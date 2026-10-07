import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import SortableTh from '../components/SortableTh';
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
type SortDir = 'asc' | 'desc';

// Strings compare naturally (so INV-10 sorts after INV-9), numbers
// numerically -- dates are passed in as timestamps.
function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en-GB', { numeric: true, sensitivity: 'base' });
}

// Shared sort state for both tabs. Starts with no column active so the list
// keeps the server's newest-first order until a header is clicked.
function useSort<K extends string>() {
  const [sortKey, setSortKey] = useState<K | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  function toggleSort(key: K) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }
  return { sortKey, sortDir, toggleSort };
}

function sortRows<T, K extends string>(rows: T[], key: K | null, dir: SortDir, value: (row: T, key: K) => string | number): T[] {
  if (!key) return rows;
  return [...rows].sort((a, b) => {
    const cmp = compareValues(value(a, key), value(b, key));
    return dir === 'asc' ? cmp : -cmp;
  });
}

// "From"/"To" date inputs give YYYY-MM-DD; compare on the local calendar day
// so an invoice dated on the "To" day itself is still included.
function inDateRange(iso: string, from: string, to: string): boolean {
  const d = new Date(iso);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

const filterFieldStyle = { marginBottom: 0 } as const;

type Filters = { search: string; status: string; from: string; to: string };
const EMPTY_FILTERS: Filters = { search: '', status: '', from: '', to: '' };

// Search / status / date-range row shown above each tab's table.
function FilterBar({
  filters,
  onChange,
  searchPlaceholder,
  statusOptions,
  dateLabel,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  searchPlaceholder: string;
  statusOptions: { value: string; label: string }[];
  dateLabel: string;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const active = filters.search || filters.status || filters.from || filters.to;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
      <div className="field" style={{ ...filterFieldStyle, width: 240 }}>
        <label>Search</label>
        <input type="text" placeholder={searchPlaceholder} value={filters.search} onChange={(e) => set({ search: e.target.value })} />
      </div>
      <div className="field" style={{ ...filterFieldStyle, width: 170 }}>
        <label>Status</label>
        <select value={filters.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">All statuses</option>
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ ...filterFieldStyle, width: 150 }}>
        <label>{dateLabel} from</label>
        <input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
      </div>
      <div className="field" style={{ ...filterFieldStyle, width: 150 }}>
        <label>{dateLabel} to</label>
        <input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
      </div>
      {active && (
        <button className="btn btn-secondary btn-sm" style={{ marginBottom: 6 }} onClick={() => onChange(EMPTY_FILTERS)}>
          Clear filters
        </button>
      )}
    </div>
  );
}

const INVOICE_FILTER_STATUSES = [
  { value: 'outstanding', label: 'Outstanding (balance due)' },
  ...INVOICE_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
  { value: 'partially_paid', label: 'Partially paid' },
];
const QUOTE_FILTER_STATUSES = QUOTE_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));

type InvoiceSortKey = 'invoiceNumber' | 'customer' | 'issueDate' | 'dueDate' | 'total' | 'amountPaid' | 'balance' | 'status';
type QuoteSortKey = 'quoteNumber' | 'customer' | 'total' | 'status' | 'validUntil';

function invoiceSortValue(inv: Invoice, key: InvoiceSortKey): string | number {
  switch (key) {
    case 'invoiceNumber': return inv.invoiceNumber;
    case 'customer': return customerLabel(inv.customer);
    case 'issueDate': return new Date(inv.issueDate).getTime();
    case 'dueDate': return new Date(inv.dueDate).getTime();
    case 'total': return inv.total;
    case 'amountPaid': return inv.amountPaid ?? 0;
    case 'balance': return inv.total - (inv.amountPaid ?? 0);
    case 'status': return inv.status;
  }
}

function quoteSortValue(q: Quote, key: QuoteSortKey): string | number {
  switch (key) {
    case 'quoteNumber': return q.quoteNumber;
    case 'customer': return customerLabel(q.customer, q.manualCustomerName);
    case 'total': return q.total;
    case 'status': return q.status;
    case 'validUntil': return new Date(q.validUntil).getTime();
  }
}

function matchesInvoiceFilters(inv: Invoice, f: Filters): boolean {
  const q = f.search.trim().toLowerCase();
  if (q && !inv.invoiceNumber.toLowerCase().includes(q) && !customerLabel(inv.customer).toLowerCase().includes(q)) return false;
  if (f.status === 'outstanding') {
    if (inv.status === 'cancelled' || inv.status === 'draft' || inv.total - (inv.amountPaid ?? 0) <= 0) return false;
  } else if (f.status === 'partially_paid') {
    if (!isPartiallyPaid(inv)) return false;
  } else if (f.status && inv.status !== f.status) {
    return false;
  }
  return inDateRange(inv.issueDate, f.from, f.to);
}

function matchesQuoteFilters(q: Quote, f: Filters): boolean {
  const s = f.search.trim().toLowerCase();
  if (s && !q.quoteNumber.toLowerCase().includes(s) && !customerLabel(q.customer, q.manualCustomerName).toLowerCase().includes(s)) return false;
  if (f.status && q.status !== f.status) return false;
  return inDateRange(q.validUntil, f.from, f.to);
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
  const [recordingPayment, setRecordingPayment] = useState<Invoice | null>(null);
  const [requestingDeposit, setRequestingDeposit] = useState<Invoice | null>(null);
  const [viewing, setViewing] = useState<Invoice | null>(null);
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [activityVersion, setActivityVersion] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSendConfirm, setBulkSendConfirm] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { sortKey, sortDir, toggleSort } = useSort<InvoiceSortKey>();

  function refresh() {
    api.listInvoices().then(setInvoices).catch((err) => setError(err.message));
    setActivityVersion((v) => v + 1);
  }
  useEffect(refresh, []);

  // Lets another page (e.g. a boarding booking's Invoice card) link straight
  // to one invoice via ?view=<id> -- opens it the same way clicking its row
  // would, then drops the param so a refresh/back doesn't reopen it.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const viewId = searchParams.get('view');
    if (!viewId || !invoices) return;
    const target = invoices.find((inv) => inv._id === viewId);
    if (target) handleViewPdf(target);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('view');
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices]);

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

  const visibleInvoices = sortRows(
    (invoices ?? []).filter((inv) => matchesInvoiceFilters(inv, filters)),
    sortKey,
    sortDir,
    invoiceSortValue,
  );
  // Bulk actions only touch rows the current filters show, so a hidden
  // selection can't be sent or deleted by surprise.
  const selectedInvoices = visibleInvoices.filter((inv) => selectedIds.has(inv._id));
  const sortProps = { activeKey: sortKey, dir: sortDir, onSort: toggleSort };

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkSend() {
    setBulkBusy(true);
    setError(null);
    try {
      for (const inv of selectedInvoices) {
        await api.sendInvoiceEmail(inv._id);
      }
      setBulkSendConfirm(false);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed while sending invoices');
    } finally {
      setBulkBusy(false);
      refresh();
    }
  }

  async function handleBulkDelete() {
    setBulkBusy(true);
    setError(null);
    try {
      for (const inv of selectedInvoices) {
        await api.deleteInvoice(inv._id);
      }
      setBulkDeleteConfirm(false);
      setSelectedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed while deleting invoices');
    } finally {
      setBulkBusy(false);
      refresh();
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          searchPlaceholder="Invoice number or customer…"
          statusOptions={INVOICE_FILTER_STATUSES}
          dateLabel="Invoice date"
        />
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <ActionsMenu
            items={[
              {
                label: `Send${selectedInvoices.length > 0 ? ` (${selectedInvoices.length})` : ''}`,
                onClick: () => setBulkSendConfirm(true),
                disabled: selectedInvoices.length === 0 || bulkBusy,
              },
              {
                label: `Delete${selectedInvoices.length > 0 ? ` (${selectedInvoices.length})` : ''}`,
                onClick: () => setBulkDeleteConfirm(true),
                disabled: selectedInvoices.length === 0 || bulkBusy,
                danger: true,
                dividerBefore: true,
              },
            ]}
          />
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>
            New invoice
          </button>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div className="card" style={{ padding: 0, flex: 1, minWidth: 0 }}>
        {!invoices || invoices.length === 0 ? (
          <div className="empty-state">{invoices === null ? 'Loading…' : 'No invoices yet.'}</div>
        ) : viewing ? (
          <div style={{ display: 'flex', alignItems: 'stretch' }}>
            <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)' }}>
              {visibleInvoices.map((inv) => (
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
                <th style={{ width: 34 }}>
                  <input
                    type="checkbox"
                    checked={visibleInvoices.length > 0 && selectedInvoices.length === visibleInvoices.length}
                    onChange={(e) => setSelectedIds(e.target.checked ? new Set(visibleInvoices.map((i) => i._id)) : new Set())}
                    aria-label="Select all invoices"
                  />
                </th>
                <SortableTh label="Invoice Number" sortKey="invoiceNumber" {...sortProps} />
                <SortableTh label="Customer" sortKey="customer" {...sortProps} />
                <SortableTh label="Invoice Date" sortKey="issueDate" {...sortProps} />
                <SortableTh label="Due Date" sortKey="dueDate" {...sortProps} />
                <SortableTh label="Invoice Total" sortKey="total" {...sortProps} />
                <SortableTh label="Amount Paid" sortKey="amountPaid" {...sortProps} />
                <SortableTh label="Remaining Balance" sortKey="balance" {...sortProps} />
                <SortableTh label="Status" sortKey="status" {...sortProps} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.length === 0 && (
                <tr>
                  <td colSpan={10} className="empty-state">
                    No invoices match these filters.
                  </td>
                </tr>
              )}
              {visibleInvoices.map((inv) => (
                <tr key={inv._id} onClick={() => handleViewPdf(inv)} style={{ cursor: 'pointer' }}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(inv._id)}
                      onChange={() => toggleSelected(inv._id)}
                      aria-label={`Select invoice ${inv.invoiceNumber}`}
                    />
                  </td>
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

      {bulkSendConfirm && (
        <Modal title={`Send ${selectedInvoices.length} invoice${selectedInvoices.length === 1 ? '' : 's'}?`} onClose={() => setBulkSendConfirm(false)}>
          <p>
            Each invoice is emailed to its customer:{' '}
            <strong>{selectedInvoices.map((inv) => inv.invoiceNumber).join(', ')}</strong>.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setBulkSendConfirm(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleBulkSend} disabled={bulkBusy}>
              {bulkBusy ? 'Sending…' : 'Send invoices'}
            </button>
          </div>
        </Modal>
      )}

      {bulkDeleteConfirm && (
        <Modal title={`Delete ${selectedInvoices.length} invoice${selectedInvoices.length === 1 ? '' : 's'}?`} onClose={() => setBulkDeleteConfirm(false)}>
          <p>
            This permanently deletes{' '}
            <strong>{selectedInvoices.map((inv) => inv.invoiceNumber).join(', ')}</strong>.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setBulkDeleteConfirm(false)}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={handleBulkDelete} disabled={bulkBusy}>
              {bulkBusy ? 'Deleting…' : 'Delete invoices'}
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
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const { sortKey, sortDir, toggleSort } = useSort<QuoteSortKey>();

  function refresh() {
    api.listQuotes().then(setQuotes).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  const visibleQuotes = sortRows(
    (quotes ?? []).filter((q) => matchesQuoteFilters(q, filters)),
    sortKey,
    sortDir,
    quoteSortValue,
  );
  const sortProps = { activeKey: sortKey, dir: sortDir, onSort: toggleSort };

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
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 12 }}>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          searchPlaceholder="Quote number or customer…"
          statusOptions={QUOTE_FILTER_STATUSES}
          dateLabel="Valid until"
        />
        <button className="btn btn-primary btn-sm" style={{ marginBottom: 6 }} onClick={() => setShowNew(true)}>
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
                  {visibleQuotes.map((q) => (
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
                <SortableTh label="Quote" sortKey="quoteNumber" {...sortProps} />
                <SortableTh label="Customer" sortKey="customer" {...sortProps} />
                <SortableTh label="Total" sortKey="total" {...sortProps} />
                <SortableTh label="Status" sortKey="status" {...sortProps} />
                <SortableTh label="Valid until" sortKey="validUntil" {...sortProps} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleQuotes.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    No quotes match these filters.
                  </td>
                </tr>
              )}
              {visibleQuotes.map((q) => (
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

