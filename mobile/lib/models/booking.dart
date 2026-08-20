import 'customer.dart';

const bookingStatuses = ['requested', 'confirmed', 'in_progress', 'completed', 'cancelled'];

class Booking {
  final String id;
  final CustomerRef customer;
  final List<String> animalNames;
  final String serviceType;
  final DateTime startDate;
  final DateTime endDate;
  final String status;
  final String? notes;
  final double? price;

  Booking({
    required this.id,
    required this.customer,
    required this.animalNames,
    required this.serviceType,
    required this.startDate,
    required this.endDate,
    required this.status,
    this.notes,
    this.price,
  });

  factory Booking.fromJson(Map<String, dynamic> json) {
    final animalsRaw = json['animals'] as List<dynamic>? ?? [];
    final names = animalsRaw.map((a) {
      if (a is String) return a;
      final m = a as Map<String, dynamic>;
      return m['name'] as String? ?? '';
    }).toList();

    return Booking(
      id: json['_id'] as String,
      customer: CustomerRef.fromDynamic(json['customer']),
      animalNames: names,
      serviceType: json['serviceType'] as String? ?? '',
      startDate: DateTime.parse(json['startDate'] as String),
      endDate: DateTime.parse(json['endDate'] as String),
      status: json['status'] as String? ?? 'requested',
      notes: json['notes'] as String?,
      price: (json['price'] as num?)?.toDouble(),
    );
  }
}
