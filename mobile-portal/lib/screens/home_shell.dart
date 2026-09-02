import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/push_service.dart';
import '../state/auth_provider.dart';
import 'bookings_screen.dart';
import 'details_screen.dart';
import 'invoices_screen.dart';
import 'messages_screen.dart';
import 'quotes_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  static const _titles = ['My Details', 'Invoices', 'Quotes', 'Bookings', 'Messages'];

  @override
  void initState() {
    super.initState();
    // Now that we're logged in, register for push so the server can notify
    // this customer about new invoices/quotes.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<PushService>().start();
    });
  }

  @override
  Widget build(BuildContext context) {
    final pages = const [
      DetailsScreen(),
      InvoicesScreen(),
      QuotesScreen(),
      BookingsScreen(),
      MessagesScreen(),
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_index]),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Log out',
            onPressed: () => context.read<AuthProvider>().logout(),
          ),
        ],
      ),
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Details'),
          NavigationDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Invoices'),
          NavigationDestination(icon: Icon(Icons.request_quote_outlined), selectedIcon: Icon(Icons.request_quote), label: 'Quotes'),
          NavigationDestination(icon: Icon(Icons.event_outlined), selectedIcon: Icon(Icons.event), label: 'Bookings'),
          NavigationDestination(icon: Icon(Icons.chat_bubble_outline), selectedIcon: Icon(Icons.chat_bubble), label: 'Messages'),
        ],
      ),
    );
  }
}
