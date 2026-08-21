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
  });

  factory Customer.fromJson(Map<String, dynamic> json) => Customer(
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
      );
}

/// Minimal customer reference as embedded (populated) in bookings/invoices/activity.
class CustomerRef {
  final String id;
  final String name;
  final String email;

  CustomerRef({required this.id, required this.name, required this.email});

  /// The backend either sends a bare id string (not populated) or a populated
  /// {_id, name, email} object depending on the endpoint.
  factory CustomerRef.fromDynamic(dynamic value) {
    if (value is String) {
      return CustomerRef(id: value, name: value, email: '');
    }
    final json = value as Map<String, dynamic>;
    return CustomerRef(
      id: json['_id'] as String,
      name: json['name'] as String? ?? '',
      email: json['email'] as String? ?? '',
    );
  }
}
