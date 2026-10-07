const customerStatuses = ['pending', 'active', 'inactive', 'update_info'];

class EmergencyContact {
  final bool sameAsClient;
  final String? name;
  final String? address;
  final String? phoneNumber;
  final String? email;

  EmergencyContact({
    required this.sameAsClient,
    this.name,
    this.address,
    this.phoneNumber,
    this.email,
  });

  factory EmergencyContact.fromJson(Map<String, dynamic> json) => EmergencyContact(
        sameAsClient: json['sameAsClient'] as bool? ?? false,
        name: json['name'] as String?,
        address: json['address'] as String?,
        phoneNumber: json['phoneNumber'] as String?,
        email: json['email'] as String?,
      );
}

class EmergencyVet {
  final String practiceName;
  final String address;
  final String telephone;
  final String? email;
  final bool alternativeVetAuthorised;

  EmergencyVet({
    required this.practiceName,
    required this.address,
    required this.telephone,
    this.email,
    required this.alternativeVetAuthorised,
  });

  factory EmergencyVet.fromJson(Map<String, dynamic> json) => EmergencyVet(
        practiceName: json['practiceName'] as String? ?? '',
        address: json['address'] as String? ?? '',
        telephone: json['telephone'] as String? ?? '',
        email: json['email'] as String?,
        alternativeVetAuthorised: json['alternativeVetAuthorised'] as bool? ?? false,
      );
}

class Security {
  final bool keysProvided;
  final String? furtherInformation;

  Security({required this.keysProvided, this.furtherInformation});

  factory Security.fromJson(Map<String, dynamic> json) => Security(
        keysProvided: json['keysProvided'] as bool? ?? false,
        furtherInformation: json['furtherInformation'] as String?,
      );
}

class Customer {
  final String id;
  final String name;
  final String email;
  final String? address;
  final String? phoneNumber;
  final String status;
  final EmergencyContact? emergencyContact;
  final EmergencyVet? emergencyVet;
  final Security? security;
  // Customer Defaults (Settings > Customer Defaults) used by the bookings
  // calendar: the dog's default product, whether travel is chargeable and its
  // product, and which weekdays this customer's dogs are regularly booked.
  final String? defaultProductId;
  final bool travelChargeable;
  final String? travelProductId;
  final List<String> regularDays;
  final bool portalActive;

  /// The original response JSON. The display fields above are computed
  /// server-side (name, address); the edit screen needs the raw structured
  /// fields (firstName, address1, emergencyContact.firstName, ...) to prefill
  /// its form, and keeping the JSON avoids duplicating ~20 typed fields.
  final Map<String, dynamic> raw;

  Customer({
    required this.id,
    required this.name,
    required this.email,
    this.address,
    this.phoneNumber,
    required this.status,
    this.emergencyContact,
    this.emergencyVet,
    this.security,
    this.defaultProductId,
    this.travelChargeable = false,
    this.travelProductId,
    this.regularDays = const [],
    this.portalActive = false,
    this.raw = const {},
  });

  factory Customer.fromJson(Map<String, dynamic> json) {
    String? idOrNull(dynamic v) =>
        v is Map<String, dynamic> ? v['_id'] as String? : (v as String?);
    return Customer(
      id: json['_id'] as String,
      name: json['name'] as String,
      email: json['email'] as String,
      address: json['address'] as String?,
      phoneNumber: json['phoneNumber'] as String?,
      status: json['status'] as String? ?? 'pending',
      emergencyContact: json['emergencyContact'] != null
          ? EmergencyContact.fromJson(json['emergencyContact'] as Map<String, dynamic>)
          : null,
      emergencyVet: json['emergencyVet'] != null
          ? EmergencyVet.fromJson(json['emergencyVet'] as Map<String, dynamic>)
          : null,
      security:
          json['security'] != null ? Security.fromJson(json['security'] as Map<String, dynamic>) : null,
      defaultProductId: idOrNull(json['defaultProduct']),
      travelChargeable: json['travelChargeable'] as bool? ?? false,
      travelProductId: idOrNull(json['travelProduct']),
      regularDays:
          (json['regularDays'] as List<dynamic>?)?.map((e) => e as String).toList() ?? const [],
      portalActive: json['portalActive'] as bool? ?? false,
      raw: json,
    );
  }
}

/// Minimal customer reference as embedded (populated) in bookings/invoices/activity.
/// Some endpoints (e.g. GET /invoices/:id) also populate address/phoneNumber.
class CustomerRef {
  final String id;
  final String name;
  final String email;
  final String? address;
  final String? phoneNumber;

  CustomerRef({
    required this.id,
    required this.name,
    required this.email,
    this.address,
    this.phoneNumber,
  });

  /// The backend either sends a bare id string (not populated) or a populated
  /// {_id, name, email, ...} object depending on the endpoint.
  factory CustomerRef.fromDynamic(dynamic value) {
    if (value is String) {
      return CustomerRef(id: value, name: value, email: '');
    }
    final json = value as Map<String, dynamic>;
    return CustomerRef(
      id: json['_id'] as String,
      name: json['name'] as String? ?? '',
      email: json['email'] as String? ?? '',
      address: json['address'] as String?,
      phoneNumber: json['phoneNumber'] as String?,
    );
  }
}
