import 'package:flutter_test/flutter_test.dart';
import 'package:pawfectpets_staff/models/customer.dart';
import 'package:pawfectpets_staff/models/day_booking.dart';
import 'package:pawfectpets_staff/models/product.dart';
import 'package:pawfectpets_staff/utils/customer_pricing.dart';
import 'package:pawfectpets_staff/utils/travel_lines.dart';

// Customer Defaults > Pricing Override: the customer's own price replaces the
// standard one on their invoices, quotes and revenue figures.
void main() {
  final customer = Customer.fromJson({
    '_id': 'c1',
    'name': 'Alan Derrick',
    'email': 'alan@example.com',
    'travelChargeable': true,
    'travelProduct': 'travel',
    'pricingOverrides': [
      {'product': 'walk', 'price': 12.5},
      {'product': {'_id': 'travel'}, 'price': 2},
    ],
  });
  final walk = Product(id: 'walk', productCode: 'W', name: 'Walk', price: 15);
  final visit = Product(id: 'visit', productCode: 'V', name: 'Visit', price: 18);
  final travel = Product(id: 'travel', productCode: 'T', name: 'Travel', price: 3);

  test('parses overrides from the customer JSON', () {
    expect(customer.pricingOverrides, {'walk': 12.5, 'travel': 2.0});
    final none = Customer.fromJson({'_id': 'c2', 'name': 'B', 'email': 'b@example.com'});
    expect(none.pricingOverrides, isEmpty);
  });

  test('prices the catalogue for the customer', () {
    final priced = productsForCustomer(customer, [walk, visit]);
    expect(priced.map((p) => p.price), [12.5, 18]);
    expect(productsForCustomer(null, [walk]).single.price, 15);
  });

  test('travel product uses the override', () {
    expect(travelProductForCustomer(customer, [walk, travel])!.price, 2);
  });

  test('booked rows use the override', () {
    final row = DayBooking(
      id: 'b1',
      animalId: 'a1',
      animalName: 'Rex',
      species: 'dog',
      customerId: 'c1',
      customerName: 'Alan',
      date: DateTime(2026, 11, 23),
      productId: 'walk',
      productName: 'Walk',
      productPrice: 15,
      quantity: 2,
    );
    expect(bookingUnitPrice(customer, row), 12.5);
    expect(bookingLineTotal(customer, row), 25);
    expect(bookingLineTotal(null, row), 30);
  });
}
