import type { Customer, LineItem, Product } from '../types';

// Settings > Customer Defaults > Travel: a travel-chargeable customer pays one
// travel per unit of every other catalog product on the invoice (1 x Visit ->
// 1 x Travel, 2 x Visit -> 2 x Travel). Freeform lines that don't match a
// product name (discounts, notes) don't count.
export function travelProductForCustomer(customer: Customer | undefined, products: Product[]): Product | null {
  if (!customer?.travelChargeable || !customer.travelProduct) return null;
  return products.find((p) => p._id === customer.travelProduct) ?? null;
}

export function travelQuantityFor(lineItems: LineItem[], travel: Product, products: Product[]): number {
  const productNames = new Set(products.map((p) => p.name));
  return lineItems
    .filter((item) => item.description !== travel.name && productNames.has(item.description))
    .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
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

export function applyTravelLine(lineItems: LineItem[], travel: Product | null, products: Product[]): LineItem[] {
  if (!travel) return lineItems;
  return withTravelQuantity(lineItems, travel, travelQuantityFor(lineItems, travel, products));
}
