// Customer Defaults > Pricing Override: a customer can have their own unit
// price for a product. Anywhere a product's price is copied onto that
// customer's invoice or quote, use this instead of product.price.
export interface PricingOverrideLike {
  product: unknown;
  price: number;
}

const idOf = (v: unknown) => String((v as { _id?: unknown })?._id ?? v);

export function overridePrice(
  overrides: PricingOverrideLike[] | undefined | null,
  productId: unknown,
  standardPrice: number,
): number {
  if (!overrides || productId == null) return standardPrice;
  const pid = idOf(productId);
  const match = overrides.find((o) => idOf(o.product) === pid);
  return match && Number.isFinite(match.price) ? match.price : standardPrice;
}
