import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/bank_account.dart';
import '../models/customer.dart';
import '../models/day_booking.dart';
import '../models/finance_report.dart';
import '../models/invoice.dart';
import '../models/product.dart';
import '../models/visit_mapping.dart';

typedef _ProjectedIncome = ({double walks, double boarding, double dayCare});

typedef _SnapshotData = (
  List<IncomeExpenseMonth>,
  List<ExpenseCategoryTotal>,
  List<BankAccount>,
  List<Invoice>,
  _ProjectedIncome projected,
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
      // Projected income = this month's Boarding and Day Care booking revenue
      // (computed the same way as the admin app's Boarding & Day Care tiles)
      // plus regular Walks (computed the way the admin Financial Snapshot's
      // Expected Revenue card does: each active customer's regular walk days
      // this month x their default product's price -- walks booked on the
      // calendar are deliberately not added on top of that). Visits and a
      // boarding stay's unbilled pick-up placeholder row are excluded.
      final now = DateTime.now();
      final mapping = await repo.getVisitMapping();
      final monthBookings = await repo.listDayBookings(
        from: DateTime(now.year, now.month, 1),
        to: DateTime(now.year, now.month + 1, 1),
      );
      final customers = await repo.listCustomers();
      final products = await repo.listProducts();
      final projected = _projectedIncome(mapping, monthBookings, customers, products, now);
      return (months, categories, accounts, invoices, projected);
    }();
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  /// Boarding/Day Care: straight port of the admin Boarding & Day Care page's
  /// projected-income tiles -- each row prices at product price x quantity; a
  /// row whose sections include an overnight stay counts as Boarding, any
  /// other occupied row as Day Care, and unoccupied rows (walks/visits,
  /// placeholders) count as neither.
  /// Walks: port of the admin Financial Snapshot's Expected Revenue card --
  /// per active customer, how many of their regular walk days fall in this
  /// calendar month x their default product's price.
  static _ProjectedIncome _projectedIncome(
    VisitMapping mapping,
    List<DayBooking> rows,
    List<Customer> customers,
    List<Product> products,
    DateTime now,
  ) {
    var boarding = 0.0, dayCare = 0.0;
    for (final b in rows) {
      final sections = _sectionsFor(mapping, b);
      if (sections.isEmpty) continue;
      if (sections.contains('overnight')) {
        boarding += b.lineTotal;
      } else {
        dayCare += b.lineTotal;
      }
    }

    const weekdayIndex = {
      'monday': DateTime.monday,
      'tuesday': DateTime.tuesday,
      'wednesday': DateTime.wednesday,
      'thursday': DateTime.thursday,
      'friday': DateTime.friday,
      'saturday': DateTime.saturday,
      'sunday': DateTime.sunday,
    };
    // Counts how many times a weekday falls in this month -- walks every day
    // rather than assuming a flat "4 or 5 per month", since it varies.
    int countInMonth(int weekday) {
      final daysInMonth = DateTime(now.year, now.month + 1, 0).day;
      var count = 0;
      for (var day = 1; day <= daysInMonth; day++) {
        if (DateTime(now.year, now.month, day).weekday == weekday) count++;
      }
      return count;
    }

    final priceById = {for (final p in products) p.id: p.price};
    var walks = 0.0;
    for (final c in customers) {
      if (c.status != 'active' || c.defaultProductId == null || c.regularDays.isEmpty) continue;
      final price = priceById[c.defaultProductId];
      if (price == null) continue;
      var occurrences = 0;
      for (final day in c.regularDays) {
        final weekday = weekdayIndex[day];
        if (weekday != null) occurrences += countInMonth(weekday);
      }
      walks += occurrences * price;
    }

    return (walks: walks, boarding: boarding, dayCare: dayCare);
  }

  /// Which occupancy sections (AM / PM / overnight) a row's product occupies.
  /// Mirrors sectionsFor() in admin/src/pages/BoardingDayCarePage.tsx -- see
  /// the comments there for the full reasoning; keep the two in step.
  static Set<String> _sectionsFor(VisitMapping m, DayBooking b) {
    int? hour(String? time) {
      if (time == null || time.isEmpty) return null;
      return int.tryParse(time.split(':').first);
    }

    final pid = b.productId;
    if (pid == m.boardingPerDay || pid == m.boardingSecondDogPerDay) {
      if (b.placeholder) return {};
      final sections = {'AM', 'PM', 'overnight'};
      final drop = hour(b.dropOffTime);
      if (drop != null && drop >= 13) sections.remove('AM');
      final pick = hour(b.pickUpTime);
      if (pick != null) {
        sections.remove('overnight'); // leaving that day, not staying the night
        if (pick < 13) sections.remove('PM');
      }
      return sections;
    }
    if (pid == m.dayCareFullDay || pid == m.dayCareSecondDogFullDay) {
      final sections = {'AM', 'PM'};
      if (b.boardingStay) {
        final drop = hour(b.dropOffTime);
        if (drop != null && drop >= 13) sections.remove('AM');
        final pick = hour(b.pickUpTime);
        if (pick != null && pick < 13) sections.remove('PM');
      }
      return sections;
    }
    if (pid == m.dayCareHalfDay ||
        pid == m.dayCareSecondDogHalfDay ||
        pid == m.boardingHalfDay ||
        pid == m.boardingSecondDogHalfDay) {
      // A half day always occupies one daytime section; which half doesn't
      // matter for income, only that it's never 'overnight'.
      return {'AM'};
    }
    return {};
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
            final (months, categories, accounts, invoices, projected) = snapshot.data!;
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _cashPositionRow(accounts, invoices),
                const SizedBox(height: 16),
                _projectedIncomeCard(projected),
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

  // --- This month's projected income (Walks / Boarding / Day Care, as in admin) ---
  Widget _projectedIncomeCard(_ProjectedIncome projected) {
    Widget figure(String label, double amount, IconData icon) {
      return Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 16, color: Colors.green.shade700),
                const SizedBox(width: 6),
                Text(label, style: TextStyle(color: Colors.grey.shade700, fontSize: 12, fontWeight: FontWeight.w600)),
              ],
            ),
            const SizedBox(height: 6),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(_money.format(amount),
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Colors.green.shade800)),
            ),
          ],
        ),
      );
    }

    return _card(
      title: "This Month's Projected Income",
      subtitle: DateFormat('MMMM yyyy').format(DateTime.now()),
      child: Row(
        children: [
          figure('Walks', projected.walks, Icons.directions_walk),
          const SizedBox(width: 10),
          figure('Boarding', projected.boarding, Icons.night_shelter_outlined),
          const SizedBox(width: 10),
          figure('Day Care', projected.dayCare, Icons.light_mode_outlined),
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
