import { useEffect, useState } from 'react';
import * as api from '../api/client';
import Modal from '../components/Modal';
import type { Customer, Invoice, InvoiceStatus } from '../types';

const STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

function customerLabel(customer: Invoice['customer']): string {
  return typeof customer === 'string' ? customer : customer.name;
}

export default function InvoicesPage() {
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
      <div className="page-header">
        <h1>Invoices</h1>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>
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
                      {STATUSES.map((s) => (
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

function NewInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [lineItems, setLineItems] = useState([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [tax, setTax] = useState('0');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listCustomers().then(setCustomers).catch(() => {});
  }, []);

  function updateItem(i: number, patch: Partial<(typeof lineItems)[number]>) {
    setLineItems((items) => items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }
  function addItem() {
    setLineItems((items) => [...items, { description: '', quantity: 1, unitPrice: 0 }]);
  }
  function removeItem(i: number) {
    setLineItems((items) => items.filter((_, idx) => idx !== i));
  }

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
