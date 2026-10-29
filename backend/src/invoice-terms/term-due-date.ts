// Server-side twin of admin/src/utils/invoiceDueDate.ts. Dates are built and
// formatted from local date parts so a 'YYYY-MM-DD' never slips a day the way
// toISOString() can when the server isn't on UTC (e.g. BST).

export interface DueDateTerm {
  plusDays?: number | null;
  endOfMonth?: boolean;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * The due date a payment term gives an invoice issued on `issueDate`: the last
 * working day (weekends only) of the issue month for an end-of-month term,
 * otherwise issue date + plusDays, or + `fallbackDays` when the term has neither.
 */
export function termDueDate(issueDate: Date, term: DueDateTerm | null | undefined, fallbackDays = 14): string {
  if (term?.endOfMonth) {
    const lastDay = new Date(issueDate.getFullYear(), issueDate.getMonth() + 1, 0);
    const dow = lastDay.getDay(); // 0 = Sunday, 6 = Saturday
    if (dow === 0) lastDay.setDate(lastDay.getDate() - 2);
    else if (dow === 6) lastDay.setDate(lastDay.getDate() - 1);
    return ymd(lastDay);
  }
  const due = new Date(issueDate);
  due.setDate(due.getDate() + (term?.plusDays ?? fallbackDays));
  return ymd(due);
}

/**
 * Due date for an invoice billing a booking: its last booked day, but never
 * earlier than the payment term allows -- so an invoice raised after the stay
 * isn't already due (or overdue) the moment it's issued.
 */
export function bookingDueDate(issueDate: Date, term: DueDateTerm | null | undefined, lastBookedDate?: string): string {
  const byTerm = termDueDate(issueDate, term);
  return lastBookedDate && lastBookedDate > byTerm ? lastBookedDate : byTerm;
}
