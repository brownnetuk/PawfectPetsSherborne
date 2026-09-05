DateTime? _tryDate(dynamic v) => v is String ? DateTime.tryParse(v) : null;

class Animal {
  final String id;
  final String species;
  final String breed;
  final String name;
  final String sex;
  final int age;
  final DateTime? dateOfBirth;
  final bool vaccinated;
  final DateTime? vaccineExpiryDate;
  final String? vaccineRecordPhoto;
  final List<String> photos;
  final String? colourMarkings;
  final String? microchipNumber;
  final bool? insured;
  final String? insurer;
  final String? neuteredStatus;
  final DateTime? lastSeasonEndDate;
  final String? temperamentNotes;
  final bool aggressionToPeople;
  final String? aggressionToPeopleDetails;
  final bool? aggressionToOtherAnimals;
  final String? aggressionToOtherAnimalsDetails;
  final String? travelsWellInCar;
  final String? chasesLivestock;
  final String? chasesLivestockDetails;
  final AllergyInfo? allergies;
  final MedicationInfo? medication;
  final OffLeadConsent? offLeadConsent;

  Animal({
    required this.id,
    required this.species,
    required this.breed,
    required this.name,
    required this.sex,
    required this.age,
    this.dateOfBirth,
    required this.vaccinated,
    this.vaccineExpiryDate,
    this.vaccineRecordPhoto,
    this.photos = const [],
    this.colourMarkings,
    this.microchipNumber,
    this.insured,
    this.insurer,
    this.neuteredStatus,
    this.lastSeasonEndDate,
    this.temperamentNotes,
    this.aggressionToPeople = false,
    this.aggressionToPeopleDetails,
    this.aggressionToOtherAnimals,
    this.aggressionToOtherAnimalsDetails,
    this.travelsWellInCar,
    this.chasesLivestock,
    this.chasesLivestockDetails,
    this.allergies,
    this.medication,
    this.offLeadConsent,
  });

  factory Animal.fromJson(Map<String, dynamic> json) => Animal(
        id: json['_id'] as String,
        species: json['species'] as String? ?? 'other',
        breed: json['breed'] as String? ?? '',
        name: json['name'] as String? ?? '',
        sex: json['sex'] as String? ?? '',
        age: (json['age'] as num?)?.toInt() ?? 0,
        dateOfBirth: _tryDate(json['dateOfBirth']),
        vaccinated: json['vaccinated'] as bool? ?? false,
        vaccineExpiryDate: _tryDate(json['vaccineExpiryDate']),
        vaccineRecordPhoto: json['vaccineRecordPhoto'] as String?,
        photos: (json['photos'] as List<dynamic>? ?? []).whereType<String>().toList(),
        colourMarkings: json['colourMarkings'] as String?,
        microchipNumber: json['microchipNumber'] as String?,
        insured: json['insured'] as bool?,
        insurer: json['insurer'] as String?,
        neuteredStatus: json['neuteredStatus'] as String?,
        lastSeasonEndDate: _tryDate(json['lastSeasonEndDate']),
        temperamentNotes: json['temperamentNotes'] as String?,
        aggressionToPeople: json['aggressionToPeople'] as bool? ?? false,
        aggressionToPeopleDetails: json['aggressionToPeopleDetails'] as String?,
        aggressionToOtherAnimals: json['aggressionToOtherAnimals'] as bool?,
        aggressionToOtherAnimalsDetails: json['aggressionToOtherAnimalsDetails'] as String?,
        travelsWellInCar: json['travelsWellInCar'] as String?,
        chasesLivestock: json['chasesLivestock'] as String?,
        chasesLivestockDetails: json['chasesLivestockDetails'] as String?,
        allergies: json['allergies'] is Map<String, dynamic>
            ? AllergyInfo.fromJson(json['allergies'] as Map<String, dynamic>)
            : null,
        medication: json['medication'] is Map<String, dynamic>
            ? MedicationInfo.fromJson(json['medication'] as Map<String, dynamic>)
            : null,
        offLeadConsent: json['offLeadConsent'] is Map<String, dynamic>
            ? OffLeadConsent.fromJson(json['offLeadConsent'] as Map<String, dynamic>)
            : null,
      );
}

class AllergyInfo {
  final String status; // yes | no | unsure
  final String? details;

  AllergyInfo({required this.status, this.details});

  factory AllergyInfo.fromJson(Map<String, dynamic> json) => AllergyInfo(
        status: json['status'] as String? ?? 'unsure',
        details: json['details'] as String?,
      );
}

class MedicationEntry {
  final String name;
  final String? illnessTreating;
  final String? dosage;
  final String? frequency;
  final bool vetPrescribed;
  final bool administeredByPawfectPets;
  final String? additionalInfo;

  MedicationEntry({
    required this.name,
    this.illnessTreating,
    this.dosage,
    this.frequency,
    this.vetPrescribed = false,
    this.administeredByPawfectPets = false,
    this.additionalInfo,
  });

  factory MedicationEntry.fromJson(Map<String, dynamic> json) => MedicationEntry(
        name: json['name'] as String? ?? '',
        illnessTreating: json['illnessTreating'] as String?,
        dosage: json['dosage'] as String?,
        frequency: json['frequency'] as String?,
        vetPrescribed: json['vetPrescribed'] as bool? ?? false,
        administeredByPawfectPets: json['administeredByPawfectPets'] as bool? ?? false,
        additionalInfo: json['additionalInfo'] as String?,
      );
}

class MedicationInfo {
  final bool onMedication;
  final List<MedicationEntry> medications;
  final String? details; // legacy free-text, read-only

  MedicationInfo({required this.onMedication, this.medications = const [], this.details});

  factory MedicationInfo.fromJson(Map<String, dynamic> json) => MedicationInfo(
        onMedication: json['onMedication'] as bool? ?? false,
        medications: (json['medications'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(MedicationEntry.fromJson)
            .toList(),
        details: json['details'] as String?,
      );
}

class OffLeadConsent {
  final String mode; // on_lead | off_lead
  final DateTime? date;

  OffLeadConsent({required this.mode, this.date});

  factory OffLeadConsent.fromJson(Map<String, dynamic> json) => OffLeadConsent(
        mode: json['mode'] as String? ?? 'on_lead',
        date: _tryDate(json['date']) ?? _tryDate(json['acknowledgedAt']),
      );
}
