import { useEffect, useMemo, useState } from 'react';
import * as api from '../api/client';
import DateInput from '../components/DateInput';
import { inDateRange } from '../components/DateRangeFilterBar';
import ExpensesByCategoryChart from '../components/ExpensesByCategoryChart';
import IncomeExpenseChart from '../components/IncomeExpenseChart';
import SortableTh from '../components/SortableTh';
import ViewExpenseModal from '../components/ViewExpenseModal';
import type { Expense, ExpenseCategoryTotal, IncomeExpenseMonth } from '../types';
import {
  REPORT_RANGE_LABELS,
  type ReportRangePreset,
  formatIsoDay,
  reportRange,
} from '../utils/reportDateRange';

type Tab = 'pl' | 'expensesByCategory';

const TAB_LABELS: Record<Tab, string> = {
  pl: 'P/L',
  expensesByCategory: 'Expense Summary by Category',
};

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('pl');

  return (
    <div>
      <div className="page-header">
        <h1>Reports</h1>
      </div>

      <div className="tabs">
        {(['pl', 'expensesByCategory'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === 'pl' && <ProfitAndLossReport />}
      {tab === 'expensesByCategory' && <ExpenseSummaryByCategoryReport />}
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

type CategorySortKey = 'category' | 'total';

// Expenses totalled per category over a chosen date range (defaults to the
// current tax year). Clicking a category's amount lists the expenses behind
// it; clicking one of those opens it read-only.
function ExpenseSummaryByCategoryReport() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<ReportRangePreset>('thisYear');
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

  function pickPreset(next: ReportRangePreset) {
    setPreset(next);
    if (next !== 'custom') setRange(reportRange(next));
  }

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
  const rangeLabel =
    range.from && range.to ? `From ${formatIsoDay(range.from)} To ${formatIsoDay(range.to)}` : 'Choose a date range';
  const categoryExpenses = category ? inRange.filter((e) => e.category === category) : [];
  const categoryTotal = categoryExpenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Expense Summary by Category</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>{rangeLabel}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {preset === 'custom' && (
              <>
                <div className="field" style={{ marginBottom: 0, width: 150 }}>
                  <label>From</label>
                  <DateInput value={range.from} onChange={(from) => setRange({ ...range, from })} />
                </div>
                <div className="field" style={{ marginBottom: 0, width: 150 }}>
                  <label>To</label>
                  <DateInput value={range.to} onChange={(to) => setRange({ ...range, to })} />
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
