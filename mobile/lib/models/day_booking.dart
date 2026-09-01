/// A single day's scheduling unit: one dog, one day, one product, a quantity.
/// Mirrors the backend DayBooking (separate from the date-range [Booking]).
class DayBooking {
  final String id;
  final String animalId;
  final String animalName;
  final String species;
  final String customerId;
  final String customerName;
  final DateTime date;
  final String productId;
  final String productName;
  final double productPrice;
  final int quantity;

  DayBooking({
    required this.id,
    required this.animalId,
    required this.animalName,
    required this.species,
    required this.customerId,
    required this.customerName,
    required this.date,
    required this.productId,
    required this.productName,
    required this.productPrice,
    required this.quantity,
  });

  double get lineTotal => productPrice * quantity;

  factory DayBooking.fromJson(Map<String, dynamic> json) {
    final animal = json['animal'];
    final customer = json['customer'];
    final product = json['product'];
    String idOf(dynamic v) =>
        v is Map<String, dynamic> ? (v['_id'] as String? ?? '') : (v as String? ?? '');
    return DayBooking(
      id: json['_id'] as String,
      animalId: idOf(animal),
      animalName: animal is Map<String, dynamic> ? (animal['name'] as String? ?? '') : '',
      species: animal is Map<String, dynamic> ? (animal['species'] as String? ?? '') : '',
      customerId: idOf(customer),
      customerName: customer is Map<String, dynamic> ? (customer['name'] as String? ?? '') : '',
      date: DateTime.parse(json['date'] as String),
      productId: idOf(product),
      productName: product is Map<String, dynamic> ? (product['name'] as String? ?? '') : '',
      productPrice: product is Map<String, dynamic> ? (product['price'] as num?)?.toDouble() ?? 0 : 0,
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
    );
  }
}

/// Lightweight animal reference for the bookings calendar's "Add dog" and
/// "Recommended" lists: just what's needed to schedule one and find its owner.
class AnimalRef {
  final String id;
  final String name;
  final String species;
  final String customerId;

  AnimalRef({
    required this.id,
    required this.name,
    required this.species,
    required this.customerId,
  });

  factory AnimalRef.fromJson(Map<String, dynamic> json) {
    final customer = json['customer'];
    return AnimalRef(
      id: json['_id'] as String,
      name: json['name'] as String? ?? '',
      species: json['species'] as String? ?? '',
      customerId: customer is Map<String, dynamic>
          ? (customer['_id'] as String? ?? '')
          : (customer as String? ?? ''),
    );
  }
}
