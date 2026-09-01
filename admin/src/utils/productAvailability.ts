import type { BankHoliday, Product, ProductAvailability } from '../types';

export const AVAILABILITY_LABELS: Record<ProductAvailability, string> = {
  weekday: 'Weekday',
  weekend: 'Weekend',
  bank_holiday: 'Bank Holiday',
};

function dateKeyOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Bank holidays take priority over the plain weekday/weekend split -- a bank
// holiday that falls on a weekday (e.g. Christmas Day) is still a bank
// holiday for scheduling purposes, not an ordinary weekday.
export function dayTypeFor(date: Date, bankHolidays: BankHoliday[]): ProductAvailability {
  const key = dateKeyOf(date);
  // h.date is a UTC ISO string (e.g. a local midnight stored by the server
  // ends up as "...T23:00:00.000Z" for BST) -- comparing its raw slice(0,10)
  // would silently compare the wrong calendar day. Parse it back into a Date
  // first so the local getters undo that offset, same as everywhere else in
  // this codebase that round-trips a server date (e.g. BookingsPage's own
  // isSameDay).
  if (bankHolidays.some((h) => dateKeyOf(new Date(h.date)) === key)) return 'bank_holiday';
  const day = date.getDay();
  return day === 0 || day === 6 ? 'weekend' : 'weekday';
}

// Returns a warning message if the product's configured availability doesn't
// match the given date, or null if there's no restriction (or it matches).
export function availabilityMismatch(product: Product, date: Date, bankHolidays: BankHoliday[]): string | null {
  if (!product.availability) return null;
  const actual = dayTypeFor(date, bankHolidays);
  if (actual === product.availability) return null;
  return `${product.name} is set to only be used on a ${AVAILABILITY_LABELS[product.availability]}, but this date is a ${AVAILABILITY_LABELS[actual]}.`;
}
