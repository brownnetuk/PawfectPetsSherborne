import 'package:flutter/material.dart';
import 'financial_screen.dart';
import 'home_shell.dart';
import 'invoicing_screen.dart';

/// Hub for the back-office area, reached from the bottom bar. Groups the
/// Invoicing (Invoices & Quotes) and Financial hubs under one entry so the
/// nav bar has room for the Boarding tab.
class BusinessScreen extends StatelessWidget {
  const BusinessScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Business'), actions: const [LogoutAction()]),
      body: ListView(
        children: [
          _tile(context, Icons.receipt_long_outlined, 'Invoicing',
              'Invoices and quotes', const InvoicingScreen()),
          const Divider(height: 1),
          _tile(context, Icons.account_balance_wallet_outlined, 'Financial',
              'Snapshot, payments, expenses and bank transfers', const FinancialScreen()),
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
