/// A form staff can send a customer a fill-in link for (GET /forms).
class FormSummary {
  final String id;
  final String name;
  final String? description;
  final bool customerVisible;

  FormSummary({
    required this.id,
    required this.name,
    this.description,
    this.customerVisible = true,
  });

  factory FormSummary.fromJson(Map<String, dynamic> json) => FormSummary(
        id: json['_id'] as String,
        name: json['name'] as String? ?? 'Form',
        description: json['description'] as String?,
        customerVisible: json['customerVisible'] as bool? ?? true,
      );
}
