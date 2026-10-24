// dd/mm/yyyy for display. A plain 'YYYY-MM-DD' (how risk assessment dates are
// stored) is rearranged as-is rather than parsed, since new Date('YYYY-MM-DD')
// is UTC midnight and can land on the previous day in a timezone behind UTC.
export function formatUkDate(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d.toLocaleDateString('en-GB');
}
