import 'customer.dart';

class CrmActivity {
  final String id;
  final CustomerRef customer;
  final String type;
  final String subject;
  final String? description;
  final String createdBy;
  final DateTime createdAt;

  /// Base64 data-URL images. Absent in list responses (the backend strips
  /// them so lists stay light); fetch the single note to get them.
  final List<String>? attachments;
  final int attachmentCount;

  CrmActivity({
    required this.id,
    required this.customer,
    required this.type,
    required this.subject,
    this.description,
    required this.createdBy,
    required this.createdAt,
    this.attachments,
    this.attachmentCount = 0,
  });

  factory CrmActivity.fromJson(Map<String, dynamic> json) => CrmActivity(
        id: json['_id'] as String,
        customer: CustomerRef.fromDynamic(json['customer']),
        type: json['type'] as String? ?? 'note',
        subject: json['subject'] as String? ?? '',
        description: json['description'] as String?,
        createdBy: json['createdBy'] as String? ?? '',
        createdAt: DateTime.parse(json['createdAt'] as String),
        attachments: (json['attachments'] as List?)?.cast<String>(),
        attachmentCount: json['attachmentCount'] as int? ?? 0,
      );
}
