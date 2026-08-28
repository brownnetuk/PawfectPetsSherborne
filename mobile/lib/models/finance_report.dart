/// One month of income vs expenses (Financial → Snapshot).
class IncomeExpenseMonth {
  final String month; // 'YYYY-MM'
  final double income;
  final double expenses;
  final double net;

  IncomeExpenseMonth({
    required this.month,
    required this.income,
    required this.expenses,
    required this.net,
  });

  factory IncomeExpenseMonth.fromJson(Map<String, dynamic> json) => IncomeExpenseMonth(
        month: json['month'] as String? ?? '',
        income: (json['income'] as num?)?.toDouble() ?? 0,
        expenses: (json['expenses'] as num?)?.toDouble() ?? 0,
        net: (json['net'] as num?)?.toDouble() ?? 0,
      );
}

/// Total spend for one expense category over the reporting window.
class ExpenseCategoryTotal {
  final String category;
  final double total;

  ExpenseCategoryTotal({required this.category, required this.total});

  factory ExpenseCategoryTotal.fromJson(Map<String, dynamic> json) => ExpenseCategoryTotal(
        category: json['category'] as String? ?? '',
        total: (json['total'] as num?)?.toDouble() ?? 0,
      );
}
