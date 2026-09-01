import { AVAILABILITY_LABELS, dayTypeFor } from './productAvailability';
import type { BankHoliday, ProductAvailability, VisitMapping } from '../types';

export type VisitCount = '1' | '2';

// Maps (visit count, day type) onto the matching VisitMapping field --
// Settings > Bookings > Visits is where staff configure which product each
// combination uses. Shared by NewBookingModal (Bookings page) and
// DocumentFormModal's embedded Visits section (quotes).
const MAPPING_KEY: Record<VisitCount, Record<ProductAvailability, keyof VisitMapping>> = {
  '1': {
    weekday: 'oneVisitWeekdayProduct',
    weekend: 'oneVisitWeekendProduct',
    bank_holiday: 'oneVisitBankHolidayProduct',
  },
  '2': {
    weekday: 'twoVisitWeekdayProduct',
    weekend: 'twoVisitWeekendProduct',
    bank_holiday: 'twoVisitBankHolidayProduct',
  },
};

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export interface VisitPlanDay {
  date: Date;
  productId: string;
}

export interface VisitPlanResult {
  plan: VisitPlanDay[];
  /** Human-readable "N Visit (Day Type)" labels for any combination with no product configured. */
  missing: string[];
}

/**
 * Builds the day-by-day product plan for a date range: the first/last day
 * use visitsFirstDay/visitsLastDay, every day between uses visitsPerDay
 * (irrelevant for a single-day range, where the first-day count applies).
 * Returns `missing` instead of a product for any day whose (count, day type)
 * combination has no product configured in Settings > Bookings > Visits.
 */
export function buildVisitPlan(
  start: Date,
  end: Date,
  visitsPerDay: VisitCount,
  visitsFirstDay: VisitCount,
  visitsLastDay: VisitCount,
  mapping: VisitMapping,
  bankHolidays: BankHoliday[],
): VisitPlanResult {
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const plan: VisitPlanDay[] = [];
  const missing = new Set<string>();
  days.forEach((date, i) => {
    const visits: VisitCount =
      days.length === 1 ? visitsFirstDay : i === 0 ? visitsFirstDay : i === days.length - 1 ? visitsLastDay : visitsPerDay;
    const dayType = dayTypeFor(date, bankHolidays);
    const productId = mapping[MAPPING_KEY[visits][dayType]];
    if (!productId) {
      missing.add(`${visits} Visit (${AVAILABILITY_LABELS[dayType]})`);
    } else {
      plan.push({ date, productId });
    }
  });

  return { plan, missing: Array.from(missing) };
}
