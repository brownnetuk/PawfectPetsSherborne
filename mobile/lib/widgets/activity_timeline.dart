import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/audit_log_entry.dart';

/// Read-only timeline of audit-log entries (invoices, quotes, payments,
/// emails sent/read, deposits, ...), newest first as the backend returns
/// them. Shared by the customer Activity screen and an invoice's Activity.
class ActivityTimeline extends StatelessWidget {
  final List<AuditLogEntry> entries;
  final String emptyMessage;
  const ActivityTimeline({super.key, required this.entries, this.emptyMessage = 'No activity yet.'});

  static final _fmt = DateFormat('d MMM yyyy, HH:mm');
  static final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) {
      return Center(child: Text(emptyMessage));
    }
    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: entries.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, i) {
        final e = entries[i];
        final detail = [
          if ((e.description ?? '').isNotEmpty) e.description!,
          '${_fmt.format(e.createdAt.toLocal())} · ${e.actor}',
        ].join('\n');
        return ListTile(
          leading: CircleAvatar(
            backgroundColor: _color(e.type).withValues(alpha: 0.15),
            child: Icon(_icon(e.type), color: _color(e.type), size: 20),
          ),
          title: Text(e.title),
          subtitle: Text(detail),
          isThreeLine: (e.description ?? '').isNotEmpty,
          trailing: e.amount != null
              ? Text(_money.format(e.amount), style: const TextStyle(fontWeight: FontWeight.w600))
              : null,
        );
      },
    );
  }

  static IconData _icon(String type) {
    if (type.contains('payment')) return Icons.payments_outlined;
    if (type.contains('deposit')) return Icons.savings_outlined;
    if (type.contains('overdue')) return Icons.notification_important_outlined;
    if (type.contains('invoice')) return Icons.receipt_long_outlined;
    if (type.contains('quote')) return Icons.request_quote_outlined;
    if (type.contains('credit_note')) return Icons.undo_outlined;
    if (type.contains('read')) return Icons.mark_email_read_outlined;
    if (type.contains('email') || type.contains('emailed')) return Icons.email_outlined;
    if (type.contains('animal')) return Icons.pets_outlined;
    if (type.contains('booking')) return Icons.event_outlined;
    if (type.contains('form')) return Icons.assignment_outlined;
    if (type.contains('customer')) return Icons.person_outline;
    return Icons.circle_outlined;
  }

  static Color _color(String type) {
    if (type.contains('read')) return Colors.blue.shade600;
    if (type.contains('payment') || type.contains('deposit')) return Colors.green.shade700;
    if (type.contains('removed')) return Colors.red.shade600;
    return Colors.grey.shade700;
  }
}
