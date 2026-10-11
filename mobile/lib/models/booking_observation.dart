/// A timestamped care note staff add against a Boarding & Day Care booking
/// (mirrors backend booking-observation.schema.ts).
class BookingObservation {
  static const categories = ['Toilet', 'Play', 'Medication', 'Feed', 'Groom', 'General'];
  static const maxPhotos = 5;

  final String id;
  final DateTime observedAt;
  final String category;
  final String? description;
  final List<String> photos;
  final String observedBy;

  BookingObservation({
    required this.id,
    required this.observedAt,
    required this.category,
    this.description,
    this.photos = const [],
    required this.observedBy,
  });

  factory BookingObservation.fromJson(Map<String, dynamic> json) => BookingObservation(
        id: json['_id'] as String,
        observedAt: DateTime.parse(json['observedAt'] as String).toLocal(),
        category: json['category'] as String? ?? 'General',
        description: json['description'] as String?,
        photos: (json['photos'] as List<dynamic>? ?? []).whereType<String>().toList(),
        observedBy: json['observedBy'] as String? ?? '',
      );
}
