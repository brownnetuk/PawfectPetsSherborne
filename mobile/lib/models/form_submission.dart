/// One send of a form to a customer (GET /form-submissions?customer=...) --
/// carries the send-time snapshot of the form's fields (so edits to the live
/// form never change how an old submission renders) and, once the customer
/// has filled it in, their answers keyed by field id.
class FormSubmission {
  final String id;
  final String formName;
  final String? formDescription;

  /// The form's fields exactly as they read when this submission was created
  /// (the backend's formFieldsSnapshot). Kept as raw maps -- the shapes vary
  /// by field type (see backend/src/forms/form-field.types.ts) and are only
  /// walked for display, never mutated.
  final List<Map<String, dynamic>> fields;

  final String status; // 'pending' | 'completed'
  final String recipientEmail;
  final String? recipientName;

  /// Keyed by field id. A repeatable group's answer is a list of
  /// per-repetition {fieldId: value} maps; signature/file answers are image
  /// data URLs.
  final Map<String, dynamic> answers;

  final DateTime? submittedAt;
  final DateTime? createdAt;

  bool get completed => status == 'completed';

  FormSubmission({
    required this.id,
    required this.formName,
    this.formDescription,
    required this.fields,
    required this.status,
    required this.recipientEmail,
    this.recipientName,
    required this.answers,
    this.submittedAt,
    this.createdAt,
  });

  factory FormSubmission.fromJson(Map<String, dynamic> json) => FormSubmission(
        id: json['_id'] as String,
        formName: json['formName'] as String? ?? 'Form',
        formDescription: json['formDescription'] as String?,
        fields: (json['formFieldsSnapshot'] as List<dynamic>? ?? [])
            .whereType<Map>()
            .map((e) => e.cast<String, dynamic>())
            .toList(),
        status: json['status'] as String? ?? 'pending',
        recipientEmail: json['recipientEmail'] as String? ?? '',
        recipientName: json['recipientName'] as String?,
        answers: (json['answers'] as Map<String, dynamic>?) ?? const {},
        submittedAt: json['submittedAt'] != null ? DateTime.tryParse(json['submittedAt'] as String) : null,
        createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'] as String) : null,
      );
}
