/// The customer's own details (GET /portal/me). Mirrors the curated shape the
/// backend returns — never any credentials or decrypted alarm instructions.
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
  final EmergencyContact? emergencyContact;
  final EmergencyVet? emergencyVet;
  final Security security;
  final Agreement agreement;
  final Terms terms;
  // The business's off-lead consent wording, shown on the animal form (dogs).
  final String offLeadConsentText;

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
    this.emergencyContact,
    this.emergencyVet,
    required this.security,
    required this.agreement,
    required this.terms,
    this.offLeadConsentText = '',
  });

  factory Profile.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic>? m(String k) => json[k] as Map<String, dynamic>?;
    return Profile(
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
      emergencyContact: m('emergencyContact') == null ? null : EmergencyContact.fromJson(m('emergencyContact')!),
      emergencyVet: m('emergencyVet') == null ? null : EmergencyVet.fromJson(m('emergencyVet')!),
      security: Security.fromJson(m('security') ?? const {}),
      agreement: Agreement.fromJson(m('agreement') ?? const {}),
      terms: Terms.fromJson(m('terms') ?? const {}),
      offLeadConsentText: json['offLeadConsentText'] as String? ?? '',
    );
  }
}

class EmergencyContact {
  final bool sameAsClient;
  final String? firstName;
  final String? surname;
  final String? address1;
  final String? address2;
  final String? town;
  final String? county;
  final String? postcode;
  final String? phoneNumber;
  final String? email;

  EmergencyContact({
    this.sameAsClient = false,
    this.firstName,
    this.surname,
    this.address1,
    this.address2,
    this.town,
    this.county,
    this.postcode,
    this.phoneNumber,
    this.email,
  });

  factory EmergencyContact.fromJson(Map<String, dynamic> j) => EmergencyContact(
        sameAsClient: j['sameAsClient'] as bool? ?? false,
        firstName: j['firstName'] as String?,
        surname: j['surname'] as String?,
        address1: j['address1'] as String?,
        address2: j['address2'] as String?,
        town: j['town'] as String?,
        county: j['county'] as String?,
        postcode: j['postcode'] as String?,
        phoneNumber: j['phoneNumber'] as String?,
        email: j['email'] as String?,
      );
}

class EmergencyVet {
  final String? practiceName;
  final String? address1;
  final String? address2;
  final String? town;
  final String? county;
  final String? postcode;
  final String? telephone;
  final String? email;

  EmergencyVet({
    this.practiceName,
    this.address1,
    this.address2,
    this.town,
    this.county,
    this.postcode,
    this.telephone,
    this.email,
  });

  factory EmergencyVet.fromJson(Map<String, dynamic> j) => EmergencyVet(
        practiceName: j['practiceName'] as String?,
        address1: j['address1'] as String?,
        address2: j['address2'] as String?,
        town: j['town'] as String?,
        county: j['county'] as String?,
        postcode: j['postcode'] as String?,
        telephone: j['telephone'] as String?,
        email: j['email'] as String?,
      );
}

class Security {
  final bool keysProvided;
  final String? furtherInformation;
  // Whether alarm instructions are on file — the plaintext is never sent back.
  final bool hasAlarmInstructions;

  Security({this.keysProvided = false, this.furtherInformation, this.hasAlarmInstructions = false});

  factory Security.fromJson(Map<String, dynamic> j) => Security(
        keysProvided: j['keysProvided'] as bool? ?? false,
        furtherInformation: j['furtherInformation'] as String?,
        hasAlarmInstructions: j['hasAlarmInstructions'] as bool? ?? false,
      );
}

class Agreement {
  final String? signedName;
  final String? signatureImage; // base64 data URI
  final DateTime? signedAt;
  final String? termsVersion;
  final String? termsDocumentDate;

  Agreement({this.signedName, this.signatureImage, this.signedAt, this.termsVersion, this.termsDocumentDate});

  bool get isSigned => signedName != null && signedName!.isNotEmpty;

  factory Agreement.fromJson(Map<String, dynamic> j) => Agreement(
        signedName: j['signedName'] as String?,
        signatureImage: j['signatureImage'] as String?,
        signedAt: j['signedAt'] != null ? DateTime.tryParse(j['signedAt'] as String) : null,
        termsVersion: j['termsVersion'] as String?,
        termsDocumentDate: j['termsDocumentDate'] as String?,
      );
}

class Terms {
  final String html;
  final String? version;
  final String? documentDate;

  Terms({this.html = '', this.version, this.documentDate});

  factory Terms.fromJson(Map<String, dynamic> j) => Terms(
        html: j['html'] as String? ?? '',
        version: j['version'] as String?,
        documentDate: j['documentDate'] as String?,
      );
}

/// A customer's pet (GET /portal/animals). Carries the fields the portal add/
/// edit form reads and writes; unknown fields are simply ignored.
class Animal {
  final String id;
  final String species; // dog | cat | other
  final String breed;
  final String name;
  final String sex; // male | female
  final int age;
  final bool vaccinated;
  final String? vaccineExpiryDate; // ISO date (yyyy-MM-dd)
  final String? vaccineRecordPhoto; // base64 data URI, optional
  final String? colourMarkings;
  final String? microchipNumber;
  final bool insured;
  final String? insurer;
  final String? neuteredStatus; // neutered | spayed | no
  final String? temperamentNotes;
  final bool aggressionToPeople;
  final String? aggressionToPeopleDetails;
  final bool? aggressionToOtherAnimals;
  final String? aggressionToOtherAnimalsDetails;
  final String? travelsWellInCar; // yes | no | unsure
  final String? chasesLivestock; // yes | no | unsure
  final String? chasesLivestockDetails;
  final String allergyStatus; // yes | no | unsure
  final String? allergyDetails;
  final bool onMedication;
  final List<AnimalMedication> medications;
  final String? offLeadMode; // on_lead | off_lead (dogs)

  Animal({
    required this.id,
    required this.species,
    required this.breed,
    required this.name,
    required this.sex,
    required this.age,
    required this.vaccinated,
    this.vaccineExpiryDate,
    this.vaccineRecordPhoto,
    this.colourMarkings,
    this.microchipNumber,
    this.insured = false,
    this.insurer,
    this.neuteredStatus,
    this.temperamentNotes,
    this.aggressionToPeople = false,
    this.aggressionToPeopleDetails,
    this.aggressionToOtherAnimals,
    this.aggressionToOtherAnimalsDetails,
    this.travelsWellInCar,
    this.chasesLivestock,
    this.chasesLivestockDetails,
    this.allergyStatus = 'no',
    this.allergyDetails,
    this.onMedication = false,
    this.medications = const [],
    this.offLeadMode,
  });

  factory Animal.fromJson(Map<String, dynamic> j) {
    final allergies = j['allergies'] as Map<String, dynamic>?;
    final medication = j['medication'] as Map<String, dynamic>?;
    final offLead = j['offLeadConsent'] as Map<String, dynamic>?;
    String isoDate(dynamic v) => v == null ? '' : (v as String).split('T').first;
    return Animal(
      id: j['_id'] as String,
      species: j['species'] as String? ?? 'dog',
      breed: j['breed'] as String? ?? '',
      name: j['name'] as String? ?? '',
      sex: j['sex'] as String? ?? 'male',
      age: (j['age'] as num?)?.toInt() ?? 0,
      vaccinated: j['vaccinated'] as bool? ?? false,
      vaccineExpiryDate: j['vaccineExpiryDate'] == null ? null : isoDate(j['vaccineExpiryDate']),
      vaccineRecordPhoto: j['vaccineRecordPhoto'] as String?,
      colourMarkings: j['colourMarkings'] as String?,
      microchipNumber: j['microchipNumber'] as String?,
      insured: j['insured'] as bool? ?? false,
      insurer: j['insurer'] as String?,
      neuteredStatus: j['neuteredStatus'] as String?,
      temperamentNotes: j['temperamentNotes'] as String?,
      aggressionToPeople: j['aggressionToPeople'] as bool? ?? false,
      aggressionToPeopleDetails: j['aggressionToPeopleDetails'] as String?,
      aggressionToOtherAnimals: j['aggressionToOtherAnimals'] as bool?,
      aggressionToOtherAnimalsDetails: j['aggressionToOtherAnimalsDetails'] as String?,
      travelsWellInCar: j['travelsWellInCar'] as String?,
      chasesLivestock: j['chasesLivestock'] as String?,
      chasesLivestockDetails: j['chasesLivestockDetails'] as String?,
      allergyStatus: allergies?['status'] as String? ?? 'no',
      allergyDetails: allergies?['details'] as String?,
      onMedication: medication?['onMedication'] as bool? ?? false,
      medications: ((medication?['medications'] as List<dynamic>?) ?? [])
          .map((e) => AnimalMedication.fromJson(e as Map<String, dynamic>))
          .toList(),
      offLeadMode: offLead?['mode'] as String?,
    );
  }
}

/// A bell-feed notification (GET /portal/notifications) — a persisted copy of a
/// push sent to this customer.
class PortalNotification {
  final String id;
  final String title;
  final String body;
  final String? type; // invoiceReceived | ... | message | test
  final String? reference;
  final bool read;
  final DateTime createdAt;

  PortalNotification({
    required this.id,
    required this.title,
    required this.body,
    this.type,
    this.reference,
    required this.read,
    required this.createdAt,
  });

  bool get isMessage => type == 'message';

  factory PortalNotification.fromJson(Map<String, dynamic> j) => PortalNotification(
        id: j['_id'] as String,
        title: j['title'] as String? ?? '',
        body: j['body'] as String? ?? '',
        type: j['type'] as String?,
        reference: j['reference'] as String?,
        read: j['read'] as bool? ?? false,
        createdAt: DateTime.parse(j['createdAt'] as String).toLocal(),
      );
}

/// One message in the staff <-> customer thread (GET /portal/messages).
class PortalMessage {
  final String id;
  final String sender; // 'staff' | 'customer'
  final String? senderName;
  final String body;
  final DateTime createdAt;

  PortalMessage({
    required this.id,
    required this.sender,
    this.senderName,
    required this.body,
    required this.createdAt,
  });

  bool get fromStaff => sender == 'staff';

  factory PortalMessage.fromJson(Map<String, dynamic> j) => PortalMessage(
        id: j['_id'] as String,
        sender: j['sender'] as String? ?? 'staff',
        senderName: j['senderName'] as String?,
        body: j['body'] as String? ?? '',
        createdAt: DateTime.parse(j['createdAt'] as String).toLocal(),
      );
}

class AnimalMedication {
  final String name;
  final String? dosage;
  final String? frequency;
  final bool vetPrescribed;
  final bool administeredByPawfectPets;

  AnimalMedication({
    required this.name,
    this.dosage,
    this.frequency,
    this.vetPrescribed = false,
    this.administeredByPawfectPets = false,
  });

  factory AnimalMedication.fromJson(Map<String, dynamic> j) => AnimalMedication(
        name: j['name'] as String? ?? '',
        dosage: j['dosage'] as String?,
        frequency: j['frequency'] as String?,
        vetPrescribed: j['vetPrescribed'] as bool? ?? false,
        administeredByPawfectPets: j['administeredByPawfectPets'] as bool? ?? false,
      );

  Map<String, dynamic> toJson() => {
        'name': name,
        if (dosage != null && dosage!.isNotEmpty) 'dosage': dosage,
        if (frequency != null && frequency!.isNotEmpty) 'frequency': frequency,
        'vetPrescribed': vetPrescribed,
        'administeredByPawfectPets': administeredByPawfectPets,
      };
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
