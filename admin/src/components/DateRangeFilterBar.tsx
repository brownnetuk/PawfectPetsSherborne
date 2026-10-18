import DateInput from './DateInput';

// Search + Month/Year + date-range row for the Financial tables. Picking a
// month fills From/To with that month; editing either date by hand switches
// the month picker to "Custom range". Starts on the current month.

export type DateRangeFilters = { search: string; month: string; from: string; to: string };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// 'YYYY-MM' -> first and last day of that month, as 'YYYY-MM-DD'.
function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${pad(lastDay)}` };
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function currentMonthFilters(): DateRangeFilters {
  const month = monthKey(new Date());
  return { search: '', month, ...monthRange(month) };
}

// Compare on the local calendar day so a row dated on the "To" day itself is
// still included.
export function inDateRange(iso: string, from: string, to: string): boolean {
  const d = new Date(iso);
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

// True when any of `texts` contains the search box's text (case-insensitive).
export function matchesSearch(search: string, texts: (string | number | null | undefined)[]): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return texts.some((t) => t != null && String(t).toLowerCase().includes(q));
}

// Every month from the earliest row (or the current month, if later) back to
// the current one, newest first.
function monthOptions(dates: string[]): { value: string; label: string }[] {
  const now = new Date();
  let earliest = new Date(now.getFullYear(), now.getMonth(), 1);
  for (const iso of dates) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime()) && d < earliest) earliest = new Date(d.getFullYear(), d.getMonth(), 1);
  }
  const options: { value: string; label: string }[] = [];
  for (let d = new Date(now.getFullYear(), now.getMonth(), 1); d >= earliest; d.setMonth(d.getMonth() - 1)) {
    options.push({ value: monthKey(d), label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) });
  }
  return options;
}

const fieldStyle = { marginBottom: 0 } as const;

export default function DateRangeFilterBar({
  filters,
  onChange,
  searchPlaceholder,
  dates,
}: {
  filters: DateRangeFilters;
  onChange: (next: DateRangeFilters) => void;
  searchPlaceholder: string;
  // Dates of every row, so the Month/Year list reaches back to the oldest.
  dates: string[];
}) {
  const months = monthOptions(dates);

  function pickMonth(month: string) {
    if (month === 'custom') onChange({ ...filters, month: '' });
    else if (month === '') onChange({ ...filters, month: 'all', from: '', to: '' });
    else onChange({ ...filters, month, ...monthRange(month) });
  }

  const monthValue = filters.month === 'all' ? '' : filters.month || 'custom';
  const isDefault = (() => {
    const d = currentMonthFilters();
    return !filters.search && filters.month === d.month && filters.from === d.from && filters.to === d.to;
  })();

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
      <div className="field" style={{ ...fieldStyle, width: 240 }}>
        <label>Search</label>
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </div>
      <div className="field" style={{ ...fieldStyle, width: 170 }}>
        <label>Month / Year</label>
        <select value={monthValue} onChange={(e) => pickMonth(e.target.value)}>
          <option value="">All dates</option>
          {monthValue === 'custom' && <option value="custom">Custom range</option>}
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ ...fieldStyle, width: 150 }}>
        <label>From</label>
        <DateInput value={filters.from} onChange={(from) => onChange({ ...filters, month: '', from })} />
      </div>
      <div className="field" style={{ ...fieldStyle, width: 150 }}>
        <label>To</label>
        <DateInput value={filters.to} onChange={(to) => onChange({ ...filters, month: '', to })} />
      </div>
      {!isDefault && (
        <button className="btn btn-secondary btn-sm" style={{ marginBottom: 6 }} onClick={() => onChange(currentMonthFilters())}>
          Reset to this month
        </button>
      )}
    </div>
  );
}
