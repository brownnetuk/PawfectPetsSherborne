import { useEffect, useState } from 'react';
import * as api from '../api/client';
import ManualCustomerModal from './ManualCustomerModal';
import type { ManualCustomer } from './ManualCustomerModal';
import Modal from './Modal';
import ProductAvailabilityWarningModal from './ProductAvailabilityWarningModal';
import SendPreviewModal from './SendPreviewModal';
import { ChevronDownIcon } from './icons';
import { availabilityMismatch } from '../utils/productAvailability';
import { buildVisitPlan, parseYmd as parseVisitYmd } from '../utils/visitPlan';
import type { VisitCount } from '../utils/visitPlan';
import type { Animal, BankHoliday, Customer, Invoice, InvoiceTerm, LineItem, Product, Quote, VisitMapping } from '../types';

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

// A real (visually-hidden) checkbox under a custom sliding track/thumb, so
// it stays keyboard/screen-reader accessible while looking like an iOS-style
// toggle -- there's no shared toggle-switch component elsewhere yet.
function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <span style={{ position: 'relative', width: 36, height: 20, flexShrink: 0 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          style={{ position: 'absolute', inset: 0, opacity: 0, margin: 0, cursor: 'pointer' }}
        />
        <span
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 999,
            background: checked ? 'var(--brand-green)' : 'var(--border)',
            transition: 'background 0.15s ease',
            pointerEvents: 'none',
          }}
        />
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'white',
            transition: 'left 0.15s ease',
            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
          }}
        />
      </span>
      <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{label}</span>
    </label>
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
  issueDate,
  bankHolidays,
  onChange,
}: {
  lineItems: LineItem[];
  products: Product[];
  issueDate: Date;
  bankHolidays: BankHoliday[];
  onChange: (items: LineItem[]) => void;
}) {
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const [warning, setWarning] = useState<{ message: string; onConfirm: () => void } | null>(null);

  function updateItem(i: number, patch: Partial<LineItem>) {
    onChange(lineItems.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));
  }
  function applyProduct(i: number, product: Product) {
    updateItem(i, { description: product.name, unitPrice: product.price });
  }
  function selectProduct(i: number, product: Product) {
    const mismatch = availabilityMismatch(product, issueDate, bankHolidays);
    if (mismatch) {
      setWarning({ message: mismatch, onConfirm: () => applyProduct(i, product) });
      return;
    }
    applyProduct(i, product);
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
      {warning && (
        <ProductAvailabilityWarningModal
          message={warning.message}
          onCancel={() => setWarning(null)}
          onConfirm={() => {
            const { onConfirm } = warning;
            setWarning(null);
            onConfirm();
          }}
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

interface Props {
  kind: 'invoice' | 'quote';
  existing: Invoice | Quote | null;
  /** Pre-selects a customer (e.g. opened from that customer's own detail page) -- still editable. */
  presetCustomerId?: string;
  /** Quote-only: pre-fills the manual-customer name/email (e.g. opened from an enquiry) -- still editable. */
  presetManualCustomer?: ManualCustomer;
  onClose: () => void;
  onSaved: () => void;
}

export default function DocumentFormModal({ kind, existing, presetCustomerId, presetManualCustomer, onClose, onSaved }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [terms, setTerms] = useState<InvoiceTerm[]>([]);
  const [bankHolidays, setBankHolidays] = useState<BankHoliday[]>([]);
  const [visitMapping, setVisitMapping] = useState<VisitMapping | null>(null);
  // Purely a visual double-check that the right customer is selected -- these
  // pets are never sent on the invoice/quote itself (except as the Animals
  // checkboxes for the Visits section below, which only ever contributes
  // aggregated product/quantity line items, never the animals themselves).
  const [customerPets, setCustomerPets] = useState<Animal[]>([]);

  // Quote-only: lets staff populate the line items from a date range of
  // visits (same Settings > Bookings > Visits mapping the Bookings page's
  // New Booking modal uses) instead of typing them by hand.
  const [showVisits, setShowVisits] = useState(false);
  const [visitAnimalIds, setVisitAnimalIds] = useState<string[]>([]);
  const [visitsPerDay, setVisitsPerDay] = useState<VisitCount>('1');
  const [visitStartDate, setVisitStartDate] = useState('');
  const [visitsFirstDay, setVisitsFirstDay] = useState<VisitCount>('1');
  const [visitEndDate, setVisitEndDate] = useState('');
  const [visitsLastDay, setVisitsLastDay] = useState<VisitCount>('1');
  const [visitError, setVisitError] = useState<string | null>(null);
  const [visitSaved, setVisitSaved] = useState(false);

  const [custId, setCustId] = useState(existing ? customerId(existing.customer) : presetCustomerId ?? '');
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
  // Set once "Create and Send"/"Save and Send" has successfully saved the
  // document -- swaps this form out for the send-preview step rather than
  // closing outright, same review-before-send flow the standalone Send
  // action already uses.
  const [pendingSend, setPendingSend] = useState<Invoice | Quote | null>(null);
  const [showManualCustomer, setShowManualCustomer] = useState(false);
  // Quote-only: a placeholder name/email stored directly on the quote
  // instead of a real customer -- see ManualCustomerModal. Restored here when
  // editing a quote that hasn't been accepted yet (still has no real
  // customer, so customerId(existing.customer) is empty).
  const [manualCustomer, setManualCustomer] = useState<ManualCustomer | null>(() => {
    if (kind !== 'quote') return null;
    if (!existing) return presetManualCustomer ?? null;
    const q = existing as Quote;
    if (!customerId(existing.customer) && q.manualCustomerName && q.manualCustomerEmail) {
      return { name: q.manualCustomerName, email: q.manualCustomerEmail };
    }
    return null;
  });

  useEffect(() => {
    api.listCustomers().then(setCustomers).catch(() => {});
    api.listProducts().then(setProducts).catch(() => {});
    api.listBankHolidays().then(setBankHolidays).catch(() => {});
    api.getVisitMapping().then(setVisitMapping).catch(() => {});
    api.listInvoiceTerms().then((loaded) => {
      setTerms(loaded);
      if (existing?.paymentTerms) {
        const match = loaded.find((t) => t.text === existing.paymentTerms);
        if (match) setTermId(match._id);
      } else if (!existing) {
        const defaultTerm = loaded.find((t) => t.isDefault);
        if (defaultTerm) {
          setTermId(defaultTerm._id);
          const computed = calculateDueDate(issueDate, defaultTerm);
          if (computed) setDateValue(computed);
        }
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!custId) {
      setCustomerPets([]);
      return;
    }
    api.listAnimals(custId).then(setCustomerPets).catch(() => setCustomerPets([]));
  }, [custId]);

  // Invoices only, and only for a brand-new document (not `existing`, which
  // keeps whatever line items it already has) -- Settings > Customer
  // Defaults > Travel. A functional update plus the description check keeps
  // this idempotent, so switching the customer dropdown back and forth (or
  // this effect re-running for any other reason) never adds a duplicate.
  useEffect(() => {
    if (existing || kind !== 'invoice' || !custId || products.length === 0) return;
    const selected = customers.find((c) => c._id === custId);
    if (!selected?.travelChargeable || !selected.travelProduct) return;
    const travelProduct = products.find((p) => p._id === selected.travelProduct);
    if (!travelProduct) return;
    setLineItems((prev) =>
      prev.some((item) => item.description === travelProduct.name)
        ? prev
        : [...prev, { description: travelProduct.name, quantity: 1, unitPrice: travelProduct.price, discountPercent: 0 }],
    );
  }, [custId, products, customers, existing, kind]);

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

  function handleManualCustomerSet(customer: ManualCustomer) {
    setManualCustomer(customer);
    setCustId('');
    setShowManualCustomer(false);
  }

  function toggleVisitAnimal(id: string) {
    setVisitAnimalIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Computes the same day-by-day product plan New Booking uses, then
  // aggregates it (summed across every selected animal and day, by product)
  // into line items -- merged into whatever's already in the Item Table
  // rather than replacing it outright, so filled-in rows survive while a
  // still-blank starter row gets replaced.
  function handleSaveVisits() {
    setVisitError(null);
    setVisitSaved(false);
    if (visitAnimalIds.length === 0) {
      setVisitError('Choose at least one animal.');
      return;
    }
    if (!visitStartDate || !visitEndDate) {
      setVisitError('Choose a start and end date.');
      return;
    }
    const start = parseVisitYmd(visitStartDate);
    const end = parseVisitYmd(visitEndDate);
    if (end < start) {
      setVisitError('End date must be on or after the start date.');
      return;
    }
    if (!visitMapping) {
      setVisitError('Still loading the Visits configuration -- try again in a moment.');
      return;
    }

    const { plan, missing } = buildVisitPlan(start, end, visitsPerDay, visitsFirstDay, visitsLastDay, visitMapping, bankHolidays);
    if (missing.length > 0) {
      setVisitError(`No product is configured in Settings > Bookings > Visits for: ${missing.join(', ')}.`);
      return;
    }

    const byProduct = new Map<string, { name: string; price: number; quantity: number }>();
    for (const { productId } of plan) {
      const product = products.find((p) => p._id === productId);
      if (!product) continue;
      const existing = byProduct.get(productId);
      if (existing) existing.quantity += visitAnimalIds.length;
      else byProduct.set(productId, { name: product.name, price: product.price, quantity: visitAnimalIds.length });
    }

    setLineItems((prev) => {
      const kept = prev.filter((item) => item.description.trim() !== '');
      const merged = [...kept];
      for (const p of byProduct.values()) {
        const idx = merged.findIndex((m) => m.description === p.name);
        if (idx >= 0) merged[idx] = { ...merged[idx], quantity: merged[idx].quantity + p.quantity };
        else merged.push({ description: p.name, quantity: p.quantity, unitPrice: p.price, discountPercent: 0 });
      }
      return merged;
    });
    setVisitSaved(true);
  }

  const selectedCustomer = customers.find((c) => c._id === custId);
  const subtotal = lineItems.reduce((sum, item) => sum + lineItemAmount(item), 0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!custId && !manualCustomer) {
      setError(kind === 'quote' ? 'Choose a customer or add a manual customer.' : 'Choose a customer.');
      return;
    }
    // Both footer buttons are real type="submit" buttons (so the browser's
    // native required-field validation still runs for either) distinguished
    // by which one triggered this submit -- e.nativeEvent.submitter is the
    // standard way to tell them apart.
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const alsoSend = submitter?.value === 'send';
    setSubmitting(true);
    setError(null);
    try {
      const paymentTerms = terms.find((t) => t._id === termId)?.text;
      let saved: Invoice | Quote;
      if (kind === 'invoice') {
        const payload = {
          customer: custId,
          lineItems,
          issueDate,
          dueDate: dateValue,
          paymentTerms,
          subject: subject || undefined,
        };
        saved = existing ? await api.updateInvoice(existing._id, payload) : await api.createInvoice(payload);
      } else {
        const payload = {
          ...(manualCustomer
            ? { manualCustomerName: manualCustomer.name, manualCustomerEmail: manualCustomer.email }
            : { customer: custId }),
          lineItems,
          issueDate,
          validUntil: dateValue,
          paymentTerms,
          subject: subject || undefined,
        };
        saved = existing ? await api.updateQuote(existing._id, payload) : await api.createQuote(payload);
      }
      if (alsoSend) {
        // A freshly-created document comes back with `customer` as a bare
        // id, not populated (unlike update/list/findOne) -- substitute the
        // full customer we already have in hand so the send preview shows
        // their name instead of a raw id.
        setPendingSend(selectedCustomer ? { ...saved, customer: selectedCustomer } : saved);
      } else {
        onSaved();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to save ${kind}`);
    } finally {
      setSubmitting(false);
    }
  }

  // The document is already saved by the time this renders (handleSubmit's
  // "send" path only sets pendingSend after a successful save) -- so Cancel
  // here just skips the preview, it never discards anything. A failed send
  // (network blip etc.) leaves the document saved as a draft, resendable
  // later from the normal Send action; matches how that action already
  // behaves elsewhere (SendPreviewModal always closes after Send regardless
  // of outcome, with no dedicated failure state of its own).
  if (pendingSend) {
    return (
      <SendPreviewModal
        kind={kind}
        doc={pendingSend}
        onClose={onSaved}
        onConfirm={async () => {
          try {
            if (kind === 'invoice') await api.sendInvoiceEmail(pendingSend._id);
            else await api.sendQuoteEmail(pendingSend._id);
          } catch {
            // Swallowed deliberately -- see comment above.
          }
        }}
      />
    );
  }

  const isInvoice = kind === 'invoice';
  const number = existing ? (isInvoice ? (existing as Invoice).invoiceNumber : (existing as Quote).quoteNumber) : null;
  const title = `${existing ? 'Edit' : 'New'} ${isInvoice ? 'Invoice' : 'Quote'}`;
  const dateLabel = isInvoice ? 'Due date' : 'Valid until';

  return (
    <Modal title={title} onClose={onClose} xl>
      {error && <div className="error-banner">{error}</div>}
      {showManualCustomer && (
        <ManualCustomerModal onClose={() => setShowManualCustomer(false)} onSet={handleManualCustomerSet} />
      )}
      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="section-title">Customer</div>
          <div className="field">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <label style={{ margin: 0 }}>Customer</label>
              {kind === 'quote' && !manualCustomer && (
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={() => setShowManualCustomer(true)}
                >
                  Manual Customer
                </button>
              )}
              {kind === 'quote' && <ToggleSwitch checked={showVisits} onChange={setShowVisits} label="Visits" />}
            </div>
            {manualCustomer ? (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '10px 12px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{manualCustomer.name}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{manualCustomer.email}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
                    Manual customer -- a real record is created once this quote is accepted.
                  </div>
                </div>
                <button type="button" className="btn-link" onClick={() => setManualCustomer(null)}>
                  Remove
                </button>
              </div>
            ) : (
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
            )}
          </div>
          {selectedCustomer && !manualCustomer && (
            <dl className="kv-grid">
              <dt>Address</dt>
              <dd>{selectedCustomer.address || '—'}</dd>
              <dt>Phone</dt>
              <dd>{selectedCustomer.phoneNumber || '—'}</dd>
              <dt>Email</dt>
              <dd>{selectedCustomer.email || '—'}</dd>
              {customerPets.length > 0 && (
                <>
                  <dt>Pets</dt>
                  <dd>
                    {customerPets.map((pet) => (
                      <div key={pet._id}>{pet.name}</div>
                    ))}
                  </dd>
                </>
              )}
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

        {kind === 'quote' && showVisits && (
          <div className="card">
            <div className="section-title">Visits</div>
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
              Populates the line items below from a date range, using Settings &gt; Bookings &gt; Visits.
            </p>
            {visitError && <div className="error-banner">{visitError}</div>}
            <div className="field">
              <label>Animals</label>
              {!custId ? (
                <div className="field-hint" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  Select a customer first.
                </div>
              ) : customerPets.length === 0 ? (
                <div className="field-hint" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  This customer has no animals on file.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {customerPets.map((a) => (
                    <label key={a._id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        checked={visitAnimalIds.includes(a._id)}
                        onChange={() => toggleVisitAnimal(a._id)}
                      />
                      {a.name} ({a.species})
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>How Many Visits per Day</label>
              <select value={visitsPerDay} onChange={(e) => setVisitsPerDay(e.target.value as VisitCount)}>
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Start Date</label>
                <input type="date" value={visitStartDate} onChange={(e) => setVisitStartDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Visits on First Date</label>
                <select value={visitsFirstDay} onChange={(e) => setVisitsFirstDay(e.target.value as VisitCount)}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>End Date</label>
                <input type="date" value={visitEndDate} onChange={(e) => setVisitEndDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Visits on End Date</label>
                <select value={visitsLastDay} onChange={(e) => setVisitsLastDay(e.target.value as VisitCount)}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </div>
            </div>
            <div className="modal-actions" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
              <button type="button" className="btn btn-primary" onClick={handleSaveVisits}>
                Save
              </button>
              {visitSaved && (
                <span style={{ color: 'var(--brand-green)', fontSize: '0.85rem', fontWeight: 600 }}>
                  Added to the line items below.
                </span>
              )}
            </div>
          </div>
        )}

        <div className="card">
          <div className="section-title">Item Table</div>
          <ItemTable
            lineItems={lineItems}
            products={products}
            issueDate={parseYmd(issueDate)}
            bankHolidays={bankHolidays}
            onChange={setLineItems}
          />
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
          <button type="submit" name="action" value="draft" className="btn btn-secondary" disabled={submitting}>
            {submitting ? 'Saving…' : existing ? 'Save changes' : 'Save as Draft'}
          </button>
          <button type="submit" name="action" value="send" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : existing ? 'Save and Send' : 'Create and Send'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
