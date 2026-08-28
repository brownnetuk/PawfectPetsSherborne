import 'package:flutter/material.dart';
import 'bank_transfers_screen.dart';
import 'expenses_screen.dart';
import 'home_shell.dart';
import 'payments_screen.dart';
import 'snapshot_screen.dart';

/// Hub for the finance area, reached from the bottom bar. Lists the
/// sub-sections: Snapshot, Payments, Expenses and Bank Transfers.
class FinancialScreen extends StatelessWidget {
  const FinancialScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Financial'), actions: const [LogoutAction()]),
      body: ListView(
        children: [
          _tile(context, Icons.insights_outlined, 'Snapshot',
              'Income vs expenses at a glance', const SnapshotScreen()),
          const Divider(height: 1),
          _tile(context, Icons.payments_outlined, 'Payments',
              'Payments received against invoices', const PaymentsScreen()),
          const Divider(height: 1),
          _tile(context, Icons.receipt_long_outlined, 'Expenses',
              'Record and review expenses', const ExpensesScreen()),
          const Divider(height: 1),
          _tile(context, Icons.account_balance_outlined, 'Bank Transfers',
              'Accounts and their transactions', const BankTransfersScreen()),
        ],
      ),
    );
  }

  Widget _tile(BuildContext context, IconData icon, String title, String subtitle, Widget screen) {
    return ListTile(
      leading: Icon(icon, color: Theme.of(context).colorScheme.primary),
      title: Text(title),
      subtitle: Text(subtitle),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen)),
    );
  }
}
