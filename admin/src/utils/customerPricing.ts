import type { Customer, PricingOverride, Product } from '../types';

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

export function hasPriceOverride(customer: CustomerLike, productId: string): boolean {
  return !!customer?.pricingOverrides?.some((o) => o.product === productId);
}
