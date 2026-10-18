// Preset date ranges for the Reports page. Weeks start on Monday, and "Year"
// is the UK tax year (1 April to 31 March), so quarters run Apr-Jun, Jul-Sep,
// Oct-Dec and Jan-Mar. Dates are 'YYYY-MM-DD' on the local calendar.

export type ReportRangePreset =
  | 'today'
  | 'thisWeek'
  | 'thisMonth'
  | 'thisQuarter'
  | 'thisYear'
  | 'yesterday'
  | 'previousWeek'
  | 'previousMonth'
  | 'previousQuarter'
  | 'previousYear'
  | 'custom';

export const REPORT_RANGE_LABELS: Record<ReportRangePreset, string> = {
  today: 'Today',
  thisWeek: 'This Week',
  thisMonth: 'This Month',
  thisQuarter: 'This Quarter',
  thisYear: 'This Year',
  yesterday: 'Yesterday',
  previousWeek: 'Previous Week',
  previousMonth: 'Previous Month',
  previousQuarter: 'Previous Quarter',
  previousYear: 'Previous Year',
  custom: 'Custom',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY'.
export function formatIsoDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// First month (0-based) of the tax quarter that `month` falls in.
function taxQuarterStartMonth(month: number): number {
  return month - ((month - 3 + 12) % 3);
}

function taxYearStart(d: Date): Date {
  return new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1);
}

export function reportRange(preset: Exclude<ReportRangePreset, 'custom'>, now = new Date()): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (offset: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  const mondayOffset = -((today.getDay() + 6) % 7);
  const range = (from: Date, to: Date) => ({ from: toIsoDay(from), to: toIsoDay(to) });

  switch (preset) {
    case 'today':
      return range(today, today);
    case 'yesterday':
      return range(day(-1), day(-1));
    case 'thisWeek':
      return range(day(mondayOffset), day(mondayOffset + 6));
    case 'previousWeek':
      return range(day(mondayOffset - 7), day(mondayOffset - 1));
    case 'thisMonth':
      return range(new Date(today.getFullYear(), today.getMonth(), 1), new Date(today.getFullYear(), today.getMonth() + 1, 0));
    case 'previousMonth':
      return range(new Date(today.getFullYear(), today.getMonth() - 1, 1), new Date(today.getFullYear(), today.getMonth(), 0));
    case 'thisQuarter': {
      const m = taxQuarterStartMonth(today.getMonth());
      return range(new Date(today.getFullYear(), m, 1), new Date(today.getFullYear(), m + 3, 0));
    }
    case 'previousQuarter': {
      const m = taxQuarterStartMonth(today.getMonth()) - 3;
      return range(new Date(today.getFullYear(), m, 1), new Date(today.getFullYear(), m + 3, 0));
    }
    case 'thisYear': {
      const start = taxYearStart(today);
      return range(start, new Date(start.getFullYear() + 1, 2, 31));
    }
    case 'previousYear': {
      const start = taxYearStart(today);
      return range(new Date(start.getFullYear() - 1, 3, 1), new Date(start.getFullYear(), 2, 31));
    }
  }
}
