import type { Customer, DayBooking, PricingOverride, Product } from '../types';

// Customer Defaults > Pricing Override: the customer's own unit price for a
// product, used instead of product.price whenever that product is added to
// their invoices or quotes. Mirrors backend customers/pricing-override.util.ts.
type CustomerLike = Pick<Customer, 'pricingOverrides'> | null | undefined;

export function customerPrice(
  customer: CustomerLike,
  product: Pick<Product, '_id' | 'price'>,
): number {
  const match = customer?.pricingOverrides?.find((o: PricingOverride) => o.product === product._id);
  return match && Number.isFinite(match.price) ? match.price : product.price;
}

// A booked row's unit price for its customer: their override for the row's
// product, else the product's standard price (populated, or looked up in
// `products` when the row only carries the product id).
export function bookingUnitPrice(
  booking: Pick<DayBooking, 'product' | 'customer'>,
  customerById: Map<string, Customer>,
  products?: Product[],
): number {
  if (!booking.product) return 0;
  const productId = typeof booking.product === 'string' ? booking.product : booking.product._id;
  const standard =
    typeof booking.product === 'string'
      ? (products?.find((p) => p._id === productId)?.price ?? 0)
      : booking.product.price;
  const customerId = !booking.customer
    ? ''
    : typeof booking.customer === 'string'
      ? booking.customer
      : booking.customer._id;
  return customerPrice(customerById.get(customerId), { _id: productId, price: Number(standard) || 0 });
}

export function customersById(customers: Customer[] | null | undefined): Map<string, Customer> {
  return new Map((customers ?? []).map((c) => [c._id, c]));
}

export function hasPriceOverride(customer: CustomerLike, productId: string): boolean {
  return !!customer?.pricingOverrides?.some((o) => o.product === productId);
}
