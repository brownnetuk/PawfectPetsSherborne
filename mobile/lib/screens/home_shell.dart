import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/push_service.dart';
import '../state/auth_provider.dart';
import 'boarding_screen.dart';
import 'bookings_screen.dart';
import 'business_screen.dart';
import 'customers_screen.dart';
import 'messages_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  // Which tabs have been opened. An IndexedStack builds all its children up
  // front, so without this every tab's initState (and its data fetch) would
  // fire at login -- a thundering herd that slows first paint. We render a
  // placeholder for un-visited tabs so each one only loads when first opened;
  // once visited it stays alive (IndexedStack keeps its state).
  final Set<int> _visited = {0};

  // One Navigator per tab, so screens pushed inside a tab (hubs, lists,
  // details) slide in above the tab's content while the bottom bar stays
  // visible -- previously every push covered the whole shell, losing the
  // navigation bar until staff backed all the way out.
  final List<GlobalKey<NavigatorState>> _navigatorKeys =
      List.generate(5, (_) => GlobalKey<NavigatorState>());

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
    CustomersScreen(),
    BusinessScreen(),
    BookingsScreen(),
    BoardingScreen(),
    MessagesScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return PopScope(
      // The system back (Android button, iOS edge swipe handles itself per
      // route) pops the active tab's own stack rather than the whole shell.
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        final nav = _navigatorKeys[_index].currentState;
        if (nav != null && nav.canPop()) nav.pop();
      },
      child: Scaffold(
        body: IndexedStack(
          index: _index,
          children: List.generate(
            _screens.length,
            (i) => _visited.contains(i)
                ? Navigator(
                    key: _navigatorKeys[i],
                    onGenerateRoute: (settings) =>
                        MaterialPageRoute(settings: settings, builder: (_) => _screens[i]),
                  )
                : const SizedBox.shrink(),
          ),
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _index,
          onDestinationSelected: (i) => setState(() {
            // Re-tapping the active tab jumps back to its root screen.
            if (i == _index) {
              _navigatorKeys[i].currentState?.popUntil((route) => route.isFirst);
            }
            _index = i;
            _visited.add(i);
          }),
          destinations: const [
            NavigationDestination(icon: Icon(Icons.people_outline), label: 'Customers'),
            NavigationDestination(icon: Icon(Icons.business_center_outlined), label: 'Business'),
            NavigationDestination(icon: Icon(Icons.event_note_outlined), label: 'Bookings'),
            NavigationDestination(icon: Icon(Icons.hotel_outlined), label: 'Boarding'),
            NavigationDestination(icon: Icon(Icons.chat_bubble_outline), label: 'Messages'),
          ],
        ),
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
