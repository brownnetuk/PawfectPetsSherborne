import type { Customer, DayBooking, LineItem, Product, VisitMapping } from '../types';
import { visitCountForProduct } from './visitMapping';

// Customer Defaults > Travel has two settings sharing one travel product:
// Travel Chargeable for Visits (`travelChargeable`) -- one per 1 x Visit, two
// per 2 x Visit (per day) -- and Travel Chargeable for Walks
// (`travelChargeableWalks`) -- one per dog walk, so 2 x Walk -> 2 x Travel.
// Boarding and Day Care never carry travel.
export function chargesVisitTravel(customer: Customer | undefined): boolean {
  return !!customer?.travelChargeable && !!customer.travelProduct;
}

export function chargesWalkTravel(customer: Customer | undefined): boolean {
  return !!customer?.travelChargeableWalks && !!customer.travelProduct;
}

// The customer's travel product, if either setting is on.
export function travelProductForCustomer(customer: Customer | undefined, products: Product[]): Product | null {
  if (!chargesVisitTravel(customer) && !chargesWalkTravel(customer)) return null;
  return products.find((p) => p._id === customer!.travelProduct) ?? null;
}

// How many travel lines the customer pays for these units.
export function travelQuantityForCustomer(customer: Customer | undefined, units: TravelUnits): number {
  return (chargesVisitTravel(customer) ? units.visits : 0) + (chargesWalkTravel(customer) ? units.walks : 0);
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

// The same counts from an invoice's Item Table, matching lines to products
// by name. Lines that aren't a catalogue product are left out.
export function travelUnitsForLineItems(
  lineItems: LineItem[],
  mapping: VisitMapping,
  products: Product[],
  travel: Product,
): TravelUnits {
  const productByName = new Map(products.map((p) => [p.name, p]));
  const units: TravelUnits = { visits: 0, walks: 0 };
  for (const item of lineItems) {
    const product = productByName.get(item.description);
    if (!product || product._id === travel._id || isBoardingOrDayCareProduct(mapping, product._id)) continue;
    const quantity = Number(item.quantity) || 0;
    const visitCount = visitCountForProduct(mapping, product._id);
    if (visitCount) units.visits += quantity * visitCount;
    else units.walks += quantity;
  }
  return units;
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
