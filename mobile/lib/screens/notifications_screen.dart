import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/repository.dart';
import '../models/notification_item.dart';
import '../services/push_service.dart';
import '../theme.dart';

/// The staff notification feed (same list as the admin bell). Opening it
/// counts as reading everything: unread entries are highlighted for this
/// visit, then marked read so the bell's red dot and the app icon badge clear.
class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<NotificationItem> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final push = context.read<PushService>();
    try {
      final items = await context.read<Repository>().getNotifications();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
        _error = null;
      });
      if (items.any((n) => !n.read)) await push.markAllRead();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not load notifications.';
      });
    }
  }

  static IconData _iconFor(NotificationItem n) {
    switch (n.link?.kind ?? n.type) {
      case 'preCheckInCompleted':
      case 'boardingBooking':
        return Icons.assignment_turned_in_outlined;
      case 'invoice':
      case 'invoices':
        return Icons.receipt_long_outlined;
      case 'quote':
        return Icons.request_quote_outlined;
      case 'message':
        return Icons.chat_bubble_outline;
      case 'checklist':
        return Icons.checklist_outlined;
      case 'customer':
        return Icons.person_outline;
      default:
        return Icons.notifications_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: RefreshIndicator(onRefresh: _load, child: _body()),
    );
  }

  Widget _body() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return ListView(children: [const SizedBox(height: 120), Center(child: Text(_error!))]);
    }
    if (_items.isEmpty) {
      return ListView(children: [
        const SizedBox(height: 120),
        Center(child: Text('No notifications yet.', style: TextStyle(color: Colors.grey.shade600))),
      ]);
    }
    final timeFmt = DateFormat('d MMM, HH:mm');
    return ListView.separated(
      itemCount: _items.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, i) {
        final n = _items[i];
        final link = n.link;
        return ListTile(
          tileColor: n.read ? null : brandBlueTint,
          leading: Icon(_iconFor(n), color: brandBlue),
          title: Text(n.title, style: TextStyle(fontWeight: n.read ? FontWeight.w500 : FontWeight.w700)),
          subtitle: Text(n.body),
          trailing: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(timeFmt.format(n.createdAt), style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
              if (link != null) Icon(Icons.chevron_right, size: 18, color: Colors.grey.shade500),
            ],
          ),
          // Open what it's about (invoice, message, checklist, ...): leave
          // this list first so the target doesn't stack on top of it.
          onTap: link == null
              ? null
              : () {
                  final push = context.read<PushService>();
                  Navigator.of(context).pop();
                  push.openLink(link);
                },
        );
      },
    );
  }
}
