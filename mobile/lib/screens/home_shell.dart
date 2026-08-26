import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/auth_provider.dart';
import 'bookings_screen.dart';
import 'customers_screen.dart';
import 'expenses_screen.dart';
import 'invoices_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _screens = [
    BookingsScreen(),
    CustomersScreen(),
    InvoicesScreen(),
    ExpensesScreen(),
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
          NavigationDestination(icon: Icon(Icons.payments_outlined), label: 'Expenses'),
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
