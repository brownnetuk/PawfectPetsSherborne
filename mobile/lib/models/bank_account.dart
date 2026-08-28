/// A bank account with its current balance (Financial → Bank Transfers).
class BankAccount {
  final String id;
  final String name;
  final String type;
  final String sortCode;
  final String accountNumber;
  final double currentBalance;

  BankAccount({
    required this.id,
    required this.name,
    required this.type,
    required this.sortCode,
    required this.accountNumber,
    required this.currentBalance,
  });

  factory BankAccount.fromJson(Map<String, dynamic> json) => BankAccount(
        id: json['_id'] as String,
        name: json['name'] as String? ?? '',
        type: json['type'] as String? ?? 'bank',
        sortCode: json['sortCode'] as String? ?? '',
        accountNumber: json['accountNumber'] as String? ?? '',
        currentBalance: (json['currentBalance'] as num?)?.toDouble() ?? 0,
      );
}

/// One entry in a bank account's transaction list (payment/expense/credit
/// note) with the running balance after it.
class BankTransaction {
  final DateTime date;
  final String description;
  final String type; // payment | expense | credit_note
  final double amount; // signed: payments positive, expenses/credits negative
  final double balance;

  BankTransaction({
    required this.date,
    required this.description,
    required this.type,
    required this.amount,
    required this.balance,
  });

  factory BankTransaction.fromJson(Map<String, dynamic> json) => BankTransaction(
        date: DateTime.parse(json['date'] as String),
        description: json['description'] as String? ?? '',
        type: json['type'] as String? ?? '',
        amount: (json['amount'] as num?)?.toDouble() ?? 0,
        balance: (json['balance'] as num?)?.toDouble() ?? 0,
      );
}
