import '../models/customer.dart';
import '../models/day_booking.dart';
import '../models/invoice.dart';
import '../models/product.dart';
import '../models/visit_mapping.dart';

/// Staff-app port of admin/src/utils/travelLines.ts.
///
/// Customer Defaults > Travel has two settings sharing one travel product:
/// Travel Chargeable for Visits (`travelChargeable`) -- one per 1 x Visit, two
/// per 2 x Visit (per day) -- and Travel Chargeable for Walks
/// (`travelChargeableWalks`) -- one per dog walk. Day Care and Boarding never
/// carry travel, whatever travel rows were booked alongside them.

bool _hasTravelProduct(Customer customer) =>
    customer.travelProductId != null && customer.travelProductId!.isNotEmpty;

bool chargesVisitTravel(Customer? customer) =>
    customer != null && customer.travelChargeable && _hasTravelProduct(customer);

bool chargesWalkTravel(Customer? customer) =>
    customer != null && customer.travelChargeableWalks && _hasTravelProduct(customer);

/// The customer's travel product, when either travel setting is on and it's
/// still in the catalogue.
Product? travelProductForCustomer(Customer? customer, Iterable<Product> products) {
  if (!chargesVisitTravel(customer) && !chargesWalkTravel(customer)) return null;
  final id = customer!.travelProductId;
  for (final p in products) {
    if (p.id == id) return p;
  }
  return null;
}

/// How many travel lines the customer pays for [units].
int travelQuantityForCustomer(Customer? customer, TravelUnits units) =>
    (chargesVisitTravel(customer) ? units.visits : 0) + (chargesWalkTravel(customer) ? units.walks : 0);

/// How much travel a set of bookings would charge, counted from the bookings
/// themselves (booked travel rows are ignored).
class TravelUnits {
  /// From Visits-mapping products: quantity x 1 or 2 visits a day.
  final int visits;

  /// From Walks (anything that isn't a Visit, Day Care, Boarding or travel).
  final int walks;

  const TravelUnits({this.visits = 0, this.walks = 0});
}

/// Day Care and Boarding products, which never carry travel.
bool isBoardingOrDayCareProduct(VisitMapping mapping, String productId) =>
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
    if (pid == travel.id || isBoardingOrDayCareProduct(mapping, pid)) continue;
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
    // Nothing to remove when there's no travel line. (Written as two
    // statements on purpose: `a ? b : c..removeAt(i)` cascades on the whole
    // conditional, so with no travel line it called removeAt(-1) and threw,
    // which broke Generate Invoices for every travel-chargeable customer.)
    if (index < 0) return lineItems;
    return [...lineItems]..removeAt(index);
  }
  final line = InvoiceLineItem(description: travel.name, quantity: quantity.toDouble(), unitPrice: travel.price);
  if (index < 0) return [...lineItems, line];
  final out = [...lineItems];
  out[index] = line;
  return out;
}

double lineItemsTotal(Iterable<InvoiceLineItem> lineItems) =>
    lineItems.fold<double>(0, (s, li) => s + li.quantity * li.unitPrice);
