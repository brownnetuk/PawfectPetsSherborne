import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/repository.dart';
import '../models/boarding_booking.dart';
import '../models/checklist.dart';
import '../models/notification_item.dart';
import '../services/push_service.dart';
import '../state/auth_provider.dart';
import 'boarding_bookings_screen.dart';
import 'boarding_screen.dart';
import 'bookings_screen.dart';
import 'business_screen.dart';
import 'checklist_detail_screen.dart';
import 'checklists_screen.dart';
import 'customer_detail_screen.dart';
import 'customers_screen.dart';
import 'invoice_detail_screen.dart';
import 'invoices_screen.dart';
import 'messages_screen.dart';
import 'notifications_screen.dart';
import 'quote_detail_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
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
    // Tapping a push opens what it's about (see _openFromNotification).
    _push = context.read<PushService>();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _push.onNotificationTap = _openFromNotification;
      _push.start();
      _push.consumePendingOpen();
    });
  }

  late final PushService _push;

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _push.onNotificationTap = null;
    super.dispose();
  }

  // Tab indexes, matching _screens / the NavigationBar below.
  static const _customersTab = 0;
  static const _businessTab = 1;
  static const _bookingsTab = 2;
  static const _boardingTab = 3;
  static const _messagesTab = 4;

  /// Shows the bookings calendar on [day]: switches to the Bookings tab,
  /// backs its stack out to the calendar, and asks it to jump (see
  /// `PushService.requestedBookingsDay`).
  void _showBookingsDay(DateTime day) {
    setState(() {
      _index = _bookingsTab;
      _visited.add(_bookingsTab);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _navigatorKeys[_bookingsTab].currentState?.popUntil((route) => route.isFirst);
      _push.requestedBookingsDay.value = day;
    });
  }

  /// Switches to [tab] and pushes [screen] on that tab's own navigator. A tab
  /// visited for the first time only gets its Navigator on the next frame, so
  /// the push waits for that.
  void _pushOnTab(int tab, Widget screen) {
    setState(() {
      _index = tab;
      _visited.add(tab);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _navigatorKeys[tab].currentState?.push(MaterialPageRoute(builder: (_) => screen));
    });
  }

  /// Opens the screen a notification is about: the invoice that was read,
  /// the customer whose message arrived, the checklist that's due, ... A
  /// notification with no link (or one we can't resolve) opens the
  /// notifications list, as before.
  Future<void> _openFromNotification(NotificationLink? link) async {
    if (link == null) {
      _openNotifications();
      return;
    }
    final repo = context.read<Repository>();
    switch (link.kind) {
      case 'invoice':
        _pushOnTab(_businessTab, InvoiceDetailScreen(invoiceId: link.id));
      case 'invoices':
        // e.g. 'overdue': the list pre-filtered to the invoices in question.
        _pushOnTab(_businessTab, InvoicesScreen(initialStatusFilter: link.id));
      case 'quote':
        _pushOnTab(_businessTab, QuoteDetailScreen(quoteId: link.id));
      case 'bookingsDay':
        // "Today's schedule": the calendar on that day (id is YYYY-MM-DD).
        final day = DateTime.tryParse(link.id);
        if (day == null) {
          _openNotifications();
        } else {
          _showBookingsDay(DateTime(day.year, day.month, day.day));
        }
      case 'customer':
        _pushOnTab(_customersTab, CustomerDetailScreen(customerId: link.id));
      case 'message':
        // The thread needs the customer's name for its title; fall back to a
        // generic one rather than not opening it.
        var name = 'Customer';
        try {
          name = (await repo.getCustomer(link.id)).name;
        } catch (_) {}
        if (!mounted) return;
        _pushOnTab(_messagesTab, MessageThreadScreen(customerId: link.id, customerName: name));
      case 'checklist':
        // Reminders are only ever for today's checklists, so look it up in
        // today's assignments; if it's gone, show the checklists list.
        ChecklistAssignment? found;
        try {
          final now = DateTime.now();
          final start = DateTime(now.year, now.month, now.day);
          final today = await repo.listChecklistAssignments(from: start, to: start.add(const Duration(days: 1)));
          for (final a in today) {
            if (a.id == link.id) found = a;
          }
        } catch (_) {}
        if (!mounted) return;
        _pushOnTab(_boardingTab, found != null ? ChecklistDetailScreen(assignment: found) : const ChecklistsScreen());
      case 'boardingBooking':
        BoardingBookingWithStatus? found;
        try {
          for (final item in await repo.listBoardingBookings()) {
            if (item.booking.id == link.id) found = item;
          }
        } catch (_) {}
        if (!mounted) return;
        _pushOnTab(
          _boardingTab,
          found != null ? BoardingBookingDetailScreen(item: found) : const BoardingBookingsScreen(),
        );
      default:
        _openNotifications();
    }
  }

  // Back in the foreground: notifications may have been read elsewhere (or
  // new ones arrived), so re-sync the bell and the app icon badge.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _push.refreshBadge();
  }

  void _openNotifications() {
    _navigatorKeys[_index].currentState?.push(
      MaterialPageRoute(builder: (_) => const NotificationsScreen()),
    );
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

/// Shared notifications bell for the top-level tab screens, with a red dot
/// while there are unread notifications (the same count as the icon badge).
class NotificationsAction extends StatelessWidget {
  const NotificationsAction({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<int>(
      valueListenable: context.read<PushService>().unreadCount,
      builder: (context, unread, _) => IconButton(
        icon: Badge(
          isLabelVisible: unread > 0,
          label: Text(unread > 99 ? '99+' : '$unread'),
          child: const Icon(Icons.notifications_outlined),
        ),
        tooltip: 'Notifications',
        onPressed: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => const NotificationsScreen()),
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
      onPressed: () {
        // A logged-out phone shouldn't keep showing the red badge.
        context.read<PushService>().clearBadge();
        context.read<AuthProvider>().logout();
      },
    );
  }
}
