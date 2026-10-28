import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../api/client';
import DateInput from '../components/DateInput';
import { inDateRange } from '../components/DateRangeFilterBar';
import ExpensesByCategoryChart from '../components/ExpensesByCategoryChart';
import IncomeExpenseChart from '../components/IncomeExpenseChart';
import { invoiceBalanceDue } from '../components/OverduePaymentModal';
import { customerLabel } from '../components/SendPreviewModal';
import SortableTh from '../components/SortableTh';
import ViewExpenseModal from '../components/ViewExpenseModal';
import type { CreditNote, Expense, ExpenseCategoryTotal, IncomeExpenseMonth, Invoice, OtherIncome, Payment } from '../types';
import {
  REPORT_RANGE_LABELS,
  type ReportRangePreset,
  formatIsoDay,
  reportRange,
} from '../utils/reportDateRange';

type Tab = 'pl' | 'expensesByCategory' | 'incomeByCustomer' | 'income';

const TAB_LABELS: Record<Tab, string> = {
  pl: 'P/L',
  expensesByCategory: 'Expense Summary by Category',
  incomeByCustomer: 'Income Summary by Customer',
  income: 'Income',
};

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('pl');

  return (
    <div>
      <div className="page-header">
        <h1>Reports</h1>
      </div>

      <div className="tabs">
        {(['pl', 'expensesByCategory', 'incomeByCustomer', 'income'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'pl' && <ProfitAndLossReport />}
      {tab === 'expensesByCategory' && <ExpenseSummaryByCategoryReport />}
      {tab === 'incomeByCustomer' && <IncomeSummaryByCustomerReport />}
      {tab === 'income' && <InvoicesDueReport />}
    </div>
  );
}

function ProfitAndLossReport() {
  const [period, setPeriod] = useState(6);
  const [months, setMonths] = useState<IncomeExpenseMonth[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getIncomeExpenseReport(period)
      .then(setMonths)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the report'));
  }, [period]);

  const totalIncome = months?.reduce((sum, m) => sum + m.income, 0) ?? 0;
  const totalExpenses = months?.reduce((sum, m) => sum + m.expenses, 0) ?? 0;
  const totalNet = totalIncome - totalExpenses;

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Income vs Expenses</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
              Income is payments received net of any charges, minus credit notes issued.
            </p>
          </div>
          <select className="select-inline" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
            <option value={6}>Last 6 Months</option>
            <option value={12}>Last 12 Months</option>
          </select>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {months && <IncomeExpenseChart data={months} />}
        <div style={{ display: 'flex', gap: 24, marginTop: 10, fontWeight: 600 }}>
          <div>Income — £{totalIncome.toFixed(2)}</div>
          <div>Expenses — £{totalExpenses.toFixed(2)}</div>
          <div style={{ color: totalNet >= 0 ? 'var(--accent)' : 'var(--error)' }}>Net — £{totalNet.toFixed(2)}</div>
        </div>
      </div>

      {months && months.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Income</th>
                <th>Expenses</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  <td>£{m.income.toFixed(2)}</td>
                  <td>£{m.expenses.toFixed(2)}</td>
                  <td>£{m.net.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const RANGE_PRESETS = Object.keys(REPORT_RANGE_LABELS) as ReportRangePreset[];

type DateRange = { from: string; to: string };

function rangeLabel(range: DateRange): string {
  return range.from && range.to ? `From ${formatIsoDay(range.from)} To ${formatIsoDay(range.to)}` : 'Choose a date range';
}

// Date Range dropdown shared by the date-ranged reports; "Custom" swaps in
// From/To boxes.
function ReportDateRangePicker({ range, onChange }: { range: DateRange; onChange: (next: DateRange) => void }) {
  const [preset, setPreset] = useState<ReportRangePreset>('thisYear');

  function pickPreset(next: ReportRangePreset) {
    setPreset(next);
    if (next !== 'custom') onChange(reportRange(next));
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      {preset === 'custom' && (
        <>
          <div className="field" style={{ marginBottom: 0, width: 150 }}>
            <label>From</label>
            <DateInput value={range.from} onChange={(from) => onChange({ ...range, from })} />
          </div>
          <div className="field" style={{ marginBottom: 0, width: 150 }}>
            <label>To</label>
            <DateInput value={range.to} onChange={(to) => onChange({ ...range, to })} />
          </div>
        </>
      )}
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Date Range</label>
        <select className="select-inline" value={preset} onChange={(e) => pickPreset(e.target.value as ReportRangePreset)}>
          {RANGE_PRESETS.map((p) => (
            <option key={p} value={p}>
              {REPORT_RANGE_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

type CategorySortKey = 'category' | 'total';

// Expenses totalled per category over a chosen date range (defaults to the
// current tax year). Clicking a category's amount lists the expenses behind
// it; clicking one of those opens it read-only.
function ExpenseSummaryByCategoryReport() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(() => reportRange('thisYear'));
  const [sortKey, setSortKey] = useState<CategorySortKey>('category');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [category, setCategory] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Expense | null>(null);

  useEffect(() => {
    api
      .listExpenses()
      .then(setExpenses)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the report'));
  }, []);

  function toggleSort(key: CategorySortKey) {
    if (key === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir(key === 'total' ? 'desc' : 'asc');
    }
  }

  const inRange = useMemo(
    () => (expenses ?? []).filter((e) => inDateRange(e.date, range.from, range.to)),
    [expenses, range],
  );

  const categories = useMemo(() => {
    const totals = new Map<string, number>();
    for (const e of inRange) totals.set(e.category, (totals.get(e.category) ?? 0) + e.amount);
    const rows: ExpenseCategoryTotal[] = [...totals].map(([c, total]) => ({ category: c, total }));
    const sign = sortDir === 'asc' ? 1 : -1;
    return rows.sort((a, b) =>
      sortKey === 'total' ? sign * (a.total - b.total) : sign * a.category.localeCompare(b.category),
    );
  }, [inRange, sortKey, sortDir]);

  const total = categories.reduce((sum, c) => sum + c.total, 0);
  const categoryExpenses = category ? inRange.filter((e) => e.category === category) : [];
  const categoryTotal = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Expense Summary by Category</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>{rangeLabel(range)}</p>
          </div>
          <ReportDateRangePicker range={range} onChange={setRange} />
        </div>
        {error && <div className="error-banner">{error}</div>}
        {expenses === null && !error && <div className="empty-state">Loading…</div>}
        {expenses && categories.length === 0 && <div className="empty-state">No expenses recorded in this period.</div>}
        {categories.length > 0 && <ExpensesByCategoryChart data={[...categories].sort((a, b) => b.total - a.total)} />}
      </div>

      {categories.length > 0 && !category && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <SortableTh label="Category Name" sortKey="category" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Amount" sortKey="total" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <th>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td>
                    <button
                      className="btn-link"
                      style={{ color: 'var(--accent)', fontSize: 'inherit' }}
                      title={`Show the ${c.category} expenses`}
                      onClick={() => setCategory(c.category)}
                    >
                      £{c.total.toFixed(2)}
                    </button>
                  </td>
                  <td>{total > 0 ? `${((c.total / total) * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td>Total</td>
                <td>£{total.toFixed(2)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {category && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
            <h3 style={{ margin: 0 }}>{category}</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setCategory(null)}>
              Back to summary
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Payee</th>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {categoryExpenses.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-state">
                    No {category} expenses in this period.
                  </td>
                </tr>
              )}
              {categoryExpenses.map((e) => (
                <tr key={e._id} onClick={() => setViewing(e)} style={{ cursor: 'pointer' }}>
                  <td>{new Date(e.date).toLocaleDateString('en-GB')}</td>
                  <td>{e.payee || '—'}</td>
                  <td>{e.description || '—'}</td>
                  <td>£{e.amount.toFixed(2)}</td>
                </tr>
              ))}
              {categoryExpenses.length > 0 && (
                <tr style={{ fontWeight: 700 }}>
                  <td colSpan={3}>Total</td>
                  <td>£{categoryTotal.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {viewing && <ViewExpenseModal expense={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function refId(ref: { _id: string } | string | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref._id;
}

type CustomerIncome = { id: string; name: string; payments: number; credits: number; net: number };
type CustomerSortKey = 'name' | 'net';
type IncomeLine = { key: string; date: string; kind: 'Payment' | 'Credit Note'; reference: string; amount: number };

// Income per customer over a chosen date range, on the same basis as the P/L
// report: payments received (via the invoice they were paid against) minus
// credit notes issued. Other income isn't tied to a customer, so it gets one
// line of its own and the grand total still matches the P/L.
function IncomeSummaryByCustomerReport() {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [creditNotes, setCreditNotes] = useState<CreditNote[] | null>(null);
  const [otherIncome, setOtherIncome] = useState<OtherIncome[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(() => reportRange('thisYear'));
  const [sortKey, setSortKey] = useState<CustomerSortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [customerId, setCustomerId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listPayments(), api.listInvoices(), api.listCreditNotes(), api.listOtherIncome()])
      .then(([p, i, c, o]) => {
        setPayments(p);
        setInvoices(i);
        setCreditNotes(c);
        setOtherIncome(o);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the report'));
  }, []);

  function toggleSort(key: CustomerSortKey) {
    if (key === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir(key === 'net' ? 'desc' : 'asc');
    }
  }

  const { customers, linesByCustomer, otherIncomeTotal } = useMemo(() => {
    const invoiceCustomer = new Map<string, { id: string; name: string }>();
    for (const inv of invoices ?? []) {
      const id = refId(inv.customer);
      if (id) invoiceCustomer.set(inv._id, { id, name: typeof inv.customer === 'string' ? 'Unknown customer' : inv.customer.name });
    }

    const rows = new Map<string, CustomerIncome>();
    const lines = new Map<string, IncomeLine[]>();
    const rowFor = (id: string, name: string) => {
      let row = rows.get(id);
      if (!row) {
        row = { id, name, payments: 0, credits: 0, net: 0 };
        rows.set(id, row);
        lines.set(id, []);
      }
      return row;
    };

    for (const p of payments ?? []) {
      if (!inDateRange(p.date, range.from, range.to)) continue;
      const invoiceId = refId(p.invoice);
      const customer = (invoiceId && invoiceCustomer.get(invoiceId)) || { id: 'unknown', name: 'Unknown customer' };
      const row = rowFor(customer.id, customer.name);
      row.payments += p.amount;
      lines.get(customer.id)!.push({
        key: p._id,
        date: p.date,
        kind: 'Payment',
        reference: p.invoice && typeof p.invoice !== 'string' ? `${p.paymentId} · ${p.invoice.invoiceNumber}` : p.paymentId,
        amount: p.amount,
      });
    }
    for (const c of creditNotes ?? []) {
      if (!inDateRange(c.date, range.from, range.to)) continue;
      const id = refId(c.customer) ?? 'unknown';
      const row = rowFor(id, typeof c.customer === 'string' ? 'Unknown customer' : c.customer.name);
      row.credits += c.amount;
      lines.get(id)!.push({ key: c._id, date: c.date, kind: 'Credit Note', reference: c.creditNoteNumber, amount: -c.amount });
    }
    for (const row of rows.values()) row.net = row.payments - row.credits;
    for (const l of lines.values()) l.sort((a, b) => a.date.localeCompare(b.date));

    const sign = sortDir === 'asc' ? 1 : -1;
    const sorted = [...rows.values()].sort((a, b) =>
      sortKey === 'net' ? sign * (a.net - b.net) : sign * a.name.localeCompare(b.name),
    );
    const other = (otherIncome ?? [])
      .filter((o) => inDateRange(o.date, range.from, range.to))
      .reduce((sum, o) => sum + o.amount, 0);
    return { customers: sorted, linesByCustomer: lines, otherIncomeTotal: other };
  }, [payments, invoices, creditNotes, otherIncome, range, sortKey, sortDir]);

  const loaded = payments && invoices && creditNotes && otherIncome;
  const customerTotal = customers.reduce((sum, c) => sum + c.net, 0);
  const total = customerTotal + otherIncomeTotal;
  const selected = customerId ? customers.find((c) => c.id === customerId) : null;
  const selectedLines = customerId ? (linesByCustomer.get(customerId) ?? []) : [];

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Income Summary by Customer</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>{rangeLabel(range)}</p>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
              Payments received, minus credit notes issued.
            </p>
          </div>
          <ReportDateRangePicker
            range={range}
            onChange={(next) => {
              setRange(next);
              setCustomerId(null);
            }}
          />
        </div>
        {error && <div className="error-banner">{error}</div>}
        {!loaded && !error && <div className="empty-state">Loading…</div>}
        {loaded && customers.length === 0 && otherIncomeTotal === 0 && (
          <div className="empty-state">No income recorded in this period.</div>
        )}
      </div>

      {loaded && !selected && (customers.length > 0 || otherIncomeTotal !== 0) && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <SortableTh label="Customer" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <th>Payments</th>
                <th>Credit Notes</th>
                <SortableTh label="Net Income" sortKey="net" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <th>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>{c.id === 'unknown' ? c.name : <Link to={`/customers/${c.id}`}>{c.name}</Link>}</td>
                  <td>£{c.payments.toFixed(2)}</td>
                  <td>{c.credits ? `−£${c.credits.toFixed(2)}` : '—'}</td>
                  <td>
                    <button
                      className="btn-link"
                      style={{ color: 'var(--accent)', fontSize: 'inherit' }}
                      title={`Show ${c.name}'s payments and credit notes`}
                      onClick={() => setCustomerId(c.id)}
                    >
                      £{c.net.toFixed(2)}
                    </button>
                  </td>
                  <td>{total > 0 ? `${((c.net / total) * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
              {otherIncomeTotal !== 0 && (
                <tr>
                  <td style={{ fontStyle: 'italic' }}>Other income (not from a customer)</td>
                  <td></td>
                  <td></td>
                  <td>£{otherIncomeTotal.toFixed(2)}</td>
                  <td>{total > 0 ? `${((otherIncomeTotal / total) * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              )}
              <tr style={{ fontWeight: 700 }}>
                <td>Total</td>
                <td></td>
                <td></td>
                <td>£{total.toFixed(2)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
            <h3 style={{ margin: 0 }}>{selected.name}</h3>
            <button className="btn btn-secondary btn-sm" onClick={() => setCustomerId(null)}>
              Back to summary
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Reference</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {selectedLines.map((l) => (
                <tr key={l.key}>
                  <td>{new Date(l.date).toLocaleDateString('en-GB')}</td>
                  <td>{l.kind}</td>
                  <td>{l.reference}</td>
                  <td>{l.amount < 0 ? `−£${(-l.amount).toFixed(2)}` : `£${l.amount.toFixed(2)}`}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={3}>Total</td>
                <td>£{selected.net.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type InvoiceSortKey = 'dueDate' | 'invoiceNumber' | 'customer' | 'total' | 'balance';

// Every invoice falling due in a chosen date range, with what's still owed on
// each. Cancelled invoices are never due so they're always left out; drafts
// haven't been issued yet, so they only show when the Drafts pill is on.
function InvoicesDueReport() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(() => reportRange('thisYear'));
  const [sortKey, setSortKey] = useState<InvoiceSortKey>('dueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    api
      .listInvoices()
      .then(setInvoices)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the report'));
  }, []);

  function toggleSort(key: InvoiceSortKey) {
    if (key === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir(key === 'total' || key === 'balance' ? 'desc' : 'asc');
    }
  }

  const rows = useMemo(() => {
    const due = (invoices ?? []).filter(
      (inv) =>
        inv.status !== 'cancelled' &&
        (includeDrafts || inv.status !== 'draft') &&
        inDateRange(inv.dueDate, range.from, range.to),
    );
    const sign = sortDir === 'asc' ? 1 : -1;
    const value = (inv: Invoice): string | number => {
      switch (sortKey) {
        case 'dueDate':
          return new Date(inv.dueDate).getTime();
        case 'invoiceNumber':
          return inv.invoiceNumber;
        case 'customer':
          return customerLabel(inv.customer);
        case 'total':
          return inv.total;
        case 'balance':
          return invoiceBalanceDue(inv);
      }
    };
    return due.sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (typeof va === 'number' && typeof vb === 'number') return sign * (va - vb);
      return sign * String(va).localeCompare(String(vb), 'en-GB', { numeric: true, sensitivity: 'base' });
    });
  }, [invoices, range, includeDrafts, sortKey, sortDir]);

  const total = rows.reduce((sum, inv) => sum + inv.total, 0);
  const paid = rows.reduce((sum, inv) => sum + (inv.amountPaid ?? 0), 0);
  const balance = rows.reduce((sum, inv) => sum + invoiceBalanceDue(inv), 0);

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Income</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>{rangeLabel(range)}</p>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
              {includeDrafts
                ? 'Invoices due in this period, including drafts (cancelled invoices are left out).'
                : 'Invoices due in this period (drafts and cancelled invoices are left out).'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`toggle-pill${includeDrafts ? ' active' : ''}`}
              aria-pressed={includeDrafts}
              title={includeDrafts ? 'Hide draft invoices' : 'Include draft invoices'}
              onClick={() => setIncludeDrafts((on) => !on)}
            >
              Drafts
            </button>
            <div className="field" style={{ marginBottom: 0, width: 150 }}>
              <label>Date From</label>
              <DateInput value={range.from} onChange={(from) => setRange({ ...range, from })} />
            </div>
            <div className="field" style={{ marginBottom: 0, width: 150 }}>
              <label>Date To</label>
              <DateInput value={range.to} onChange={(to) => setRange({ ...range, to })} />
            </div>
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {invoices === null && !error && <div className="empty-state">Loading…</div>}
        {invoices && rows.length === 0 && <div className="empty-state">No invoices due in this period.</div>}
        {rows.length > 0 && (
          <div style={{ display: 'flex', gap: 24, marginTop: 10, fontWeight: 600, flexWrap: 'wrap' }}>
            <div>Invoices — {rows.length}</div>
            <div>Total — £{total.toFixed(2)}</div>
            <div>Paid — £{paid.toFixed(2)}</div>
            <div style={{ color: balance > 0 ? 'var(--error)' : 'var(--accent)' }}>Balance Due — £{balance.toFixed(2)}</div>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <SortableTh label="Due Date" sortKey="dueDate" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Invoice" sortKey="invoiceNumber" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <SortableTh label="Customer" sortKey="customer" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <th>Status</th>
                <SortableTh label="Total" sortKey="total" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
                <th>Paid</th>
                <SortableTh label="Balance Due" sortKey="balance" activeKey={sortKey} dir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => {
                const customerId = refId(inv.customer);
                return (
                  <tr key={inv._id}>
                    <td>{new Date(inv.dueDate).toLocaleDateString('en-GB')}</td>
                    <td>
                      <Link to={`/invoices?view=${inv._id}`}>{inv.invoiceNumber}</Link>
                    </td>
                    <td>
                      {customerId && typeof inv.customer !== 'string' ? (
                        <Link to={`/customers/${customerId}`}>{customerLabel(inv.customer)}</Link>
                      ) : (
                        customerLabel(inv.customer)
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${inv.status}`}>{inv.status}</span>
                    </td>
                    <td>£{inv.total.toFixed(2)}</td>
                    <td>{inv.amountPaid ? `£${inv.amountPaid.toFixed(2)}` : '—'}</td>
                    <td>£{invoiceBalanceDue(inv).toFixed(2)}</td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 700 }}>
                <td colSpan={4}>Total</td>
                <td>£{total.toFixed(2)}</td>
                <td>£{paid.toFixed(2)}</td>
                <td>£{balance.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
