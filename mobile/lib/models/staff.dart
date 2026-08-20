class Staff {
  final String id;
  final String name;
  final String email;

  Staff({required this.id, required this.name, required this.email});

  factory Staff.fromJson(Map<String, dynamic> json) => Staff(
        id: json['id'] as String,
        name: json['name'] as String,
        email: json['email'] as String,
      );
}
