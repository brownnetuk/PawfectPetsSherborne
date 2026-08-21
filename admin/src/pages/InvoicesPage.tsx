import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from '../components/Modal';
import { ChevronDownIcon, PencilIcon, TrashIcon } from '../components/icons';
import type { Customer, Invoice, InvoiceStatus, InvoiceTerm, LineItem, Product, Quote, QuoteStatus } from '../types';

const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
const QUOTE_STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'declined', 'expired'];

type Tab = 'invoices' | 'quotes';

function customerLabel(customer: Invoice['customer'] | Quote['customer']): string {
  return typeof customer === 'string' ? customer : customer.name;
}

function customerId(customer: Invoice['customer'] | Quote['customer']): string {
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

  function refresh() {
    api.listInvoices().then(setInvoices).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  async function handleStatusChange(id: string, status: string) {
    await api.updateInvoiceStatus(id, status);
    refresh();
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
                  </td>
                  <td>{new Date(inv.dueDate).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="icon-btn" title="Edit" onClick={() => setEditing(inv)}>
                        <PencilIcon />
                      </button>
                      <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => setDeleting(inv)}>
                        <TrashIcon />
                      </button>
                    </div>
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

  function refresh() {
    api.listQuotes().then(setQuotes).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  async function handleStatusChange(id: string, status: string) {
    await api.updateQuoteStatus(id, status);
    refresh();
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
                  </td>
                  <td>{new Date(q.validUntil).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button className="icon-btn" title="Edit" onClick={() => setEditing(q)}>
                        <PencilIcon />
                      </button>
                      <button className="icon-btn icon-btn-danger" title="Delete" onClick={() => setDeleting(q)}>
                        <TrashIcon />
                      </button>
                    </div>
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
                <div className="item-picker">
                  <input
                    type="text"
                    placeholder="Type or click to select an item"
                    value={item.description}
                    onChange={(e) => handleDescriptionChange(i, e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="item-picker-btn"
                    onClick={() => setPickerIndex(i)}
                    aria-label="Choose from products"
                  >
                    <ChevronDownIcon />
                  </button>
                </div>
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
  const q = search.toLowerCase();
  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q),
  );

  function handleSelect(product: Product) {
    onSelect(product);
    onClose();
  }

  return (
    <Modal title="Select an Item" onClose={onClose} wide>
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
              <dd>{selectedCustomer.telephone || selectedCustomer.mobile || '—'}</dd>
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
