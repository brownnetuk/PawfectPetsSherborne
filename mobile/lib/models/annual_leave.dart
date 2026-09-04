/// A staff annual-leave range (set in the admin app). The Bookings calendar
/// blocks these days out so nothing can be scheduled on them.
class AnnualLeave {
  final String id;
  final String name;
  final DateTime startDate;
  final DateTime endDate;

  AnnualLeave({
    required this.id,
    required this.name,
    required this.startDate,
    required this.endDate,
  });

  factory AnnualLeave.fromJson(Map<String, dynamic> json) => AnnualLeave(
        id: json['_id'] as String,
        name: json['name'] as String? ?? '',
        // Stored as local-midnight serialised to UTC — convert back to local so
        // it buckets to the intended calendar day (same round-trip used for
        // DayBooking/Appointment dates).
        startDate: DateTime.parse(json['startDate'] as String).toLocal(),
        endDate: DateTime.parse(json['endDate'] as String).toLocal(),
      );
}
