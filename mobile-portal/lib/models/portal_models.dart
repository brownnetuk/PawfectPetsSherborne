/// The customer's own details (GET /portal/me). Mirrors the curated shape the
/// backend returns — never any credentials.
class Profile {
  final String id;
  final String? firstName;
  final String? surname;
  final String name;
  final String email;
  final String? phoneNumber;
  final String? address1;
  final String? address2;
  final String? town;
  final String? county;
  final String? postcode;
  final String? address;

  Profile({
    required this.id,
    this.firstName,
    this.surname,
    required this.name,
    required this.email,
    this.phoneNumber,
    this.address1,
    this.address2,
    this.town,
    this.county,
    this.postcode,
    this.address,
  });

  factory Profile.fromJson(Map<String, dynamic> json) => Profile(
        id: json['id'] as String? ?? json['_id'] as String? ?? '',
        firstName: json['firstName'] as String?,
        surname: json['surname'] as String?,
        name: json['name'] as String? ?? '',
        email: json['email'] as String? ?? '',
        phoneNumber: json['phoneNumber'] as String?,
        address1: json['address1'] as String?,
        address2: json['address2'] as String?,
        town: json['town'] as String?,
        county: json['county'] as String?,
        postcode: json['postcode'] as String?,
        address: json['address'] as String?,
      );
}

class LineItem {
  final String description;
  final double quantity;
  final double unitPrice;
  final double discountPercent;

  LineItem({
    required this.description,
    required this.quantity,
    required this.unitPrice,
    this.discountPercent = 0,
  });

  double get lineTotal => quantity * unitPrice * (1 - discountPercent / 100);

  factory LineItem.fromJson(Map<String, dynamic> json) => LineItem(
        description: json['description'] as String? ?? '',
        quantity: (json['quantity'] as num?)?.toDouble() ?? 0,
        unitPrice: (json['unitPrice'] as num?)?.toDouble() ?? 0,
        discountPercent: (json['discountPercent'] as num?)?.toDouble() ?? 0,
      );
}

class Invoice {
  final String id;
  final String invoiceNumber;
  final List<LineItem> lineItems;
  final double subtotal;
  final double total;
  final double amountPaid;
  final String status;
  final String? subject;
  final DateTime issueDate;
  final DateTime dueDate;

  Invoice({
    required this.id,
    required this.invoiceNumber,
    required this.lineItems,
    required this.subtotal,
    required this.total,
    this.amountPaid = 0,
    required this.status,
    this.subject,
    required this.issueDate,
    required this.dueDate,
  });

  double get balanceDue => (total - amountPaid).clamp(0, double.infinity);

  factory Invoice.fromJson(Map<String, dynamic> json) => Invoice(
        id: json['_id'] as String,
        invoiceNumber: json['invoiceNumber'] as String? ?? '',
        lineItems: (json['lineItems'] as List<dynamic>? ?? [])
            .map((e) => LineItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
        total: (json['total'] as num?)?.toDouble() ?? 0,
        amountPaid: (json['amountPaid'] as num?)?.toDouble() ?? 0,
        status: json['status'] as String? ?? 'draft',
        subject: json['subject'] as String?,
        issueDate: DateTime.parse(json['issueDate'] as String),
        dueDate: DateTime.parse(json['dueDate'] as String),
      );
}

class Quote {
  final String id;
  final String quoteNumber;
  final List<LineItem> lineItems;
  final double subtotal;
  final double total;
  final String status;
  final String? subject;
  final DateTime issueDate;
  final DateTime validUntil;

  Quote({
    required this.id,
    required this.quoteNumber,
    required this.lineItems,
    required this.subtotal,
    required this.total,
    required this.status,
    this.subject,
    required this.issueDate,
    required this.validUntil,
  });

  factory Quote.fromJson(Map<String, dynamic> json) => Quote(
        id: json['_id'] as String,
        quoteNumber: json['quoteNumber'] as String? ?? '',
        lineItems: (json['lineItems'] as List<dynamic>? ?? [])
            .map((e) => LineItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
        total: (json['total'] as num?)?.toDouble() ?? 0,
        status: json['status'] as String? ?? 'draft',
        subject: json['subject'] as String?,
        issueDate: DateTime.parse(json['issueDate'] as String),
        validUntil: DateTime.parse(json['validUntil'] as String),
      );
}

/// One scheduled walk/visit (GET /portal/bookings — DayBooking with animal and
/// product populated by name only).
class Booking {
  final String id;
  final DateTime date;
  final String animalName;
  final String productName;
  final int quantity;
  final String? visitTime; // 'AM' | 'PM' | null

  Booking({
    required this.id,
    required this.date,
    required this.animalName,
    required this.productName,
    required this.quantity,
    this.visitTime,
  });

  factory Booking.fromJson(Map<String, dynamic> json) {
    final animal = json['animal'];
    final product = json['product'];
    return Booking(
      id: json['_id'] as String,
      // Stored at server-local midnight and serialised as UTC — convert to
      // local so it lands on the right calendar day on the device.
      date: DateTime.parse(json['date'] as String).toLocal(),
      animalName: animal is Map<String, dynamic> ? (animal['name'] as String? ?? '') : '',
      productName: product is Map<String, dynamic> ? (product['name'] as String? ?? '') : '',
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      visitTime: json['visitTime'] as String?,
    );
  }
}
