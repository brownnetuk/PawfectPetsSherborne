/// A recorded payment against an invoice (Financial → Payments).
class Payment {
  final String id;
  final String paymentId;
  final String? invoiceNumber;
  final DateTime date;
  final double amount;
  final double charges;
  final String? paymentMethod;
  final String? accountName;

  Payment({
    required this.id,
    required this.paymentId,
    this.invoiceNumber,
    required this.date,
    required this.amount,
    this.charges = 0,
    this.paymentMethod,
    this.accountName,
  });

  factory Payment.fromJson(Map<String, dynamic> json) {
    final invoice = json['invoice'];
    final account = json['account'];
    return Payment(
      id: json['_id'] as String,
      paymentId: json['paymentId'] as String? ?? '',
      invoiceNumber: invoice is Map<String, dynamic> ? invoice['invoiceNumber'] as String? : null,
      date: DateTime.parse(json['date'] as String),
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      charges: (json['charges'] as num?)?.toDouble() ?? 0,
      paymentMethod: json['paymentMethod'] as String?,
      accountName: account is Map<String, dynamic> ? account['name'] as String? : null,
    );
  }
}
