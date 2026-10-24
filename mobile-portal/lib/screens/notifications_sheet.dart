import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/notification_store.dart';
import '../theme.dart';
import '../widgets/brand.dart';

/// The bell feed: lists this customer's notifications (on-device captures merged
/// with the server feed). Marks them read on open, and pops the tapped
/// notification so the shell can route (message -> Messages tab; else a modal).
class NotificationsSheet extends StatefulWidget {
  final NotificationsCenter center;
  const NotificationsSheet({super.key, required this.center});

  @override
  State<NotificationsSheet> createState() => _NotificationsSheetState();
}

class _NotificationsSheetState extends State<NotificationsSheet> {
  late Future<List<LocalNotification>> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.center.load();
    widget.center.markRead(); // opening the bell clears the unread badge
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.7,
      maxChildSize: 0.95,
      builder: (context, controller) => Column(
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(20, 8, 20, 0),
            child: Align(
              alignment: Alignment.centerLeft,
              child: BrandHeading('Notifications', padding: EdgeInsets.only(top: 8, bottom: 4)),
            ),
          ),
          const Divider(height: 20),
          Expanded(
            child: FutureBuilder<List<LocalNotification>>(
              future: _future,
              builder: (context, snap) {
                if (snap.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                final items = snap.data ?? [];
                if (items.isEmpty) {
                  return Center(
                    child: Text('No notifications yet.', style: TextStyle(color: brandMuted)),
                  );
                }
                return ListView.separated(
                  controller: controller,
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final n = items[i];
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: brandBlueTint,
                        child: Icon(_iconFor(n.type), color: brandBlue, size: 20),
                      ),
                      title: Text(n.title, style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text(n.body, maxLines: 2, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(color: brandMuted)),
                      trailing: Text(
                        DateFormat('d MMM HH:mm').format(n.timestamp),
                        style: const TextStyle(color: brandMuted, fontSize: 11),
                      ),
                      onTap: () => Navigator.of(context).pop(n),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  IconData _iconFor(String? type) {
    switch (type) {
      case 'message':
        return Icons.chat_bubble_outline;
      case 'invoiceReceived':
      case 'invoiceUpdated':
        return Icons.receipt_long_outlined;
      case 'quoteReceived':
      case 'quoteUpdated':
        return Icons.request_quote_outlined;
      default:
        return Icons.notifications_outlined;
    }
  }
}
