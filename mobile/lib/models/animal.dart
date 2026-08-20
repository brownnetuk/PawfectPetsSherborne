class Animal {
  final String id;
  final String species;
  final String breed;
  final String name;
  final String sex;
  final int age;
  final bool vaccinated;

  Animal({
    required this.id,
    required this.species,
    required this.breed,
    required this.name,
    required this.sex,
    required this.age,
    required this.vaccinated,
  });

  factory Animal.fromJson(Map<String, dynamic> json) => Animal(
        id: json['_id'] as String,
        species: json['species'] as String? ?? 'other',
        breed: json['breed'] as String? ?? '',
        name: json['name'] as String? ?? '',
        sex: json['sex'] as String? ?? '',
        age: (json['age'] as num?)?.toInt() ?? 0,
        vaccinated: json['vaccinated'] as bool? ?? false,
      );
}
