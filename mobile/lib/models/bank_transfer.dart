/// A recorded movement of money between two of the business's own accounts
/// (Financial → Bank Transfers). Mirrors the admin app's Bank Transfer.
class BankTransfer {
  final String id;
  final DateTime date;
  final String? reference;
  final String fromAccountId;
  final String fromAccountName;
  final String toAccountId;
  final String toAccountName;
  final double amount;

  BankTransfer({
    required this.id,
    required this.date,
    this.reference,
    required this.fromAccountId,
    required this.fromAccountName,
    required this.toAccountId,
    required this.toAccountName,
    required this.amount,
  });

  factory BankTransfer.fromJson(Map<String, dynamic> json) {
    ({String id, String name}) account(dynamic value) {
      if (value is Map<String, dynamic>) {
        return (id: value['_id'] as String? ?? '', name: value['name'] as String? ?? '');
      }
      return (id: value as String? ?? '', name: '');
    }

    final from = account(json['fromAccount']);
    final to = account(json['toAccount']);
    return BankTransfer(
      id: json['_id'] as String,
      date: DateTime.parse(json['date'] as String),
      reference: json['reference'] as String?,
      fromAccountId: from.id,
      fromAccountName: from.name,
      toAccountId: to.id,
      toAccountName: to.name,
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
    );
  }
}
