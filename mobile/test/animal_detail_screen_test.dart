import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:pawfectpets_staff/models/animal.dart';
import 'package:pawfectpets_staff/screens/animal_detail_screen.dart';

void main() {
  testWidgets('shows the full pet record across its sections', (tester) async {
    await tester.binding.setSurfaceSize(const Size(400, 1600));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final animal = Animal(
      id: 'a1',
      species: 'dog',
      breed: 'Border Collie',
      name: 'Rosie',
      sex: 'female',
      age: 8,
      vaccinated: true,
      neuteredStatus: 'spayed',
      insured: true,
      insurer: 'Petplan',
      microchipNumber: '123456789',
      aggressionToPeople: false,
      allergies: AllergyInfo(status: 'yes', details: 'Chicken'),
      medication: MedicationInfo(
        onMedication: true,
        medications: [
          MedicationEntry(name: 'Metacam', dosage: '1ml', frequency: 'Daily', vetPrescribed: true),
        ],
      ),
      offLeadConsent: OffLeadConsent(mode: 'off_lead'),
    );

    await tester.pumpWidget(MaterialApp(home: AnimalDetailScreen(animal: animal)));
    await tester.pumpAndSettle();

    expect(find.text('Rosie'), findsWidgets);
    expect(find.text('Dog · Border Collie'), findsOneWidget);
    expect(find.text('Spayed'), findsOneWidget); // neutered status mapped
    expect(find.text('Metacam'), findsOneWidget); // medication entry
    expect(find.text('Chicken'), findsOneWidget); // allergy details
    expect(find.text('Off-lead consented'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
