import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/push_service.dart';
import '../state/auth_provider.dart';
import 'bookings_screen.dart';
import 'customers_screen.dart';
import 'financial_screen.dart';
import 'invoices_screen.dart';
import 'quotes_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  void initState() {
    super.initState();
    // Now that a staff member is logged in, ask iOS for notification
    // permission and register this device for appointment-reminder pushes.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<PushService>().start();
    });
  }

  static const _screens = [
    BookingsScreen(),
    CustomersScreen(),
    InvoicesScreen(),
    QuotesScreen(),
    FinancialScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.event_note_outlined), label: 'Bookings'),
          NavigationDestination(icon: Icon(Icons.people_outline), label: 'Customers'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), label: 'Invoices'),
          NavigationDestination(icon: Icon(Icons.request_quote_outlined), label: 'Quotes'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), label: 'Financial'),
        ],
      ),
    );
  }
}

/// Shared "log out" AppBar action used by the top-level tab screens.
class LogoutAction extends StatelessWidget {
  const LogoutAction({super.key});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      icon: const Icon(Icons.logout),
      tooltip: 'Log out',
      onPressed: () => context.read<AuthProvider>().logout(),
    );
  }
}
