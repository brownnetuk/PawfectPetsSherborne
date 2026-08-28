import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/finance_report.dart';

/// Financial snapshot: income vs expenses per month and top expense
/// categories over the last 6 months.
class SnapshotScreen extends StatefulWidget {
  const SnapshotScreen({super.key});

  @override
  State<SnapshotScreen> createState() => _SnapshotScreenState();
}

class _SnapshotScreenState extends State<SnapshotScreen> {
  late Future<(List<IncomeExpenseMonth>, List<ExpenseCategoryTotal>)> _future;
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
      return (months, categories);
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
    return DateFormat('MMM yyyy').format(DateTime(y, m));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Snapshot')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<(List<IncomeExpenseMonth>, List<ExpenseCategoryTotal>)>(
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
            final (months, categories) = snapshot.data!;
            final totalIncome = months.fold<double>(0, (s, m) => s + m.income);
            final totalExpenses = months.fold<double>(0, (s, m) => s + m.expenses);
            final net = totalIncome - totalExpenses;
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Last 6 months', style: TextStyle(color: Colors.grey.shade600, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    _summaryCard('Income', totalIncome, Colors.green.shade700),
                    const SizedBox(width: 8),
                    _summaryCard('Expenses', totalExpenses, Colors.red.shade600),
                    const SizedBox(width: 8),
                    _summaryCard('Net', net, net >= 0 ? Colors.green.shade700 : Colors.red.shade600),
                  ],
                ),
                const SizedBox(height: 20),
                _sectionTitle('By month'),
                for (final m in months.reversed)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      children: [
                        Expanded(flex: 3, child: Text(_monthLabel(m.month))),
                        Expanded(flex: 3, child: Text(_money.format(m.income), textAlign: TextAlign.right, style: TextStyle(color: Colors.green.shade700))),
                        Expanded(flex: 3, child: Text(_money.format(m.expenses), textAlign: TextAlign.right, style: TextStyle(color: Colors.red.shade600))),
                        Expanded(flex: 3, child: Text(_money.format(m.net), textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w600))),
                      ],
                    ),
                  ),
                const SizedBox(height: 20),
                _sectionTitle('Top expense categories'),
                if (categories.isEmpty)
                  Text('No expenses recorded.', style: TextStyle(color: Colors.grey.shade600))
                else
                  for (final c in categories)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(child: Text(c.category)),
                          Text(_money.format(c.total), style: const TextStyle(fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _summaryCard(String label, double value, Color color) => Expanded(
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Colors.grey.shade100, borderRadius: BorderRadius.circular(10)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
              const SizedBox(height: 4),
              Text(_money.format(value), style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 15)),
            ],
          ),
        ),
      );

  Widget _sectionTitle(String title) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(title.toUpperCase(), style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 0.5, color: Colors.grey.shade600)),
      );
}
