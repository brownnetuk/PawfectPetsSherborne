import 'customer.dart';

const invoiceStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

class InvoiceLineItem {
  final String description;
  final double quantity;
  final double unitPrice;
  final double discountPercent;

  InvoiceLineItem({
    required this.description,
    required this.quantity,
    required this.unitPrice,
    this.discountPercent = 0,
  });

  /// The line's value after its discount, e.g. 2 × £10 less 10% = £18.
  double get lineTotal => quantity * unitPrice * (1 - discountPercent / 100);

  factory InvoiceLineItem.fromJson(Map<String, dynamic> json) => InvoiceLineItem(
        description: json['description'] as String? ?? '',
        quantity: (json['quantity'] as num?)?.toDouble() ?? 0,
        unitPrice: (json['unitPrice'] as num?)?.toDouble() ?? 0,
        discountPercent: (json['discountPercent'] as num?)?.toDouble() ?? 0,
      );

  Map<String, dynamic> toJson() => {
        'description': description,
        'quantity': quantity,
        'unitPrice': unitPrice,
        if (discountPercent > 0) 'discountPercent': discountPercent,
      };
}

class Invoice {
  final String id;
  final CustomerRef customer;
  final String invoiceNumber;
  final List<InvoiceLineItem> lineItems;
  final double subtotal;
  final double total;
  final double amountPaid;
  final String status;
  final String? subject;
  final String? paymentTerms;
  final DateTime issueDate;
  final DateTime dueDate;

  Invoice({
    required this.id,
    required this.customer,
    required this.invoiceNumber,
    required this.lineItems,
    required this.subtotal,
    required this.total,
    this.amountPaid = 0,
    required this.status,
    this.subject,
    this.paymentTerms,
    required this.issueDate,
    required this.dueDate,
  });

  /// Outstanding balance, never negative.
  double get balanceDue => (total - amountPaid).clamp(0, double.infinity);

  factory Invoice.fromJson(Map<String, dynamic> json) => Invoice(
        id: json['_id'] as String,
        customer: CustomerRef.fromDynamic(json['customer']),
        invoiceNumber: json['invoiceNumber'] as String? ?? '',
        lineItems: (json['lineItems'] as List<dynamic>? ?? [])
            .map((e) => InvoiceLineItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        subtotal: (json['subtotal'] as num?)?.toDouble() ?? 0,
        total: (json['total'] as num?)?.toDouble() ?? 0,
        amountPaid: (json['amountPaid'] as num?)?.toDouble() ?? 0,
        status: json['status'] as String? ?? 'draft',
        subject: json['subject'] as String?,
        paymentTerms: json['paymentTerms'] as String?,
        issueDate: DateTime.parse(json['issueDate'] as String),
        dueDate: DateTime.parse(json['dueDate'] as String),
      );
}
