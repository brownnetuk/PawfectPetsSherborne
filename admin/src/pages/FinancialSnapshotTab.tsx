import { useEffect, useRef, useState } from 'react';
import * as api from '../api/client';
import CashFlowChart from '../components/CashFlowChart';
import ExpensesByCategoryChart from '../components/ExpensesByCategoryChart';
import IncomeExpenseChart from '../components/IncomeExpenseChart';
import { DragHandleIcon } from '../components/icons';
import { bankAccountTypeLabel } from '../utils/bankAccountType';
import type { BankAccount, Customer, ExpenseCategoryTotal, IncomeExpenseMonth, Invoice, Product } from '../types';

type CardId =
  | 'receivables'
  | 'payables'
  | 'cashFlow'
  | 'incomeExpense'
  | 'topExpenses'
  | 'bankAccounts'
  | 'expectedRevenue';

const DEFAULT_ORDER: CardId[] = [
  'receivables',
  'payables',
  'cashFlow',
  'incomeExpense',
  'topExpenses',
  'bankAccounts',
  'expectedRevenue',
];

// Cash Flow reads better spanning both grid columns; everything else is a
// normal half-width cell.
const WIDE_CARDS = new Set<CardId>(['cashFlow']);

const ORDER_STORAGE_KEY = 'pawfectpets_admin_snapshot_order';

function loadOrder(): CardId[] {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    if (!raw) return DEFAULT_ORDER;
    const parsed = JSON.parse(raw) as string[];
    const valid = parsed.filter((id): id is CardId => (DEFAULT_ORDER as string[]).includes(id));
    const missing = DEFAULT_ORDER.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  } catch {
    return DEFAULT_ORDER;
  }
}

function saveOrder(order: CardId[]) {
  try {
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // Per-browser convenience only -- fine to silently skip if storage is
    // unavailable (private browsing, quota, etc.).
  }
}

export default function FinancialSnapshotTab() {
  const [order, setOrder] = useState<CardId[]>(loadOrder);
  const dragId = useRef<CardId | null>(null);

  function handleDrop(targetId: CardId) {
    const sourceId = dragId.current;
    dragId.current = null;
    if (!sourceId || sourceId === targetId) return;
    setOrder((prev) => {
      const next = prev.filter((id) => id !== sourceId);
      next.splice(next.indexOf(targetId), 0, sourceId);
      saveOrder(next);
      return next;
    });
  }

  const CARD_COMPONENTS: Record<CardId, React.ComponentType> = {
    receivables: ReceivablesCard,
    payables: PayablesCard,
    cashFlow: CashFlowCard,
    incomeExpense: IncomeExpenseCard,
    topExpenses: TopExpensesCard,
    bankAccounts: BankAccountsCard,
    expectedRevenue: ExpectedRevenueCard,
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
      {order.map((id) => {
        const CardComponent = CARD_COMPONENTS[id];
        return (
          <div
            key={id}
            draggable
            onDragStart={() => {
              dragId.current = id;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(id)}
            style={{ gridColumn: WIDE_CARDS.has(id) ? '1 / -1' : undefined, cursor: 'grab' }}
          >
            <CardComponent />
          </div>
        );
      })}
    </div>
  );
}

// Shared header: title on the left, an optional right-side control (period
// select), and a drag-handle hint so the "cards are draggable" affordance is
// visible rather than a hidden feature.
function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: subtitle ? 2 : 10 }}>
      <div>
        <h2 style={{ marginBottom: subtitle ? 2 : 0 }}>{title}</h2>
        {subtitle && <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: 0 }}>{subtitle}</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {right}
        <span style={{ color: 'var(--muted)' }} title="Drag to re-arrange">
          <DragHandleIcon />
        </span>
      </div>
    </div>
  );
}

function PeriodSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <select className="select-inline" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      <option value={6}>Last 6 Months</option>
      <option value={12}>Last 12 Months</option>
    </select>
  );
}

function ReceivablesCard() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listInvoices()
      .then(setInvoices)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load invoices'));
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const outstanding =
    invoices?.filter((i) => i.status !== 'draft' && i.status !== 'cancelled' && i.total - (i.amountPaid ?? 0) > 0) ??
    [];
  const current = outstanding.filter((i) => new Date(i.dueDate) >= today);
  const overdue = outstanding.filter((i) => new Date(i.dueDate) < today);
  const currentTotal = current.reduce((sum, i) => sum + (i.total - (i.amountPaid ?? 0)), 0);
  const overdueTotal = overdue.reduce((sum, i) => sum + (i.total - (i.amountPaid ?? 0)), 0);
  const total = currentTotal + overdueTotal;
  const currentPct = total > 0 ? (currentTotal / total) * 100 : 0;

  return (
    <div className="card" style={{ margin: 0, height: '100%' }}>
      <CardHeader title="Total Receivables" subtitle="Total Unpaid Invoices" />
      {error && <div className="error-banner">{error}</div>}
      {!invoices ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, margin: '4px 0 14px' }}>£{total.toFixed(2)}</div>
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--border)' }}>
            {total > 0 && (
              <>
                <div style={{ width: `${currentPct}%`, background: 'var(--accent)' }} />
                <div style={{ width: `${100 - currentPct}%`, background: 'var(--error)' }} />
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: '0.82rem', color: 'var(--muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
              Current : £{currentTotal.toFixed(2)}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--error)', display: 'inline-block' }} />
              Overdue : £{overdueTotal.toFixed(2)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function PayablesCard() {
  return (
    <div className="card" style={{ margin: 0, height: '100%' }}>
      <CardHeader title="Total Payables" subtitle="Total Unpaid Bills" />
      <div style={{ fontSize: '1.6rem', fontWeight: 700, margin: '4px 0 10px' }}>£0.00</div>
      <p style={{ color: 'var(--muted)', fontSize: '0.82rem', margin: 0 }}>
        This app doesn't track vendor bills — recorded Expenses are already paid, not outstanding.
      </p>
    </div>
  );
}

function CashFlowCard() {
  const [period, setPeriod] = useState(6);
  const [months, setMonths] = useState<IncomeExpenseMonth[] | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getIncomeExpenseReport(period)
      .then(setMonths)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load cash flow'));
  }, [period]);

  useEffect(() => {
    api.listBankAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  const cashNow = accounts?.reduce((sum, a) => sum + (a.currentBalance ?? 0), 0) ?? 0;
  const netChange = months?.reduce((sum, m) => sum + m.net, 0) ?? 0;
  const incoming = months?.reduce((sum, m) => sum + m.income, 0) ?? 0;
  const outgoing = months?.reduce((sum, m) => sum + m.expenses, 0) ?? 0;
  const cashAtStart = cashNow - netChange;
  const startLabel = months && months.length > 0 ? monthStartLabel(months[0].month) : '';

  return (
    <div className="card" style={{ margin: 0 }}>
      <CardHeader title="Cash Flow" right={<PeriodSelect value={period} onChange={setPeriod} />} />
      {error && <div className="error-banner">{error}</div>}
      {!months || !accounts ? (
        <div className="empty-state">Loading…</div>
      ) : (
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 380px', minWidth: 280 }}>
            <CashFlowChart data={months} startingCash={cashAtStart} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem', minWidth: 180 }}>
            <div>
              <div style={{ color: 'var(--muted)' }}>Cash as of {startLabel}</div>
              <div style={{ fontWeight: 700 }}>£{cashAtStart.toFixed(2)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--accent-dark)' }}>Incoming (+)</div>
              <div style={{ fontWeight: 700 }}>£{incoming.toFixed(2)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--error)' }}>Outgoing (-)</div>
              <div style={{ fontWeight: 700 }}>£{outgoing.toFixed(2)}</div>
            </div>
            <div>
              <div style={{ color: 'var(--muted)' }}>Cash now (=)</div>
              <div style={{ fontWeight: 700 }}>£{cashNow.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function monthStartLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function IncomeExpenseCard() {
  const [period, setPeriod] = useState(6);
  const [months, setMonths] = useState<IncomeExpenseMonth[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getIncomeExpenseReport(period)
      .then(setMonths)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load income vs expenses'));
  }, [period]);

  const totalIncome = months?.reduce((sum, m) => sum + m.income, 0) ?? 0;
  const totalExpenses = months?.reduce((sum, m) => sum + m.expenses, 0) ?? 0;

  return (
    <div className="card" style={{ margin: 0, height: '100%' }}>
      <CardHeader title="Income and Expense" right={<PeriodSelect value={period} onChange={setPeriod} />} />
      {error && <div className="error-banner">{error}</div>}
      {!months ? <div className="empty-state">Loading…</div> : <IncomeExpenseChart data={months} />}
      {months && (
        <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: '0.85rem', fontWeight: 600 }}>
          <div>Income — £{totalIncome.toFixed(2)}</div>
          <div>Expenses — £{totalExpenses.toFixed(2)}</div>
        </div>
      )}
    </div>
  );
}

const TOP_EXPENSE_CATEGORIES = 5;

function TopExpensesCard() {
  const [period, setPeriod] = useState(6);
  const [categories, setCategories] = useState<ExpenseCategoryTotal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getExpensesByCategoryReport(period)
      .then(setCategories)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load top expenses'));
  }, [period]);

  const top = categories?.slice(0, TOP_EXPENSE_CATEGORIES) ?? [];
  const rest = categories?.slice(TOP_EXPENSE_CATEGORIES) ?? [];
  const othersTotal = rest.reduce((sum, c) => sum + c.total, 0);
  const chartData = othersTotal > 0 ? [...top, { category: 'Others', total: othersTotal }] : top;
  const total = categories?.reduce((sum, c) => sum + c.total, 0) ?? 0;

  return (
    <div className="card" style={{ margin: 0, height: '100%' }}>
      <CardHeader title="Top Expenses" right={<PeriodSelect value={period} onChange={setPeriod} />} />
      {error && <div className="error-banner">{error}</div>}
      {!categories ? (
        <div className="empty-state">Loading…</div>
      ) : chartData.length === 0 ? (
        <div className="empty-state">No expenses recorded in this period.</div>
      ) : (
        <>
          <ExpensesByCategoryChart data={chartData} />
          <div style={{ marginTop: 10, fontSize: '0.85rem', fontWeight: 600 }}>Total — £{total.toFixed(2)}</div>
        </>
      )}
    </div>
  );
}

function BankAccountsCard() {
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listBankAccounts()
      .then(setAccounts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load bank accounts'));
  }, []);

  return (
    <div className="card" style={{ margin: 0, height: '100%' }}>
      <CardHeader title="Bank Accounts" />
      {error && <div className="error-banner">{error}</div>}
      {!accounts ? (
        <div className="empty-state">Loading…</div>
      ) : accounts.length === 0 ? (
        <div className="empty-state">No bank accounts set up.</div>
      ) : (
        <div>
          {accounts.map((a) => (
            <div
              key={a._id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span>
                {a.name} <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>({bankAccountTypeLabel(a.type)})</span>
              </span>
              <span style={{ fontWeight: 700, color: (a.currentBalance ?? 0) < 0 ? 'var(--error)' : undefined }}>
                £{(a.currentBalance ?? 0).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// JS Date.getDay() index (0=Sunday) for each of Customer.regularDays' lowercase
// weekday strings.
const WEEKDAY_JS_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// Counts how many times a given weekday (0=Sunday) falls in a calendar month
// -- walks every day rather than assuming a flat "4 or 5 per month", since
// that varies month to month.
function countWeekdayInMonth(year: number, month: number, weekdayIndex: number): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    if (new Date(year, month, day).getDay() === weekdayIndex) count++;
  }
  return count;
}

function monthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  // 3 months back (for reviewing a recently-finished month) through 11 months
  // ahead (a full year of forward projection).
  for (let offset = -3; offset <= 11; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    options.push({ value, label });
  }
  return options;
}

function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

interface ExpectedRevenueRow {
  customerId: string;
  customerName: string;
  productName: string;
  occurrences: number;
  revenue: number;
}

function ExpectedRevenueCard() {
  const [month, setMonth] = useState(currentMonthValue);
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listCustomers()
      .then(setCustomers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load customers'));
    api.listProducts().then(setProducts).catch(() => setProducts([]));
  }, []);

  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;

  const rows: ExpectedRevenueRow[] = [];
  if (customers && products) {
    const productById = new Map(products.map((p) => [p._id, p]));
    for (const customer of customers) {
      if (customer.status !== 'active') continue;
      if (!customer.defaultProduct || !customer.regularDays?.length) continue;
      const product = productById.get(customer.defaultProduct);
      if (!product) continue;
      const occurrences = customer.regularDays.reduce((sum, day) => {
        const weekdayIndex = WEEKDAY_JS_INDEX[day];
        return weekdayIndex === undefined ? sum : sum + countWeekdayInMonth(year, monthIndex, weekdayIndex);
      }, 0);
      if (occurrences === 0) continue;
      rows.push({
        customerId: customer._id,
        customerName: customer.name,
        productName: product.name,
        occurrences,
        revenue: occurrences * product.price,
      });
    }
    rows.sort((a, b) => b.revenue - a.revenue);
  }
  const total = rows.reduce((sum, r) => sum + r.revenue, 0);

  return (
    <div className="card" style={{ margin: 0, height: '100%' }}>
      <CardHeader
        title="Expected Revenue"
        subtitle="From customers' regular days and default product"
        right={
          <select className="select-inline" value={month} onChange={(e) => setMonth(e.target.value)}>
            {monthOptions().map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        }
      />
      {error && <div className="error-banner">{error}</div>}
      {!customers || !products ? (
        <div className="empty-state">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          No active customers have both a default product and regular days set up.
        </div>
      ) : (
        <>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, margin: '4px 0 14px' }}>£{total.toFixed(2)}</div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {rows.map((r) => (
              <div
                key={r.customerId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.88rem',
                }}
              >
                <span>
                  {r.customerName}
                  <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                    {' '}
                    — {r.productName} × {r.occurrences}
                  </span>
                </span>
                <span style={{ fontWeight: 600 }}>£{r.revenue.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
