class Expense {
  final String id;
  final DateTime date;
  final String category;
  final String? payee;
  final String description;
  final double amount;
  final String? accountName;

  Expense({
    required this.id,
    required this.date,
    required this.category,
    this.payee,
    required this.description,
    required this.amount,
    this.accountName,
  });

  factory Expense.fromJson(Map<String, dynamic> json) {
    final account = json['account'];
    return Expense(
      id: json['_id'] as String,
      date: DateTime.parse(json['date'] as String),
      category: json['category'] as String? ?? '',
      payee: json['payee'] as String?,
      description: json['description'] as String? ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      accountName: account is Map<String, dynamic> ? account['name'] as String? : null,
    );
  }
}

/// A named expense category staff pick from when recording an expense
/// (managed in the admin app under Settings > Finance).
class ExpenseCategory {
  final String id;
  final String name;

  ExpenseCategory({required this.id, required this.name});

  factory ExpenseCategory.fromJson(Map<String, dynamic> json) =>
      ExpenseCategory(id: json['_id'] as String, name: json['name'] as String? ?? '');
}

/// A named vendor staff pick from as an expense's payee (managed in the admin
/// app). Copied onto Expense.payee by name at creation time.
class Vendor {
  final String id;
  final String name;

  Vendor({required this.id, required this.name});

  factory Vendor.fromJson(Map<String, dynamic> json) =>
      Vendor(id: json['_id'] as String, name: json['name'] as String? ?? '');
}

/// Minimal bank-account reference for the "paid from"/"paid into" pickers
/// (used by both expenses and invoice payments).
class BankAccountRef {
  final String id;
  final String name;

  BankAccountRef({required this.id, required this.name});

  factory BankAccountRef.fromJson(Map<String, dynamic> json) =>
      BankAccountRef(id: json['_id'] as String, name: json['name'] as String? ?? '');
}

/// A named payment method (e.g. "Bank Transfer", "Cash") staff pick from when
/// recording how a customer paid an invoice.
class PaymentMethod {
  final String id;
  final String name;

  PaymentMethod({required this.id, required this.name});

  factory PaymentMethod.fromJson(Map<String, dynamic> json) =>
      PaymentMethod(id: json['_id'] as String, name: json['name'] as String? ?? '');
}
