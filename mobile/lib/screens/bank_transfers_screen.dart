import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/bank_account.dart';
import '../models/bank_transfer.dart';
import 'bank_transfer_form_sheet.dart';

/// Shows the bank accounts with their balances (tap to drill into an account's
/// transactions) plus the recorded transfers between accounts, with add / edit
/// / delete.
class BankTransfersScreen extends StatefulWidget {
  const BankTransfersScreen({super.key});

  @override
  State<BankTransfersScreen> createState() => _BankTransfersScreenState();
}

class _BankTransfersScreenState extends State<BankTransfersScreen> {
  late Future<(List<BankAccount>, List<BankTransfer>)> _future;
  final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
  final _dateFmt = DateFormat('d MMM yyyy');

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    final repo = context.read<Repository>();
    _future = () async {
      final accounts = await repo.listBankAccountsDetailed();
      final transfers = await repo.listBankTransfers();
      return (accounts, transfers);
    }();
  }

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

  Future<void> _add() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const BankTransferFormSheet(),
    );
    if (saved == true) _refresh();
  }

  Future<void> _openTransferActions(BankTransfer transfer) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: Text(
                transfer.reference?.isNotEmpty == true ? transfer.reference! : 'Transfer',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: Text('${transfer.fromAccountName} → ${transfer.toAccountName}'),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Edit'),
              onTap: () => Navigator.of(context).pop('edit'),
            ),
            ListTile(
              leading: Icon(Icons.delete_outline, color: Colors.red.shade600),
              title: Text('Delete', style: TextStyle(color: Colors.red.shade600)),
              onTap: () => Navigator.of(context).pop('delete'),
            ),
          ],
        ),
      ),
    );
    if (!mounted) return;
    if (action == 'edit') {
      final saved = await showModalBottomSheet<bool>(
        context: context,
        isScrollControlled: true,
        builder: (_) => BankTransferFormSheet(transfer: transfer),
      );
      if (saved == true) _refresh();
    } else if (action == 'delete') {
      _confirmDelete(transfer);
    }
  }

  Future<void> _confirmDelete(BankTransfer transfer) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete this transfer?'),
        content: const Text(
          'This permanently removes the transfer and reverses its effect on both accounts\' balances.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text('Delete', style: TextStyle(color: Colors.red.shade600)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await context.read<Repository>().deleteBankTransfer(transfer.id);
      _refresh();
    } catch (e) {
      if (mounted) {
        final message = e is ApiException ? e.message : 'Failed to delete transfer';
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
      }
    }
  }

  Widget _sectionTitle(String title) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
        child: Text(
          title.toUpperCase(),
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 0.5, color: Colors.grey.shade600),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Bank Transfers')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _add,
        icon: const Icon(Icons.swap_horiz),
        label: const Text('Transfer'),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<(List<BankAccount>, List<BankTransfer>)>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              final message = snapshot.error is ApiException
                  ? (snapshot.error as ApiException).message
                  : 'Failed to load bank data';
              return ListView(children: [const SizedBox(height: 80), Center(child: Text(message, textAlign: TextAlign.center))]);
            }
            final (accounts, transfers) = snapshot.data!;
            return ListView(
              padding: const EdgeInsets.only(bottom: 88),
              children: [
                _sectionTitle('Accounts'),
                if (accounts.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Text('No bank accounts.'),
                  )
                else
                  for (final a in accounts) ...[
                    ListTile(
                      leading: Icon(Icons.account_balance_outlined, color: Theme.of(context).colorScheme.primary),
                      title: Text(a.name),
                      subtitle: Text(_accountLine(a)),
                      trailing: Text(_money.format(a.currentBalance), style: const TextStyle(fontWeight: FontWeight.w600)),
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => BankAccountTransactionsScreen(account: a)),
                      ),
                    ),
                    const Divider(height: 1),
                  ],
                _sectionTitle('Transfers'),
                if (transfers.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    child: Text('No transfers recorded yet.'),
                  )
                else
                  for (final t in transfers) ...[
                    ListTile(
                      leading: const Icon(Icons.swap_horiz),
                      title: Text(t.reference?.isNotEmpty == true ? t.reference! : 'Transfer'),
                      subtitle: Text('${t.fromAccountName} → ${t.toAccountName} · ${_dateFmt.format(t.date)}'),
                      trailing: Text(_money.format(t.amount), style: const TextStyle(fontWeight: FontWeight.w600)),
                      onTap: () => _openTransferActions(t),
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
