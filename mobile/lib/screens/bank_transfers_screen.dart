import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/bank_account.dart';

/// Lists the bank accounts; tapping one drills into its transactions.
class BankTransfersScreen extends StatefulWidget {
  const BankTransfersScreen({super.key});

  @override
  State<BankTransfersScreen> createState() => _BankTransfersScreenState();
}

class _BankTransfersScreenState extends State<BankTransfersScreen> {
  late Future<List<BankAccount>> _future;
  final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() => _future = context.read<Repository>().listBankAccountsDetailed();

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  String _accountLine(BankAccount a) {
    final parts = [
      if (a.type.isNotEmpty) a.type,
      if (a.sortCode.isNotEmpty) a.sortCode,
      if (a.accountNumber.isNotEmpty) a.accountNumber,
    ];
    return parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Bank Transfers')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<BankAccount>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              final message = snapshot.error is ApiException
                  ? (snapshot.error as ApiException).message
                  : 'Failed to load bank accounts';
              return ListView(children: [const SizedBox(height: 80), Center(child: Text(message, textAlign: TextAlign.center))]);
            }
            final accounts = snapshot.data ?? [];
            if (accounts.isEmpty) {
              return ListView(children: const [SizedBox(height: 80), Center(child: Text('No bank accounts.'))]);
            }
            return ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: accounts.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final a = accounts[i];
                return ListTile(
                  leading: Icon(Icons.account_balance_outlined, color: Theme.of(context).colorScheme.primary),
                  title: Text(a.name),
                  subtitle: Text(_accountLine(a)),
                  trailing: Text(
                    _money.format(a.currentBalance),
                    style: const TextStyle(fontWeight: FontWeight.w600),
                  ),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => BankAccountTransactionsScreen(account: a)),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}

/// Transactions for a single account for the current month, with a running
/// balance carried from the opening balance.
class BankAccountTransactionsScreen extends StatefulWidget {
  final BankAccount account;
  const BankAccountTransactionsScreen({super.key, required this.account});

  @override
  State<BankAccountTransactionsScreen> createState() => _BankAccountTransactionsScreenState();
}

class _BankAccountTransactionsScreenState extends State<BankAccountTransactionsScreen> {
  late Future<({double openingBalance, List<BankTransaction> transactions})> _future;
  final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
  final _dateFmt = DateFormat('d MMM yyyy');
  late int _month;
  late int _year;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _month = now.month;
    _year = now.year;
    _load();
  }

  void _load() => _future = context
      .read<Repository>()
      .getBankTransactions(widget.account.id, _month, _year);

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    final monthLabel = DateFormat('MMMM yyyy').format(DateTime(_year, _month));
    return Scaffold(
      appBar: AppBar(title: Text(widget.account.name)),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<({double openingBalance, List<BankTransaction> transactions})>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              final message = snapshot.error is ApiException
                  ? (snapshot.error as ApiException).message
                  : 'Failed to load transactions';
              return ListView(children: [const SizedBox(height: 80), Center(child: Text(message, textAlign: TextAlign.center))]);
            }
            final data = snapshot.data!;
            return ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(monthLabel, style: const TextStyle(fontWeight: FontWeight.w600)),
                      Text('Opening ${_money.format(data.openingBalance)}',
                          style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
                    ],
                  ),
                ),
                const Divider(height: 1),
                if (data.transactions.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 60),
                    child: Center(child: Text('No transactions this month.')),
                  )
                else
                  for (final t in data.transactions) ...[
                    ListTile(
                      title: Text(t.description),
                      subtitle: Text(_dateFmt.format(t.date)),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            (t.amount >= 0 ? '+' : '') + _money.format(t.amount),
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              color: t.amount >= 0 ? Colors.green.shade700 : Colors.red.shade600,
                            ),
                          ),
                          Text(_money.format(t.balance),
                              style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
                        ],
                      ),
                    ),
                    const Divider(height: 1),
                  ],
              ],
            );
          },
        ),
      ),
    );
  }
}
