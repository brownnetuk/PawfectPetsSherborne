/// A system-generated activity entry for a customer (invoices, quotes,
/// payments, emails sent/read, deposits, etc.) from the backend audit log.
class AuditLogEntry {
  final String id;
  final String type;
  final String title;
  final String? description;
  final double? amount;
  final String actor;
  final DateTime createdAt;

  AuditLogEntry({
    required this.id,
    required this.type,
    required this.title,
    this.description,
    this.amount,
    required this.actor,
    required this.createdAt,
  });

  factory AuditLogEntry.fromJson(Map<String, dynamic> json) => AuditLogEntry(
        id: json['_id'] as String,
        type: json['type'] as String? ?? '',
        title: json['title'] as String? ?? '',
        description: json['description'] as String?,
        amount: (json['amount'] as num?)?.toDouble(),
        actor: json['actor'] as String? ?? 'System',
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}
