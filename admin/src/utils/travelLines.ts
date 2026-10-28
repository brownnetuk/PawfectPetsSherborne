import type { Customer, DayBooking, LineItem, Product, VisitMapping } from '../types';
import { visitCountForProduct } from './visitMapping';

// Settings > Customer Defaults > Travel: a travel-chargeable customer pays
// travel on Visits only -- one per 1 x Visit, two per 2 x Visit (per day).
// Walks can carry travel too, by the same rule (one per walk), but only when
// staff opt in. Boarding and Day Care never do.
export function travelProductForCustomer(customer: Customer | undefined, products: Product[]): Product | null {
  if (!customer?.travelChargeable || !customer.travelProduct) return null;
  return products.find((p) => p._id === customer.travelProduct) ?? null;
}

function productIdOf(product: DayBooking['product']): string {
  return typeof product === 'string' ? product : product._id;
}

function isBoardingOrDayCareProduct(mapping: VisitMapping, productId: string): boolean {
  return [
    mapping.dayCareHalfDayProduct,
    mapping.dayCareFullDayProduct,
    mapping.dayCareSecondDogHalfDayProduct,
    mapping.dayCareSecondDogFullDayProduct,
    mapping.boardingPerDayProduct,
    mapping.boardingSecondDogPerDayProduct,
    mapping.boardingHalfDayProduct,
    mapping.boardingSecondDogHalfDayProduct,
  ].includes(productId);
}

export interface TravelUnits {
  // From Visits-mapping products: quantity x 1 or 2 visits a day.
  visits: number;
  // From Walks (anything that isn't a Visit, Day Care, Boarding or travel).
  walks: number;
}

// Counts travel units straight from the bookings, ignoring any travel rows
// that were booked alongside them.
export function travelUnitsForBookings(bookings: DayBooking[], mapping: VisitMapping, travel: Product): TravelUnits {
  const units: TravelUnits = { visits: 0, walks: 0 };
  for (const b of bookings) {
    if (b.placeholder || b.boardingStay) continue;
    const pid = productIdOf(b.product);
    if (pid === travel._id || isBoardingOrDayCareProduct(mapping, pid)) continue;
    const quantity = Number(b.quantity) || 0;
    const visitCount = visitCountForProduct(mapping, pid);
    if (visitCount) units.visits += quantity * visitCount;
    else units.walks += quantity;
  }
  return units;
}

// The same Visit count from an invoice's Item Table, matching lines to
// products by name (Walks aren't counted -- they're opt-in at generation).
export function visitTravelQuantityFor(lineItems: LineItem[], mapping: VisitMapping, products: Product[]): number {
  const productByName = new Map(products.map((p) => [p.name, p]));
  return lineItems.reduce((sum, item) => {
    const product = productByName.get(item.description);
    const visitCount = product ? visitCountForProduct(mapping, product._id) : null;
    return sum + (visitCount ? (Number(item.quantity) || 0) * visitCount : 0);
  }, 0);
}

export function travelQuantityIn(lineItems: LineItem[], travel: Product): number {
  return Number(lineItems.find((item) => item.description === travel.name)?.quantity) || 0;
}

// Sets the travel line to `quantity` -- adding it if missing, removing it at 0.
export function withTravelQuantity(lineItems: LineItem[], travel: Product, quantity: number): LineItem[] {
  const idx = lineItems.findIndex((item) => item.description === travel.name);
  if (quantity <= 0) return idx >= 0 ? lineItems.filter((_, i) => i !== idx) : lineItems;
  if (idx >= 0) {
    if (lineItems[idx].quantity === quantity) return lineItems;
    return lineItems.map((item, i) => (i === idx ? { ...item, quantity } : item));
  }
  return [...lineItems, { description: travel.name, quantity, unitPrice: travel.price, discountPercent: 0 }];
}
