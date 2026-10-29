import { bookingDueDate, termDueDate } from './term-due-date';

describe('termDueDate', () => {
  const issued = new Date(2026, 9, 28); // Wed 28 Oct 2026

  it('uses the last working day of the issue month for an end-of-month term', () => {
    expect(termDueDate(issued, { endOfMonth: true })).toBe('2026-10-30'); // 31st is a Saturday
  });

  it('adds plusDays, or 14 days with no term', () => {
    expect(termDueDate(issued, { plusDays: 7 })).toBe('2026-11-04');
    expect(termDueDate(issued, undefined)).toBe('2026-11-11');
  });
});

describe('bookingDueDate', () => {
  const issued = new Date(2026, 9, 28);
  const endOfMonth = { endOfMonth: true };

  it('follows the term when the bookings ended before the invoice was raised', () => {
    // INV00040: issued 28/10 for bookings up to 26/10 was due 26/10.
    expect(bookingDueDate(issued, endOfMonth, '2026-10-26')).toBe('2026-10-30');
  });

  it('is due on the last booked day when that is later than the term', () => {
    expect(bookingDueDate(issued, endOfMonth, '2026-12-03')).toBe('2026-12-03');
  });

  it('is just the term date with no booking', () => {
    expect(bookingDueDate(issued, endOfMonth)).toBe('2026-10-30');
  });
});
