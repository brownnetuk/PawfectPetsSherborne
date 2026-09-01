import type { AnnualLeave } from '../types';

function dateKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// r.startDate/endDate are UTC ISO strings -- parse back into a Date first so
// the local getters undo the server's local-midnight-to-UTC offset, same
// round-trip fix used throughout this codebase (e.g. productAvailability's
// dayTypeFor). String comparison works directly on 'YYYY-MM-DD' keys.
export function annualLeaveOn(date: Date, ranges: AnnualLeave[]): AnnualLeave | undefined {
  const key = dateKeyOf(date);
  return ranges.find((r) => {
    const start = dateKeyOf(new Date(r.startDate));
    const end = dateKeyOf(new Date(r.endDate));
    return key >= start && key <= end;
  });
}

// True if any day in [start, end] (inclusive) falls in an annual leave
// range -- used to block New Booking from creating entries across leave.
export function rangeOverlapsAnnualLeave(start: Date, end: Date, ranges: AnnualLeave[]): boolean {
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (annualLeaveOn(d, ranges)) return true;
  }
  return false;
}
