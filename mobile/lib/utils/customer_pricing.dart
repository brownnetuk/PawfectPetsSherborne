import '../models/customer.dart';
import '../models/day_booking.dart';
import '../models/product.dart';

/// Staff-app port of admin/src/utils/customerPricing.ts.
///
/// Customer Defaults > Pricing Override: the customer's own unit price for a
/// product, used instead of the standard price whenever that product goes onto
/// their invoices or quotes, and in revenue figures.

/// The price [customer] pays for [productId], or [standardPrice] if they have
/// no override for it.
double customerPriceFor(Customer? customer, String productId, double standardPrice) =>
    customer?.pricingOverrides[productId] ?? standardPrice;

/// [product] priced for [customer].
Product pricedForCustomer(Customer? customer, Product product) {
  final price = customerPriceFor(customer, product.id, product.price);
  if (price == product.price) return product;
  return Product(
    id: product.id,
    productCode: product.productCode,
    name: product.name,
    description: product.description,
    price: price,
    availability: product.availability,
    displayInPriceList: product.displayInPriceList,
  );
}

/// The catalogue as [customer] pays for it.
List<Product> productsForCustomer(Customer? customer, List<Product> products) =>
    customer == null || customer.pricingOverrides.isEmpty
        ? products
        : [for (final p in products) pricedForCustomer(customer, p)];

/// A booked row's unit price for its customer.
double bookingUnitPrice(Customer? customer, DayBooking booking) =>
    customerPriceFor(customer, booking.productId, booking.productPrice);

/// A booked row's total for its customer (placeholders are free).
double bookingLineTotal(Customer? customer, DayBooking booking) =>
    booking.placeholder ? 0 : bookingUnitPrice(customer, booking) * booking.quantity;
