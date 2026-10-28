import '../models/customer.dart';
import '../models/day_booking.dart';
import '../models/invoice.dart';
import '../models/product.dart';
import '../models/visit_mapping.dart';

/// Staff-app port of admin/src/utils/travelLines.ts.
///
/// Settings > Customer Defaults > Travel: a travel-chargeable customer pays
/// travel on Visits only -- one per 1 x Visit, two per 2 x Visit (per day).
/// Walks can carry travel too, by the same one-per-walk rule, but only when
/// staff opt in at invoicing time. Day Care and Boarding never do, whatever
/// travel rows were booked alongside them.

/// The customer's travel product, when they're travel-chargeable and it's
/// still in the catalogue.
Product? travelProductForCustomer(Customer? customer, Iterable<Product> products) {
  if (customer == null || !customer.travelChargeable) return null;
  final id = customer.travelProductId;
  if (id == null || id.isEmpty) return null;
  for (final p in products) {
    if (p.id == id) return p;
  }
  return null;
}

/// How much travel a set of bookings would charge, counted from the bookings
/// themselves (booked travel rows are ignored).
class TravelUnits {
  /// From Visits-mapping products: quantity x 1 or 2 visits a day.
  final int visits;

  /// From Walks (anything that isn't a Visit, Day Care, Boarding or travel).
  final int walks;

  const TravelUnits({this.visits = 0, this.walks = 0});
}

bool _isBoardingOrDayCare(VisitMapping mapping, String productId) =>
    mapping.isDayCareProduct(productId) ||
    mapping.isBoardingProduct(productId) ||
    productId == mapping.boardingHalfDay ||
    productId == mapping.boardingSecondDogHalfDay;

TravelUnits travelUnitsForBookings(Iterable<DayBooking> bookings, VisitMapping mapping, Product travel) {
  var visits = 0;
  var walks = 0;
  for (final b in bookings) {
    if (b.placeholder || b.boardingStay) continue;
    final pid = b.productId;
    if (pid == travel.id || _isBoardingOrDayCare(mapping, pid)) continue;
    final visitCount = mapping.visitCountForProduct(pid);
    if (visitCount != null) {
      visits += b.quantity * visitCount;
    } else {
      walks += b.quantity;
    }
  }
  return TravelUnits(visits: visits, walks: walks);
}

/// Sets the travel line (matched by the product's name, as the admin does)
/// to [quantity]: added at the end if missing, replaced in place if present,
/// removed at 0.
List<InvoiceLineItem> withTravelQuantity(List<InvoiceLineItem> lineItems, Product travel, int quantity) {
  final index = lineItems.indexWhere((li) => li.description == travel.name);
  if (quantity <= 0) {
    return index < 0 ? lineItems : [...lineItems]..removeAt(index);
  }
  final line = InvoiceLineItem(description: travel.name, quantity: quantity.toDouble(), unitPrice: travel.price);
  if (index < 0) return [...lineItems, line];
  final out = [...lineItems];
  out[index] = line;
  return out;
}

double lineItemsTotal(Iterable<InvoiceLineItem> lineItems) =>
    lineItems.fold<double>(0, (s, li) => s + li.quantity * li.unitPrice);
