import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from '../components/Modal';
import type { Customer, Invoice, InvoiceStatus, LineItem, Quote, QuoteStatus } from '../types';

const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
const QUOTE_STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'declined', 'expired'];

type Tab = 'invoices' | 'quotes';

function customerLabel(customer: Invoice['customer'] | Quote['customer']): string {
  return typeof customer === 'string' ? customer : customer.name;
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

  function refresh() {
    api.listInvoices().then(setInvoices).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  async function handleStatusChange(id: string, status: string) {
    await api.updateInvoiceStatus(id, status);
    refresh();
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
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv._id}>
                  <td>{inv.invoiceNumber}</td>
                  <td>{customerLabel(inv.customer)}</td>
                  <td>£{inv.total.toFixed(2)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select value={inv.status} onChange={(e) => handleStatusChange(inv._id, e.target.value)}>
                      {INVOICE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{new Date(inv.dueDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <NewInvoiceModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function QuotesTab() {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  function refresh() {
    api.listQuotes().then(setQuotes).catch((err) => setError(err.message));
  }
  useEffect(refresh, []);

  async function handleStatusChange(id: string, status: string) {
    await api.updateQuoteStatus(id, status);
    refresh();
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
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q._id}>
                  <td>{q.quoteNumber}</td>
                  <td>{customerLabel(q.customer)}</td>
                  <td>£{q.total.toFixed(2)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <select value={q.status} onChange={(e) => handleStatusChange(q._id, e.target.value)}>
                      {QUOTE_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{new Date(q.validUntil).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <NewQuoteModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function LineItemsField({
  lineItems,
  onChange,
}: {
  lineItems: LineItem[];
  onChange: (items: LineItem[]) => void;
}) {
  function updateItem(i: number, patch: Partial<LineItem>) {
    onChange(lineItems.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }
  function addItem() {
    onChange([...lineItems, { description: '', quantity: 1, unitPrice: 0 }]);
  }
  function removeItem(i: number) {
    onChange(lineItems.filter((_, idx) => idx !== i));
  }

  return (
    <div className="field">
      <label>Line items</label>
      {lineItems.map((item, i) => (
        <div className="line-item-row" key={i}>
          <input
            type="text"
            placeholder="Description"
            value={item.description}
            onChange={(e) => updateItem(i, { description: e.target.value })}
            required
          />
          <input
            type="number"
            min="0"
            step="1"
            value={item.quantity}
            onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
            required
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={item.unitPrice}
            onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
            required
          />
          <button type="button" className="remove-btn" onClick={() => removeItem(i)} disabled={lineItems.length === 1}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn-link" onClick={addItem}>
        + Add line item
      </button>
    </div>
  );
}

function NewInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [tax, setTax] = useState('0');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listCustomers().then(setCustomers).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      setError('Choose a customer.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createInvoice({
        customer: customerId,
        lineItems,
        tax: Number(tax) || 0,
        issueDate,
        dueDate,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New invoice" onClose={onClose} wide>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
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
        <LineItemsField lineItems={lineItems} onChange={setLineItems} />
        <div className="field-row">
          <div className="field">
            <label>Tax (£)</label>
            <input type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Issue date</label>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
          </div>
          <div className="field">
            <label>Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create invoice'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NewQuoteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [tax, setTax] = useState('0');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [validUntil, setValidUntil] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listCustomers().then(setCustomers).catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) {
      setError('Choose a customer.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createQuote({
        customer: customerId,
        lineItems,
        tax: Number(tax) || 0,
        issueDate,
        validUntil,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create quote');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="New Quote" onClose={onClose} wide>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label>Customer</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
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
        <LineItemsField lineItems={lineItems} onChange={setLineItems} />
        <div className="field-row">
          <div className="field">
            <label>Tax (£)</label>
            <input type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Issue date</label>
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
          </div>
          <div className="field">
            <label>Valid until</label>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} required />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create quote'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
