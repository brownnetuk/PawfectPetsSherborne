import 'package:flutter/material.dart';
import 'financial_screen.dart';
import 'home_shell.dart';
import 'invoices_screen.dart';
import 'price_list_screen.dart';
import 'quotes_screen.dart';
import '../widgets/brand.dart';

/// Hub for the back-office area, reached from the bottom bar. Groups
/// Invoices, Quotes and the Financial hub under one entry so the nav bar has
/// room for the Boarding tab.
class BusinessScreen extends StatelessWidget {
  const BusinessScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: brandTitleHeight,
        title: const BrandTitle(lead: 'Our', highlight: 'business'),
        actions: const [LogoutAction()],
      ),
      body: ListView(
        children: [
          _tile(context, Icons.receipt_long_outlined, 'Invoices',
              'Create, send and record invoices', const InvoicesScreen()),
          const Divider(height: 1),
          _tile(context, Icons.request_quote_outlined, 'Quotes',
              'Create and send quotes', const QuotesScreen()),
          const Divider(height: 1),
          _tile(context, Icons.account_balance_wallet_outlined, 'Financial',
              'Snapshot, payments, expenses and bank transfers', const FinancialScreen()),
          const Divider(height: 1),
          _tile(context, Icons.sell_outlined, 'Price List',
              'Products marked "Display in Price List"', const PriceListScreen()),
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
