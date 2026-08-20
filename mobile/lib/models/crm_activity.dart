import 'customer.dart';

class CrmActivity {
  final String id;
  final CustomerRef customer;
  final String type;
  final String subject;
  final String? description;
  final String createdBy;
  final DateTime createdAt;

  CrmActivity({
    required this.id,
    required this.customer,
    required this.type,
    required this.subject,
    this.description,
    required this.createdBy,
    required this.createdAt,
  });

  factory CrmActivity.fromJson(Map<String, dynamic> json) => CrmActivity(
        id: json['_id'] as String,
        customer: CustomerRef.fromDynamic(json['customer']),
        type: json['type'] as String? ?? 'note',
        subject: json['subject'] as String? ?? '',
        description: json['description'] as String?,
        createdBy: json['createdBy'] as String? ?? '',
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}
