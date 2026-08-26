import 'customer.dart';
import 'invoice.dart';

const quoteStatuses = ['draft', 'sent', 'accepted', 'declined', 'expired'];

/// Mirrors Invoice, but with validUntil instead of dueDate and an optional
/// customer (a quote can be raised against a manual/placeholder customer).
class Quote {
  final String id;
  final CustomerRef? customer;
  final String? manualCustomerName;
  final String? manualCustomerEmail;
  final String quoteNumber;
  final List<InvoiceLineItem> lineItems;
  final double subtotal;
  final double total;
  final String status;
  final String? subject;
  final String? paymentTerms;
  final DateTime issueDate;
  final DateTime validUntil;

  Quote({
    required this.id,
    this.customer,
    this.manualCustomerName,
    this.manualCustomerEmail,
    required this.quoteNumber,
    required this.lineItems,
    required this.subtotal,
    required this.total,
    required this.status,
    this.subject,
    this.paymentTerms,
    required this.issueDate,
    required this.validUntil,
  });

  String get customerName =>
      customer?.name ?? manualCustomerName ?? '(no customer)';

  factory Quote.fromJson(Map<String, dynamic> json) {
    final c = json['customer'];
    return Quote(
      id: json['_id'] as String,
      customer: (c is String || c is Map<String, dynamic>) ? CustomerRef.fromDynamic(c) : null,
      manualCustomerName: json['manualCustomerName'] as String?,
      manualCustomerEmail: json['manualCustomerEmail'] as String?,
      quoteNumber: json['quoteNumber'] as String? ?? '',
      lineItems: (json['lineItems'] as List<dynamic>? ?? [])
          .map((e) => InvoiceLineItem.fromJson(e as Map<String, dynamic>))
          .toList(),
      subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
      total: (json['total'] as num?)?.toDouble() ?? 0,
      status: json['status'] as String? ?? 'draft',
      subject: json['subject'] as String?,
      paymentTerms: json['paymentTerms'] as String?,
      issueDate: DateTime.parse(json['issueDate'] as String),
      validUntil: DateTime.parse(json['validUntil'] as String),
    );
  }
}
