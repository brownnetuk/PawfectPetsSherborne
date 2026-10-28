import 'package:flutter_test/flutter_test.dart';
import 'package:pawfectpets_staff/models/day_booking.dart';
import 'package:pawfectpets_staff/models/invoice.dart';
import 'package:pawfectpets_staff/models/product.dart';
import 'package:pawfectpets_staff/models/visit_mapping.dart';
import 'package:pawfectpets_staff/utils/travel_lines.dart';

// Travel is charged per Visit (1 or 2 a day), opt-in per Walk, and never for
// Day Care, Boarding or the travel rows booked alongside them -- the staff
// port of admin/src/utils/travelLines.ts.
void main() {
  final mapping = VisitMapping.fromJson({
    'oneVisitWeekdayProduct': 'visit1',
    'twoVisitWeekdayProduct': 'visit2',
    'dayCareFullDayProduct': 'daycare',
    'boardingPerDayProduct': 'boarding',
    'boardingHalfDayProduct': 'boardingHalf',
  });
  final travel = Product(id: 'travel', productCode: 'TRV', name: 'Travel', price: 3);

  DayBooking booking(String productId, {int quantity = 1, bool placeholder = false, bool boardingStay = false}) =>
      DayBooking(
        id: 'b-$productId-$quantity',
        animalId: 'a1',
        animalName: 'Rex',
        species: 'dog',
        customerId: 'c1',
        customerName: 'Jane',
        date: DateTime(2026, 10, 5),
        productId: productId,
        productName: productId,
        productPrice: 10,
        quantity: quantity,
        placeholder: placeholder,
        boardingStay: boardingStay,
      );

  test('counts visits per day and walks separately, ignoring travel, day care and boarding', () {
    final units = travelUnitsForBookings([
      booking('visit1', quantity: 2), // 2 days of one visit -> 2
      booking('visit2'), // one day of two visits -> 2
      booking('walk', quantity: 3), // walks -> 3 (opt-in)
      booking('travel', quantity: 4), // booked travel rows never count
      booking('daycare'),
      booking('boarding'),
      booking('boardingHalf'),
      booking('boarding', boardingStay: true),
      booking('visit1', placeholder: true),
    ], mapping, travel);
    expect(units.visits, 4);
    expect(units.walks, 3);
  });

  test('withTravelQuantity adds, replaces in place, and removes at zero', () {
    final base = [
      InvoiceLineItem(description: 'Walk', quantity: 2, unitPrice: 12),
      InvoiceLineItem(description: 'Travel', quantity: 9, unitPrice: 3),
      InvoiceLineItem(description: 'Visit', quantity: 1, unitPrice: 10),
    ];
    final replaced = withTravelQuantity(base, travel, 1);
    expect(replaced.map((l) => l.description), ['Walk', 'Travel', 'Visit']);
    expect(replaced[1].quantity, 1);

    final removed = withTravelQuantity(base, travel, 0);
    expect(removed.map((l) => l.description), ['Walk', 'Visit']);

    final added = withTravelQuantity(removed, travel, 2);
    expect(added.last.description, 'Travel');
    expect(added.last.quantity, 2);
    expect(added.last.unitPrice, 3);
    expect(lineItemsTotal(added), 2 * 12 + 1 * 10 + 2 * 3);
  });
}
