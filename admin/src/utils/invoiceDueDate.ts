import type { InvoiceTerm } from '../types';

// Due dates are plain 'YYYY-MM-DD' keys built from local date parts, so they
// can be compared as strings and never shift a day across a timezone.
function ymd(d: Date): string {
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

/** The due date a payment term gives an invoice issued on `issueDate` (the issue date itself if no term). */
export function termDueDate(issueDate: Date, term: InvoiceTerm | undefined): string {
  if (term?.endOfMonth) return ymd(lastWorkingDayOfMonth(issueDate));
  if (typeof term?.plusDays === 'number') {
    const d = new Date(issueDate);
    d.setDate(d.getDate() + term.plusDays);
    return ymd(d);
  }
  return ymd(issueDate);
}

/**
 * Due date for an invoice raised for bookings: the last booked date it covers,
 * but never earlier than its payment term allows. An invoice raised ahead of
 * the bookings falls due on the last of them; one raised after them (e.g. the
 * end-of-month run) follows the term instead of being due before it was issued.
 */
export function bookingInvoiceDueDate(issueDate: Date, term: InvoiceTerm | undefined, lastBookedDate?: string): string {
  const byTerm = termDueDate(issueDate, term);
  return lastBookedDate && lastBookedDate > byTerm ? lastBookedDate : byTerm;
}
