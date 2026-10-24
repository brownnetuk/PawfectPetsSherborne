import type { VisitMapping } from '../types';

import { VISIT_DURATIONS, visitMappingKey } from './visitPlan';
import type { VisitCount, VisitDuration } from './visitPlan';

const DAY_TYPES = ['weekday', 'weekend', 'bank_holiday'] as const;

function visitProductIds(mapping: VisitMapping, visits: VisitCount, durations = VISIT_DURATIONS): Set<string> {
  const ids = durations.flatMap((duration) => DAY_TYPES.map((dayType) => mapping[visitMappingKey(visits, duration, dayType)]));
  return new Set(ids.filter((id): id is string => !!id));
}

// Which of the Settings > Bookings > Visits product slots (1 or 2 visits, at
// any length) a given product id belongs to, if any -- used to tell a
// "Visit" entry (Bookings page's Visits section) apart from an ordinary
// "Walk" entry (anything else).
export function oneVisitProductIds(mapping: VisitMapping): Set<string> {
  return visitProductIds(mapping, '1');
}

export function twoVisitProductIds(mapping: VisitMapping): Set<string> {
  return visitProductIds(mapping, '2');
}

/** The visit length a Visits-mapping product is set up for, defaulting to 20 for anything else. */
export function visitDurationForProduct(mapping: VisitMapping, productId: string): VisitDuration {
  return (
    VISIT_DURATIONS.find(
      (d) => visitProductIds(mapping, '1', [d]).has(productId) || visitProductIds(mapping, '2', [d]).has(productId),
    ) ?? '20'
  );
}

export function isVisitProduct(mapping: VisitMapping, productId: string): boolean {
  return oneVisitProductIds(mapping).has(productId) || twoVisitProductIds(mapping).has(productId);
}

/** 1 or 2 if productId is one of the Visits-mapping products, else null (an ordinary Walk product). */
export function visitCountForProduct(mapping: VisitMapping, productId: string): 1 | 2 | null {
  if (oneVisitProductIds(mapping).has(productId)) return 1;
  if (twoVisitProductIds(mapping).has(productId)) return 2;
  return null;
}

export function isDayCareProduct(mapping: VisitMapping, productId: string): boolean {
  return productId === mapping.dayCareHalfDayProduct || productId === mapping.dayCareFullDayProduct;
}

export function isBoardingProduct(mapping: VisitMapping, productId: string): boolean {
  return productId === mapping.boardingPerDayProduct;
}

// AM drop-off + PM collection is the only combination that means the dog is
// there across midday -- anything else (AM/AM, PM/AM, PM/PM) is a shorter
// stay, so Half Day covers it. Returns the configured product id, or null if
// that slot has no product set in Settings > Bookings > Day Care.
export function dayCareProductFor(
  mapping: VisitMapping,
  dropOffPeriod: 'AM' | 'PM',
  collectionPeriod: 'AM' | 'PM',
): string | null {
  const isFullDay = dropOffPeriod === 'AM' && collectionPeriod === 'PM';
  return (isFullDay ? mapping.dayCareFullDayProduct : mapping.dayCareHalfDayProduct) ?? null;
}
