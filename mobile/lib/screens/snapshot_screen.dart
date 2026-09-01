import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/bank_account.dart';
import '../models/finance_report.dart';
import '../models/invoice.dart';

typedef _SnapshotData = (
  List<IncomeExpenseMonth>,
  List<ExpenseCategoryTotal>,
  List<BankAccount>,
  List<Invoice>,
  double projectedIncome,
);

/// Dashboard-style financial snapshot: cash position, receivables, income vs
/// expenses and top expense categories over the last 6 months. Mirrors the
/// admin app's Snapshot tab, tuned for a single phone column.
class SnapshotScreen extends StatefulWidget {
  const SnapshotScreen({super.key});

  @override
  State<SnapshotScreen> createState() => _SnapshotScreenState();
}

class _SnapshotScreenState extends State<SnapshotScreen> {
  late Future<_SnapshotData> _future;
  final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final repo = context.read<Repository>();
    _future = () async {
      final months = await repo.incomeVsExpenses(months: 6);
      final categories = await repo.expensesByCategory(months: 6);
      final accounts = await repo.listBankAccountsDetailed();
      final invoices = await repo.listInvoices();
      // Projected income = this month's booking revenue (walks + visits).
      final now = DateTime.now();
      final monthBookings = await repo.listDayBookings(
        from: DateTime(now.year, now.month, 1),
        to: DateTime(now.year, now.month + 1, 1),
      );
      final projected = monthBookings.fold<double>(0, (s, b) => s + b.lineTotal);
      return (months, categories, accounts, invoices, projected);
    }();
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  String _monthLabel(String yyyymm) {
    final parts = yyyymm.split('-');
    if (parts.length != 2) return yyyymm;
    final y = int.tryParse(parts[0]), m = int.tryParse(parts[1]);
    if (y == null || m == null) return yyyymm;
    return DateFormat('MMM').format(DateTime(y, m));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Snapshot')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<_SnapshotData>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              final message = snapshot.error is ApiException
                  ? (snapshot.error as ApiException).message
                  : 'Failed to load snapshot';
              return ListView(children: [const SizedBox(height: 80), Center(child: Text(message, textAlign: TextAlign.center))]);
            }
            final (months, categories, accounts, invoices, projectedIncome) = snapshot.data!;
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _cashPositionRow(accounts, invoices),
                const SizedBox(height: 16),
                _projectedIncomeCard(projectedIncome),
                const SizedBox(height: 16),
                _bankAccountsCard(accounts),
                const SizedBox(height: 16),
                _incomeExpenseCard(months),
                const SizedBox(height: 16),
                _topExpensesCard(categories),
              ],
            );
          },
        ),
      ),
    );
  }

  // --- Cash + receivables headline figures ---
  Widget _cashPositionRow(List<BankAccount> accounts, List<Invoice> invoices) {
    final cashNow = accounts.fold<double>(0, (s, a) => s + a.currentBalance);
    final today = DateTime.now();
    final startOfToday = DateTime(today.year, today.month, today.day);
    final outstanding = invoices.where(
      (i) => i.status != 'draft' && i.status != 'cancelled' && i.balanceDue > 0,
    );
    final overdue = outstanding.where((i) => i.dueDate.isBefore(startOfToday));
    final receivables = outstanding.fold<double>(0, (s, i) => s + i.balanceDue);
    final overdueTotal = overdue.fold<double>(0, (s, i) => s + i.balanceDue);

    return Row(
      children: [
        _statCard(
          'Cash now',
          _money.format(cashNow),
          Icons.account_balance_wallet_outlined,
          cashNow < 0 ? Colors.red.shade600 : Colors.green.shade700,
          subtitle: '${accounts.length} account${accounts.length == 1 ? '' : 's'}',
        ),
        const SizedBox(width: 12),
        _statCard(
          'Receivables',
          _money.format(receivables),
          Icons.request_quote_outlined,
          overdueTotal > 0 ? Colors.orange.shade800 : Theme.of(context).colorScheme.primary,
          subtitle: overdueTotal > 0 ? '${_money.format(overdueTotal)} overdue' : 'All current',
        ),
      ],
    );
  }

  Widget _statCard(String label, String value, IconData icon, Color color, {String? subtitle}) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 16, color: color),
                const SizedBox(width: 6),
                Text(label, style: TextStyle(color: Colors.grey.shade700, fontSize: 12, fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 10),
            Text(value, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 18)),
            if (subtitle != null) ...[
              const SizedBox(height: 2),
              Text(subtitle, style: TextStyle(color: Colors.grey.shade600, fontSize: 11)),
            ],
          ],
        ),
      ),
    );
  }

  // --- This month's projected income (from bookings) ---
  Widget _projectedIncomeCard(double amount) {
    return _card(
      title: "This Month's Projected Income",
      subtitle: DateFormat('MMMM yyyy').format(DateTime.now()),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Icon(Icons.event_available_outlined, color: Colors.green.shade700),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_money.format(amount),
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 22, color: Colors.green.shade800)),
                const SizedBox(height: 2),
                Text('From this month\'s walks & visits',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // --- Income vs expenses card ---
  Widget _incomeExpenseCard(List<IncomeExpenseMonth> months) {
    final totalIncome = months.fold<double>(0, (s, m) => s + m.income);
    final totalExpenses = months.fold<double>(0, (s, m) => s + m.expenses);
    final net = totalIncome - totalExpenses;
    var maxVal = 0.0;
    for (final m in months) {
      if (m.income > maxVal) maxVal = m.income;
      if (m.expenses > maxVal) maxVal = m.expenses;
    }
    if (maxVal == 0) maxVal = 1;

    return _card(
      title: 'Income & Expenses',
      subtitle: 'Last 6 months',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _legendFigure('Income', totalIncome, Colors.green.shade600),
              _legendFigure('Expenses', totalExpenses, Colors.red.shade400),
              _legendFigure('Net', net, net >= 0 ? Colors.green.shade700 : Colors.red.shade600),
            ],
          ),
          const SizedBox(height: 14),
          if (months.isEmpty)
            Text('No data for this period.', style: TextStyle(color: Colors.grey.shade600))
          else
            for (final m in months)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  children: [
                    SizedBox(width: 34, child: Text(_monthLabel(m.month), style: const TextStyle(fontSize: 12))),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        children: [
                          _bar(m.income / maxVal, Colors.green.shade500),
                          const SizedBox(height: 3),
                          _bar(m.expenses / maxVal, Colors.red.shade300),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 66,
                      child: Text(
                        _money.format(m.net),
                        textAlign: TextAlign.right,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: m.net >= 0 ? Colors.green.shade700 : Colors.red.shade600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
        ],
      ),
    );
  }

  Widget _legendFigure(String label, double value, Color color) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(color: Colors.grey.shade600, fontSize: 11)),
            const SizedBox(height: 2),
            Text(_money.format(value), style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 15)),
          ],
        ),
      );

  Widget _bar(double fraction, Color color) {
    final f = fraction.isNaN ? 0.0 : fraction.clamp(0.0, 1.0);
    return ClipRRect(
      borderRadius: BorderRadius.circular(3),
      child: Container(
        height: 7,
        color: Colors.grey.shade200,
        child: FractionallySizedBox(
          alignment: Alignment.centerLeft,
          widthFactor: f,
          child: Container(color: color),
        ),
      ),
    );
  }

  // --- Top expense categories card ---
  Widget _topExpensesCard(List<ExpenseCategoryTotal> categories) {
    final top = categories.take(6).toList();
    final maxVal = top.isEmpty ? 1.0 : top.map((c) => c.total).reduce((a, b) => a > b ? a : b);
    final total = categories.fold<double>(0, (s, c) => s + c.total);

    return _card(
      title: 'Top Expenses',
      subtitle: 'Last 6 months',
      child: top.isEmpty
          ? Text('No expenses recorded.', style: TextStyle(color: Colors.grey.shade600))
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final c in top)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(child: Text(c.category, style: const TextStyle(fontSize: 13))),
                            Text(_money.format(c.total), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          ],
                        ),
                        const SizedBox(height: 4),
                        _bar(c.total / (maxVal == 0 ? 1 : maxVal), Theme.of(context).colorScheme.primary),
                      ],
                    ),
                  ),
                const SizedBox(height: 8),
                Text('Total — ${_money.format(total)}', style: const TextStyle(fontWeight: FontWeight.w600)),
              ],
            ),
    );
  }

  // --- Bank accounts card ---
  Widget _bankAccountsCard(List<BankAccount> accounts) {
    return _card(
      title: 'Bank Accounts',
      child: accounts.isEmpty
          ? Text('No bank accounts set up.', style: TextStyle(color: Colors.grey.shade600))
          : Column(
              children: [
                for (int i = 0; i < accounts.length; i++) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text.rich(TextSpan(children: [
                            TextSpan(text: accounts[i].name),
                            if (accounts[i].type.isNotEmpty)
                              TextSpan(
                                text: '  ${accounts[i].type}',
                                style: TextStyle(color: Colors.grey.shade500, fontSize: 12),
                              ),
                          ])),
                        ),
                        Text(
                          _money.format(accounts[i].currentBalance),
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: accounts[i].currentBalance < 0 ? Colors.red.shade600 : null,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (i != accounts.length - 1) const Divider(height: 1),
                ],
              ],
            ),
    );
  }

  Widget _card({required String title, String? subtitle, required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          if (subtitle != null) ...[
            const SizedBox(height: 1),
            Text(subtitle, style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
          ],
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}
