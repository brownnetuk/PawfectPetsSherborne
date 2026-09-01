/// A standalone (non-animal) calendar entry — e.g. a call or meeting with a
/// customer. Shown as a blue entry on the bookings calendar.
class Appointment {
  final String id;
  final String customerId;
  final String customerName;
  final String reason;
  final DateTime date;
  final String time; // 'HH:mm'

  Appointment({
    required this.id,
    required this.customerId,
    required this.customerName,
    required this.reason,
    required this.date,
    required this.time,
  });

  factory Appointment.fromJson(Map<String, dynamic> json) {
    final customer = json['customer'];
    return Appointment(
      id: json['_id'] as String,
      customerId: customer is Map<String, dynamic>
          ? (customer['_id'] as String? ?? '')
          : (customer as String? ?? ''),
      customerName: customer is Map<String, dynamic> ? (customer['name'] as String? ?? '') : '',
      reason: json['reason'] as String? ?? '',
      // Stored as a day at local (server) midnight and serialised as UTC —
      // convert to local so the calendar day matches what was booked (a
      // server on BST would otherwise read back as the previous day).
      date: DateTime.parse(json['date'] as String).toLocal(),
      time: json['time'] as String? ?? '',
    );
  }
}
