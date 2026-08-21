import { useEffect, useRef, useState } from 'react';
import * as api from '../api/client';
import Modal from '../components/Modal';
import { ChevronDownIcon } from '../components/icons';
import { buildItemsTableHtml, interpolateBody, interpolateSubject } from '../utils/emailTemplate';
import type {
  BusinessInfo,
  Customer,
  Invoice,
  InvoiceStatus,
  InvoiceTerm,
  LineItem,
  Product,
  Quote,
  QuoteStatus,
} from '../types';

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

function customerId(customer: Invoice['customer'] | Quote['customer']): string {
  if (!customer) return '';
  return typeof customer === 'string' ? customer : customer._id;
}

// Date helpers work in local calendar-date components throughout (never
// Date-to-ISOString) so a plain "YYYY-MM-DD" round-trips without drifting a
// day from timezone conversion.
function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// "Working day" only accounts for weekends, not bank holidays.
function lastWorkingDayOfMonth(date: Date): Date {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const dow = lastDay.getDay(); // 0 = Sunday, 6 = Saturday
  if (dow === 0) lastDay.setDate(lastDay.getDate() - 2);
  else if (dow === 6) lastDay.setDate(lastDay.getDate() - 1);
  return lastDay;
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Due date/valid-until date implied by a payment term, or null if the term doesn't set one. */
function calculateDueDate(issueDateStr: string, term: InvoiceTerm | undefined): string | null {
  if (!issueDateStr || !term) return null;
  const issue = parseYmd(issueDateStr);
  if (term.endOfMonth) return formatYmd(lastWorkingDayOfMonth(issue));
  if (typeof term.plusDays === 'number') return formatYmd(addDays(issue, term.plusDays));
  return null;
}

function lineItemAmount(item: LineItem): number {
  return item.quantity * item.unitPrice * (1 - (item.discountPercent ?? 0) / 100);
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

function ActionsMenu({
  onEdit,
  onSend,
  onDelete,
  sending,
}: {
  onEdit: () => void;
  onSend: () => void;
  onDelete: () => void;
  sending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function choose(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <div className="actions-menu" ref={ref}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen((o) => !o)}>
        Actions <ChevronDownIcon />
      </button>
      {open && (
        <div className="actions-menu-list">
          <button type="button" onClick={() => choose(onEdit)}>
            View / Edit
          </button>
          <button type="button" onClick={() => choose(onSend)} disabled={sending}>
            {sending ? 'Sending…' : 'Send'}
          </button>
          <div className="actions-menu-divider" />
          <button type="button" className="actions-menu-danger" onClick={() => choose(onDelete)}>
            Delete
          </button>
        </div>
      )}
    </div>
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
                      onEdit={() => setEditing(inv)}
                      onSend={() => setSendPreview(inv)}
                      onDelete={() => setDeleting(inv)}
                      sending={sendingId === inv._id}
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
                      onEdit={() => setEditing(q)}
                      onSend={() => setSendPreview(q)}
                      onDelete={() => setDeleting(q)}
                      sending={sendingId === q._id}
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

function ItemDescriptionInput({
  value,
  products,
  onChange,
  onSelectProduct,
  onOpenPicker,
}: {
  value: string;
  products: Product[];
  onChange: (value: string) => void;
  onSelectProduct: (product: Product) => void;
  onOpenPicker: () => void;
}) {
  const [open, setOpen] = useState(false);

  const q = value.trim().toLowerCase();
  const suggestions = q ? products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : [];

  function selectSuggestion(product: Product) {
    onSelectProduct(product);
    setOpen(false);
  }

  return (
    <div className="item-picker">
      <input
        type="text"
        placeholder="Type or click to select an item"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (q) setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        required
      />
      <button type="button" className="item-picker-btn" onClick={onOpenPicker} aria-label="Choose from products">
        <ChevronDownIcon />
      </button>
      {open && suggestions.length > 0 && (
        <div className="item-suggestions">
          {suggestions.map((p) => (
            <div
              key={p._id}
              className="item-suggestion-row"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selectSuggestion(p)}
            >
              <span className="item-suggestion-name">{p.name}</span>
              <span className="item-suggestion-price">£{p.price.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemTable({
  lineItems,
  products,
  onChange,
}: {
  lineItems: LineItem[];
  products: Product[];
  onChange: (items: LineItem[]) => void;
}) {
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);

  function updateItem(i: number, patch: Partial<LineItem>) {
    onChange(lineItems.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }
  function selectProduct(i: number, product: Product) {
    updateItem(i, { description: product.name, unitPrice: product.price });
  }
  function handleDescriptionChange(i: number, value: string) {
    const product = products.find((p) => p.name === value);
    updateItem(i, product ? { description: value, unitPrice: product.price } : { description: value });
  }
  function addItem() {
    onChange([...lineItems, { description: '', quantity: 1, unitPrice: 0, discountPercent: 0 }]);
  }
  function removeItem(i: number) {
    onChange(lineItems.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <table className="item-table">
        <thead>
          <tr>
            <th>Item Details</th>
            <th style={{ width: 80 }}>Quantity</th>
            <th style={{ width: 100 }}>Rate (£)</th>
            <th style={{ width: 100 }}>Discount %</th>
            <th style={{ width: 100 }}>Amount</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item, i) => (
            <tr key={i}>
              <td>
                <ItemDescriptionInput
                  value={item.description}
                  products={products}
                  onChange={(value) => handleDescriptionChange(i, value)}
                  onSelectProduct={(product) => selectProduct(i, product)}
                  onOpenPicker={() => setPickerIndex(i)}
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={item.quantity}
                  onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                  style={{ width: '100%' }}
                  required
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
                  style={{ width: '100%' }}
                  required
                />
              </td>
              <td>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={item.discountPercent ?? 0}
                  onChange={(e) => updateItem(i, { discountPercent: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </td>
              <td>£{lineItemAmount(item).toFixed(2)}</td>
              <td>
                <button
                  type="button"
                  className="remove-btn"
                  onClick={() => removeItem(i)}
                  disabled={lineItems.length === 1}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn-link" onClick={addItem} style={{ marginTop: 8 }}>
        + Add New Row
      </button>
      {pickerIndex !== null && (
        <ProductPickerModal
          products={products}
          onClose={() => setPickerIndex(null)}
          onSelect={(product) => selectProduct(pickerIndex, product)}
        />
      )}
    </div>
  );
}

function ProductPickerModal({
  products,
  onClose,
  onSelect,
}: {
  products: Product[];
  onClose: () => void;
  onSelect: (product: Product) => void;
}) {
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const q = search.toLowerCase();
  const filtered = products
    .filter((p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q))
    .sort((a, b) => (sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));

  function handleSelect(product: Product) {
    onSelect(product);
    onClose();
  }

  return (
    <Modal
      title="Select an Item"
      onClose={onClose}
      wide
      headerActions={
        <button
          type="button"
          className="sort-toggle-btn"
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        >
          {sortDir === 'asc' ? 'A → Z' : 'Z → A'}
        </button>
      }
    >
      <div className="field">
        <input
          type="text"
          placeholder="Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>
      <div className="card" style={{ padding: 0, maxHeight: 360, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">{products.length === 0 ? 'No products yet.' : 'No products found.'}</div>
        ) : (
          filtered.map((p) => (
            <div key={p._id} className="product-picker-row" onClick={() => handleSelect(p)}>
              <div className="product-picker-info">
                <div className="product-picker-name">{p.name}</div>
                {p.description && <div className="product-picker-desc">{p.description}</div>}
              </div>
              <div className="product-picker-price">£{p.price.toFixed(2)}</div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

function DocumentFormModal({
  kind,
  existing,
  onClose,
  onSaved,
}: {
  kind: 'invoice' | 'quote';
  existing: Invoice | Quote | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [terms, setTerms] = useState<InvoiceTerm[]>([]);

  const [custId, setCustId] = useState(existing ? customerId(existing.customer) : '');
  const [lineItems, setLineItems] = useState<LineItem[]>(
    existing ? existing.lineItems.map((li) => ({ ...li })) : [{ description: '', quantity: 1, unitPrice: 0, discountPercent: 0 }],
  );
  const [issueDate, setIssueDate] = useState(
    existing ? existing.issueDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [dateValue, setDateValue] = useState(
    existing ? ('dueDate' in existing ? existing.dueDate : existing.validUntil).slice(0, 10) : '',
  );
  const [subject, setSubject] = useState(existing?.subject ?? '');
  const [termId, setTermId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listCustomers().then(setCustomers).catch(() => {});
    api.listProducts().then(setProducts).catch(() => {});
    api.listInvoiceTerms().then((loaded) => {
      setTerms(loaded);
      if (existing?.paymentTerms) {
        const match = loaded.find((t) => t.text === existing.paymentTerms);
        if (match) setTermId(match._id);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-suggests the due date/valid-until date when staff explicitly change the
  // term or issue date -- wired to these onChange handlers (not a reactive
  // effect) so that loading an existing document's term/date on mount never
  // silently overwrites its already-saved date.
  function handleTermChange(id: string) {
    setTermId(id);
    const computed = calculateDueDate(issueDate, terms.find((t) => t._id === id));
    if (computed) setDateValue(computed);
  }
  function handleIssueDateChange(value: string) {
    setIssueDate(value);
    const computed = calculateDueDate(value, terms.find((t) => t._id === termId));
    if (computed) setDateValue(computed);
  }

  const selectedCustomer = customers.find((c) => c._id === custId);
  const subtotal = lineItems.reduce((sum, item) => sum + lineItemAmount(item), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!custId) {
      setError('Choose a customer.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const paymentTerms = terms.find((t) => t._id === termId)?.text;
      if (kind === 'invoice') {
        const payload = {
          customer: custId,
          lineItems,
          issueDate,
          dueDate: dateValue,
          paymentTerms,
          subject: subject || undefined,
        };
        if (existing) {
          await api.updateInvoice(existing._id, payload);
        } else {
          await api.createInvoice(payload);
        }
      } else {
        const payload = {
          customer: custId,
          lineItems,
          issueDate,
          validUntil: dateValue,
          paymentTerms,
          subject: subject || undefined,
        };
        if (existing) {
          await api.updateQuote(existing._id, payload);
        } else {
          await api.createQuote(payload);
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to save ${kind}`);
    } finally {
      setSubmitting(false);
    }
  }

  const isInvoice = kind === 'invoice';
  const number = existing ? (isInvoice ? (existing as Invoice).invoiceNumber : (existing as Quote).quoteNumber) : null;
  const title = `${existing ? 'Edit' : 'New'} ${isInvoice ? 'Invoice' : 'Quote'}`;
  const dateLabel = isInvoice ? 'Due date' : 'Valid until';

  return (
    <Modal title={title} onClose={onClose} xl>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="section-title">Customer</div>
          <div className="field">
            <label>Customer</label>
            <select value={custId} onChange={(e) => setCustId(e.target.value)} required>
              <option value="" disabled>
                Select a customer…
              </option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {selectedCustomer && (
            <dl className="kv-grid">
              <dt>Address</dt>
              <dd>{selectedCustomer.address || '—'}</dd>
              <dt>Phone</dt>
              <dd>{selectedCustomer.phoneNumber || '—'}</dd>
              <dt>Email</dt>
              <dd>{selectedCustomer.email || '—'}</dd>
            </dl>
          )}
        </div>

        <div className="card">
          <div className="section-title">{isInvoice ? 'Invoice Details' : 'Quote Details'}</div>
          {number && (
            <div className="field">
              <label>{isInvoice ? 'Invoice #' : 'Quote #'}</label>
              <input type="text" value={number} disabled />
            </div>
          )}
          <div className="field-row">
            <div className="field">
              <label>Issue date</label>
              <input type="date" value={issueDate} onChange={(e) => handleIssueDateChange(e.target.value)} required />
            </div>
            <div className="field">
              <label>Terms</label>
              <select value={termId} onChange={(e) => handleTermChange(e.target.value)}>
                <option value="">None</option>
                {terms.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.text}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{dateLabel}</label>
              <input type="date" value={dateValue} onChange={(e) => setDateValue(e.target.value)} required />
            </div>
          </div>
          <div className="field">
            <label>Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={`Let your customer know what this ${kind} is for`}
            />
          </div>
        </div>

        <div className="card">
          <div className="section-title">Item Table</div>
          <ItemTable lineItems={lineItems} products={products} onChange={setLineItems} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <div style={{ width: 260 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '10px 0',
                  fontWeight: 700,
                  fontSize: '1.05rem',
                }}
              >
                <span>Total (£)</span>
                <span>£{subtotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : existing ? 'Save changes' : `Create ${kind}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
