import { AVAILABILITY_LABELS, dayTypeFor } from './productAvailability';
import type { BankHoliday, ProductAvailability, VisitMapping } from '../types';

export type VisitCount = '1' | '2';
export type VisitDuration = '20' | '30' | '40';
export const VISIT_DURATIONS: VisitDuration[] = ['20', '30', '40'];

const DAY_TYPE_SUFFIX: Record<ProductAvailability, string> = {
  weekday: 'Weekday',
  weekend: 'Weekend',
  bank_holiday: 'BankHoliday',
};

// Maps (visit count, length, day type) onto the matching VisitMapping field
// -- Settings > Bookings > Visits is where staff configure which product
// each combination uses. 20 minute visits are the original un-suffixed
// slots; 30/40 have a "30Min"/"40Min" infix, e.g. oneVisit30MinWeekdayProduct.
// Shared by NewBookingModal (Bookings page) and DocumentFormModal's embedded
// Visits section (quotes).
export function visitMappingKey(
  visits: VisitCount,
  duration: VisitDuration,
  dayType: ProductAvailability,
): keyof VisitMapping {
  const infix = duration === '20' ? '' : `${duration}Min`;
  return `${visits === '2' ? 'two' : 'one'}Visit${infix}${DAY_TYPE_SUFFIX[dayType]}Product` as keyof VisitMapping;
}

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

export type VisitTime = 'AM' | 'PM';

export interface VisitPlanDay {
  date: Date;
  productId: string;
  /** Only set for a single-visit first/last day -- everything else is left for on-the-fly inference. */
  visitTime?: VisitTime;
}

export interface VisitPlanResult {
  plan: VisitPlanDay[];
  /** Human-readable "N Visit, M mins (Day Type)" labels for any combination with no product configured. */
  missing: string[];
}

/**
 * Builds the day-by-day product plan for a date range: the first/last day
 * use visitsFirstDay/visitsLastDay, every day between uses visitsPerDay
 * (irrelevant for a single-day range, where the first-day count and AM/PM
 * apply). duration picks the 20/30/40 minute product set. amPmFirstDay/amPmLastDay are staff's explicit AM/PM override for
 * that boundary day, applied only when its own visit count is '1' (a
 * 2-visit day always covers both AM and PM regardless of this).
 * Returns `missing` instead of a product for any day whose (count, day type)
 * combination has no product configured in Settings > Bookings > Visits.
 */
export function buildVisitPlan(
  start: Date,
  end: Date,
  visitsPerDay: VisitCount,
  visitsFirstDay: VisitCount,
  visitsLastDay: VisitCount,
  duration: VisitDuration,
  mapping: VisitMapping,
  bankHolidays: BankHoliday[],
  amPmFirstDay: VisitTime = 'PM',
  amPmLastDay: VisitTime = 'AM',
): VisitPlanResult {
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const plan: VisitPlanDay[] = [];
  const missing = new Set<string>();
  days.forEach((date, i) => {
    const isFirst = i === 0;
    const isLast = i === days.length - 1;
    const visits: VisitCount = days.length === 1 ? visitsFirstDay : isFirst ? visitsFirstDay : isLast ? visitsLastDay : visitsPerDay;
    const dayType = dayTypeFor(date, bankHolidays);
    const productId = mapping[visitMappingKey(visits, duration, dayType)];
    if (!productId) {
      missing.add(`${visits} Visit, ${duration} mins (${AVAILABILITY_LABELS[dayType]})`);
      return;
    }
    let visitTime: VisitTime | undefined;
    if (visits === '1') {
      // A single-day range is both first and last -- the first-day choice
      // wins, same precedence buildVisitPlan already uses for its visit count.
      if (days.length === 1) visitTime = amPmFirstDay;
      else if (isFirst) visitTime = amPmFirstDay;
      else if (isLast) visitTime = amPmLastDay;
    }
    plan.push({ date, productId, visitTime });
  });

  return { plan, missing: Array.from(missing) };
}
