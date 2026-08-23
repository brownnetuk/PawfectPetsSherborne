import { useEffect, useState } from 'react';
import * as api from '../api/client';
import ExpensesByCategoryChart from '../components/ExpensesByCategoryChart';
import IncomeExpenseChart from '../components/IncomeExpenseChart';
import type { ExpenseCategoryTotal, IncomeExpenseMonth } from '../types';

type Tab = 'pl' | 'expensesByCategory';

const TAB_LABELS: Record<Tab, string> = {
  pl: 'P/L',
  expensesByCategory: 'Expenses by Category',
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
      {tab === 'expensesByCategory' && <ExpensesByCategoryReport />}
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

function ExpensesByCategoryReport() {
  const [period, setPeriod] = useState(6);
  const [categories, setCategories] = useState<ExpenseCategoryTotal[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getExpensesByCategoryReport(period)
      .then(setCategories)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the report'));
  }, [period]);

  const total = categories?.reduce((sum, c) => sum + c.total, 0) ?? 0;

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h2 style={{ marginBottom: 2 }}>Expenses by Category</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
              Where recorded expenses have gone, grouped by category.
            </p>
          </div>
          <select className="select-inline" value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
            <option value={6}>Last 6 Months</option>
            <option value={12}>Last 12 Months</option>
          </select>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {categories && categories.length === 0 && (
          <div className="empty-state">No expenses recorded in this period.</div>
        )}
        {categories && categories.length > 0 && <ExpensesByCategoryChart data={categories} />}
        {categories && categories.length > 0 && (
          <div style={{ marginTop: 10, fontWeight: 600 }}>Total — £{total.toFixed(2)}</div>
        )}
      </div>

      {categories && categories.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount</th>
                <th>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td>£{c.total.toFixed(2)}</td>
                  <td>{total > 0 ? `${((c.total / total) * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
