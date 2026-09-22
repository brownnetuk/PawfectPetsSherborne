/// The reference-numbered Boarding & Day Care booking entity behind the
/// admin's Boarding & Day Care > Bookings tab -- a separate collection from
/// the calendar DayBooking rows. GET /boarding-bookings wraps each record
/// with its derived status and workflow stages (backend withStatus()).
class BoardingBooking {
  final String id;
  final String reference;
  final String customerId;
  final String customerName;
  final String customerEmail;
  final List<String> animalIds;
  final List<String> animalNames;
  final String type; // 'boarding' | 'dayCare'
  final DateTime startDate;
  final String dropOffTime;
  final DateTime endDate;
  final String pickUpTime;
  final String? notes;
  final bool invoiced;

  /// The linked invoice's id (booking.invoice may arrive populated or as a
  /// bare id) -- lets the detail screen open the invoice.
  final String? invoiceId;

  /// When the pre-check-in link was last emailed to the customer (null =
  /// never sent).
  final DateTime? preCheckInSentAt;

  // Completed workflow forms, by form-submission id -- set once the customer
  // (pre-check-in) or staff (check in/out) have filled each in.
  final String? preCheckInSubmission;
  final String? checkInSubmission;
  final String? checkOutSubmission;

  bool get isBoarding => type == 'boarding';

  BoardingBooking({
    required this.id,
    required this.reference,
    required this.customerId,
    required this.customerName,
    required this.customerEmail,
    required this.animalIds,
    required this.animalNames,
    required this.type,
    required this.startDate,
    required this.dropOffTime,
    required this.endDate,
    required this.pickUpTime,
    this.notes,
    required this.invoiced,
    this.invoiceId,
    this.preCheckInSentAt,
    this.preCheckInSubmission,
    this.checkInSubmission,
    this.checkOutSubmission,
  });

  factory BoardingBooking.fromJson(Map<String, dynamic> json) {
    final customer = json['customer'];
    final animals = (json['animals'] as List<dynamic>? ?? []);
    final invoice = json['invoice'];
    return BoardingBooking(
      id: json['_id'] as String,
      reference: json['reference'] as String? ?? '',
      customerId: customer is Map<String, dynamic> ? (customer['_id'] as String? ?? '') : (customer as String? ?? ''),
      customerName: customer is Map<String, dynamic> ? (customer['name'] as String? ?? '') : '',
      customerEmail: customer is Map<String, dynamic> ? (customer['email'] as String? ?? '') : '',
      animalIds: animals
          .whereType<Map<String, dynamic>>()
          .map((a) => a['_id'] as String? ?? '')
          .where((v) => v.isNotEmpty)
          .toList(),
      animalNames: animals
          .whereType<Map<String, dynamic>>()
          .map((a) => a['name'] as String? ?? '')
          .where((n) => n.isNotEmpty)
          .toList(),
      type: json['type'] as String? ?? 'boarding',
      startDate: DateTime.parse(json['startDate'] as String),
      dropOffTime: json['dropOffTime'] as String? ?? '',
      endDate: DateTime.parse(json['endDate'] as String),
      pickUpTime: json['pickUpTime'] as String? ?? '',
      notes: json['notes'] as String?,
      invoiced: invoice != null,
      invoiceId: invoice is Map<String, dynamic> ? invoice['_id'] as String? : invoice as String?,
      preCheckInSentAt:
          json['preCheckInSentAt'] != null ? DateTime.tryParse(json['preCheckInSentAt'] as String) : null,
      preCheckInSubmission: json['preCheckInSubmission'] as String?,
      checkInSubmission: json['checkInSubmission'] as String?,
      checkOutSubmission: json['checkOutSubmission'] as String?,
    );
  }
}

/// One step of the booking workflow (quote -> confirmed -> invoice raised ->
/// payment received -> pre-check-in -> checked in -> in progress ->
/// checked out -> invoice paid).
class BoardingStage {
  final String key;
  final String label;
  final bool done;
  final bool current;
  final String? sub;

  BoardingStage({required this.key, required this.label, required this.done, required this.current, this.sub});

  factory BoardingStage.fromJson(Map<String, dynamic> json) => BoardingStage(
        key: json['key'] as String? ?? '',
        label: json['label'] as String? ?? '',
        done: json['done'] as bool? ?? false,
        current: json['current'] as bool? ?? false,
        sub: json['sub'] as String?,
      );
}

class BoardingBookingWithStatus {
  final BoardingBooking booking;
  final String status; // e.g. 'Confirmed', 'In Progress' -- see BOOKING_STATUS_LABELS
  final List<BoardingStage> stages;

  BoardingBookingWithStatus({required this.booking, required this.status, required this.stages});

  factory BoardingBookingWithStatus.fromJson(Map<String, dynamic> json) => BoardingBookingWithStatus(
        booking: BoardingBooking.fromJson(json['booking'] as Map<String, dynamic>),
        status: json['status'] as String? ?? 'Confirmed',
        stages: (json['stages'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(BoardingStage.fromJson)
            .toList(),
      );
}
