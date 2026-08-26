import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/animal.dart';

/// Read-only view of everything on file for a single pet, reached by tapping
/// a pet on the customer detail screen.
class AnimalDetailScreen extends StatelessWidget {
  final Animal animal;
  const AnimalDetailScreen({super.key, required this.animal});

  static final _dateFmt = DateFormat('d MMM yyyy');

  @override
  Widget build(BuildContext context) {
    final photos = animal.photos.map(_decodeDataUri).whereType<Uint8List>().toList();
    return Scaffold(
      appBar: AppBar(title: Text(animal.name.isEmpty ? 'Pet' : animal.name)),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(animal.name, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 4),
          Text(
            '${_cap(animal.species)} · ${animal.breed}',
            style: TextStyle(color: Colors.grey.shade600),
          ),

          if (photos.isNotEmpty) ...[
            const SizedBox(height: 16),
            SizedBox(
              height: 160,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: photos.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (_, i) => ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Image.memory(photos[i], height: 160, fit: BoxFit.cover),
                ),
              ),
            ),
          ],

          _section('Basics'),
          _row('Sex', _cap(animal.sex)),
          _row('Age', '${animal.age}'),
          if (animal.dateOfBirth != null) _row('Date of birth', _dateFmt.format(animal.dateOfBirth!)),
          if ((animal.colourMarkings ?? '').isNotEmpty) _row('Colour / markings', animal.colourMarkings!),
          if ((animal.microchipNumber ?? '').isNotEmpty) _row('Microchip', animal.microchipNumber!),

          _section('Health'),
          _row('Vaccinated', _yesNo(animal.vaccinated)),
          if (animal.vaccineExpiryDate != null)
            _row('Vaccine expiry', _dateFmt.format(animal.vaccineExpiryDate!)),
          if (animal.neuteredStatus != null) _row('Neutered', _neutered(animal.neuteredStatus!)),
          if (animal.neuteredStatus == 'spayed' && animal.lastSeasonEndDate != null)
            _row('Last season ended', _dateFmt.format(animal.lastSeasonEndDate!)),
          if (animal.insured != null) _row('Insured', _yesNo(animal.insured!)),
          if (animal.insured == true && (animal.insurer ?? '').isNotEmpty)
            _row('Insurer', animal.insurer!),
          if (animal.allergies != null) _row('Allergies', _triState(animal.allergies!.status)),
          if (animal.allergies != null && (animal.allergies!.details ?? '').isNotEmpty)
            _row('Allergy details', animal.allergies!.details!),

          if (animal.medication != null) ...[
            _section('Medication'),
            _row('On medication', _yesNo(animal.medication!.onMedication)),
            ...animal.medication!.medications.map(_medicationTile),
            if ((animal.medication!.details ?? '').isNotEmpty)
              _row('Notes', animal.medication!.details!),
          ],

          _section('Temperament & handling'),
          if ((animal.temperamentNotes ?? '').isNotEmpty) _row('Temperament', animal.temperamentNotes!),
          _row('Aggression to people', _yesNo(animal.aggressionToPeople)),
          if ((animal.aggressionToPeopleDetails ?? '').isNotEmpty)
            _row('Details', animal.aggressionToPeopleDetails!),
          if (animal.aggressionToOtherAnimals != null)
            _row('Aggression to animals', _yesNo(animal.aggressionToOtherAnimals!)),
          if ((animal.aggressionToOtherAnimalsDetails ?? '').isNotEmpty)
            _row('Details', animal.aggressionToOtherAnimalsDetails!),
          if (animal.travelsWellInCar != null) _row('Travels well in car', _triState(animal.travelsWellInCar!)),
          if (animal.chasesLivestock != null) _row('Chases livestock', _triState(animal.chasesLivestock!)),
          if ((animal.chasesLivestockDetails ?? '').isNotEmpty)
            _row('Details', animal.chasesLivestockDetails!),
          if (animal.offLeadConsent != null)
            _row('Walk mode', animal.offLeadConsent!.mode == 'off_lead' ? 'Off-lead consented' : 'On-lead'),
          if (animal.offLeadConsent?.date != null)
            _row('Consent date', _dateFmt.format(animal.offLeadConsent!.date!)),
        ],
      ),
    );
  }

  Widget _medicationTile(MedicationEntry m) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(m.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                if ((m.illnessTreating ?? '').isNotEmpty) Text('For: ${m.illnessTreating}'),
                if ((m.dosage ?? '').isNotEmpty || (m.frequency ?? '').isNotEmpty)
                  Text([m.dosage, m.frequency].where((s) => (s ?? '').isNotEmpty).join(' · ')),
                Text('Vet prescribed: ${_yesNo(m.vetPrescribed)} · '
                    'By Pawfect Pets: ${_yesNo(m.administeredByPawfectPets)}',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                if ((m.additionalInfo ?? '').isNotEmpty) Text(m.additionalInfo!),
              ],
            ),
          ),
        ),
      );

  Widget _section(String title) => Padding(
        padding: const EdgeInsets.only(top: 20, bottom: 8),
        child: Text(
          title.toUpperCase(),
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.5,
            color: Colors.grey.shade600,
          ),
        ),
      );

  Widget _row(String label, String value) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(width: 140, child: Text(label, style: TextStyle(color: Colors.grey.shade600))),
            Expanded(child: Text(value)),
          ],
        ),
      );
}

String _cap(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
String _yesNo(bool v) => v ? 'Yes' : 'No';
String _triState(String s) => {'yes': 'Yes', 'no': 'No', 'unsure': 'Unsure'}[s] ?? _cap(s);
String _neutered(String s) =>
    {'neutered': 'Neutered', 'spayed': 'Spayed', 'no': 'Not neutered'}[s] ?? _cap(s);

Uint8List? _decodeDataUri(String s) {
  final comma = s.indexOf(',');
  final b64 = comma >= 0 ? s.substring(comma + 1) : s;
  try {
    return base64Decode(b64);
  } catch (_) {
    return null;
  }
}
