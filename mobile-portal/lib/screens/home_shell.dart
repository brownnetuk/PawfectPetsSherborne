import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/repository.dart';
import '../services/notification_store.dart';
import '../services/push_service.dart';
import '../state/auth_provider.dart';
import '../theme.dart';
import 'bookings_screen.dart';
import 'details_screen.dart';
import 'invoices_screen.dart';
import 'messages_screen.dart';
import 'notifications_sheet.dart';
import 'quotes_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  int _unread = 0;
  Timer? _pollTimer;
  late final NotificationsCenter _center;
  static const _messagesTab = 4;

  static const _titles = ['My Details', 'Invoices', 'Quotes', 'Bookings', 'Messages'];

  @override
  void initState() {
    super.initState();
    _center = NotificationsCenter(context.read<Repository>(), context.read<NotificationStore>());
    final push = context.read<PushService>();
    // Now that we're logged in, register for push so the server can notify
    // this customer about new invoices/quotes/messages.
    WidgetsBinding.instance.addPostFrameCallback((_) => push.start());
    // Route notification taps (from the OS) once we're mounted.
    push.tappedNotification.addListener(_onPushTap);
    // Refresh the badge whenever a push is captured (received/tapped).
    push.inbound.addListener(_refreshUnread);
    _refreshUnread();
    _pollTimer = Timer.periodic(const Duration(seconds: 20), (_) => _refreshUnread());
    // A tap may already be queued from a cold start.
    _onPushTap();
  }

  @override
  void dispose() {
    final push = context.read<PushService>();
    push.tappedNotification.removeListener(_onPushTap);
    push.inbound.removeListener(_refreshUnread);
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _refreshUnread() async {
    try {
      final count = await _center.unreadCount();
      if (mounted) setState(() => _unread = count);
    } catch (_) {}
  }

  // Handle an OS notification tap: a 'message' goes to the Messages tab, and
  // anything else is shown in a modal (with an Acknowledge button when the
  // broadcast requires it).
  void _onPushTap() {
    final push = context.read<PushService>();
    final data = push.tappedNotification.value;
    if (data == null) return;
    push.tappedNotification.value = null; // consume
    final type = data['type']?.toString();
    if (type == 'message') {
      setState(() => _index = _messagesTab);
    } else {
      final pushMessageId = data['pushMessageId']?.toString();
      final ackRaw = data['ackRequired'];
      _showNotification(LocalNotification(
        id: pushMessageId ?? data['notificationId']?.toString() ?? '${DateTime.now().microsecondsSinceEpoch}',
        title: data['title']?.toString() ?? 'Notification',
        body: data['body']?.toString() ?? '',
        type: type,
        timestamp: DateTime.now(),
        pushMessageId: pushMessageId,
        ackRequired: ackRaw == true || ackRaw?.toString() == 'true',
      ));
    }
    _refreshUnread();
  }

  void _showNotification(LocalNotification n) {
    if (!mounted) return;
    showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(n.title),
        content: Text(n.body),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Close'),
          ),
          if (n.needsAck)
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: brandGreen,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              icon: const Icon(Icons.check, size: 18),
              label: const Text('Acknowledge'),
              onPressed: () async {
                Navigator.of(dialogContext).pop();
                await _acknowledge(n);
              },
            ),
        ],
      ),
    );
  }

  Future<void> _acknowledge(LocalNotification n) async {
    final id = n.pushMessageId;
    if (id == null) return;
    final repo = context.read<Repository>();
    final store = context.read<NotificationStore>();
    final messenger = ScaffoldMessenger.of(context);
    try {
      await repo.acknowledgePushMessage(id);
      await store.markAcknowledged(n.id);
      messenger.showSnackBar(const SnackBar(content: Text('Acknowledged.')));
    } catch (_) {
      messenger.showSnackBar(const SnackBar(content: Text('Could not acknowledge. Try again.')));
    }
    _refreshUnread();
  }

  Future<void> _openNotifications() async {
    final selected = await showModalBottomSheet<LocalNotification>(
      context: context,
      isScrollControlled: true,
      builder: (_) => NotificationsSheet(center: _center),
    );
    await _refreshUnread();
    if (selected == null || !mounted) return;
    if (selected.isMessage) {
      setState(() => _index = _messagesTab);
    } else {
      _showNotification(selected);
    }
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
          _BellButton(unread: _unread, onPressed: _openNotifications),
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

/// Bell icon with an unread-count badge.
class _BellButton extends StatelessWidget {
  final int unread;
  final VoidCallback onPressed;
  const _BellButton({required this.unread, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: 'Notifications',
      onPressed: onPressed,
      icon: Badge(
        isLabelVisible: unread > 0,
        label: Text(unread > 99 ? '99+' : '$unread'),
        child: const Icon(Icons.notifications_outlined),
      ),
    );
  }
}
