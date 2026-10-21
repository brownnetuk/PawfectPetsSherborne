import 'package:flutter_test/flutter_test.dart';
import 'package:pawfectpets_staff/utils/pet_name_placeholder.dart';

void main() {
  final group = <String, dynamic>{
    'type': 'group',
    'repetitionLabels': ['Islay', 'Ozzy'],
  };
  final fields = [
    <String, dynamic>{'id': 'a', 'label': 'Where is {{petName}} used to sleeping?'},
    <String, dynamic>{'id': 'b', 'label': 'Is your dog crate trained?'},
  ];

  test('repetitionLabel reads the per-pet name, null otherwise', () {
    expect(repetitionLabel(group, 1), 'Ozzy');
    expect(repetitionLabel(group, 2), isNull);
    expect(repetitionLabel({'type': 'group'}, 0), isNull);
  });

  test('withPetName substitutes the pet name', () {
    final out = withPetName(fields, 'Islay');
    expect(out[0]['label'], 'Where is Islay used to sleeping?');
    expect(out[1], same(fields[1]));
  });

  test('withPetName falls back to "your dog"', () {
    expect(withPetName(fields, null)[0]['label'], 'Where is your dog used to sleeping?');
    expect(withPetName(fields, '  ')[0]['label'], 'Where is your dog used to sleeping?');
  });
}
