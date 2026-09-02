import 'package:flutter/material.dart';
import 'home_shell.dart';
import 'invoices_screen.dart';
import 'quotes_screen.dart';

/// Groups Invoices and Quotes under one bottom-bar entry (mirrors the Financial
/// hub) so the nav bar stays uncluttered.
class InvoicingScreen extends StatelessWidget {
  const InvoicingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Invoices & Quotes'), actions: const [LogoutAction()]),
      body: ListView(
        children: [
          _tile(context, Icons.receipt_long_outlined, 'Invoices',
              'Create, send and record invoices', const InvoicesScreen()),
          const Divider(height: 1),
          _tile(context, Icons.request_quote_outlined, 'Quotes',
              'Create and send quotes', const QuotesScreen()),
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
