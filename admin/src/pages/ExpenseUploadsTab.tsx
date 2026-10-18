import { useEffect, useState } from 'react';
import * as api from '../api/client';
import DateRangeFilterBar, { currentMonthFilters, inDateRange, matchesSearch } from '../components/DateRangeFilterBar';
import EmailExpenseModal from '../components/EmailExpenseModal';
import ViewExpenseModal from '../components/ViewExpenseModal';
import { MailIcon } from '../components/icons';
import type { Expense } from '../types';
import { expenseReceiptName } from '../utils/receiptFile';

// Every expense with an uploaded receipt (image or PDF), to find, view and
// email them in one place. Receipts are added and changed on the Expenses tab.
export default function ExpenseUploadsTab() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Expense | null>(null);
  const [emailing, setEmailing] = useState<Expense | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [filters, setFilters] = useState(currentMonthFilters);

  useEffect(() => {
    api
      .listExpenses()
      .then((all) => setExpenses(all.filter((e) => e.receipt)))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load uploads'));
  }, []);

  const visible = (expenses ?? []).filter(
    (e) =>
      inDateRange(e.date, filters.from, filters.to) &&
      matchesSearch(filters.search, [
        new Date(e.date).toLocaleDateString('en-GB'),
        e.expenseId,
        expenseReceiptName(e),
        e.payee,
        e.category,
        e.description,
        e.amount.toFixed(2),
      ]),
  );

  return (
    <div className="card">
      <h2>Uploads</h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: -6 }}>
        Receipts and invoices uploaded against expenses.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {sentTo && <div className="success-banner">Receipt emailed to {sentTo}.</div>}
      {expenses && expenses.length > 0 && (
        <DateRangeFilterBar
          filters={filters}
          onChange={setFilters}
          searchPlaceholder="Expense ID, file name, payee…"
          dates={expenses.map((e) => e.date)}
        />
      )}
      {!expenses || expenses.length === 0 ? (
        <div className="empty-state">{expenses === null ? 'Loading…' : 'No receipts uploaded yet.'}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Expense ID</th>
              <th>File Name</th>
              <th>Payee</th>
              <th>Category</th>
              <th>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-state">
                  No uploads match these filters.
                </td>
              </tr>
            )}
            {visible.map((e) => (
              <tr key={e._id} onClick={() => setViewing(e)}>
                <td>{new Date(e.date).toLocaleDateString('en-GB')}</td>
                <td>{e.expenseId || '—'}</td>
                <td style={{ wordBreak: 'break-all' }}>{expenseReceiptName(e)}</td>
                <td>{e.payee || '—'}</td>
                <td>{e.category}</td>
                <td>£{e.amount.toFixed(2)}</td>
                <td onClick={(ev) => ev.stopPropagation()}>
                  <button className="icon-btn" title="Email" onClick={() => setEmailing(e)}>
                    <MailIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {viewing && (
        <ViewExpenseModal
          expense={viewing}
          onClose={() => setViewing(null)}
          onEmail={() => {
            setEmailing(viewing);
            setViewing(null);
          }}
        />
      )}

      {emailing && (
        <EmailExpenseModal
          expense={emailing}
          onClose={() => setEmailing(null)}
          onSent={(to) => {
            setSentTo(to);
            setEmailing(null);
          }}
        />
      )}
    </div>
  );
}
