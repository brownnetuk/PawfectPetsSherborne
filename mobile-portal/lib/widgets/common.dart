import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme.dart';

final money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
final dateFmt = DateFormat('d MMM yyyy');

/// A small rounded status pill (invoice/quote status), coloured via theme.dart.
class StatusChip extends StatelessWidget {
  final String status;
  const StatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final label = status.isEmpty ? '' : status[0].toUpperCase() + status.substring(1);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: statusBg(status), borderRadius: BorderRadius.circular(999)),
      child: Text(
        label,
        style: TextStyle(color: statusColor(status), fontSize: 12, fontWeight: FontWeight.w600),
      ),
    );
  }
}

/// Scrollable (so pull-to-refresh still works) error state with a Retry button.
class ErrorListView extends StatelessWidget {
  final String message;
  final Future<void> Function() onRetry;
  const ErrorListView({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const SizedBox(height: 100),
        Center(child: Text(message, textAlign: TextAlign.center)),
        const SizedBox(height: 12),
        Center(child: OutlinedButton(onPressed: onRetry, child: const Text('Retry'))),
      ],
    );
  }
}

/// Scrollable empty state.
class EmptyListView extends StatelessWidget {
  final String message;
  const EmptyListView({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    return ListView(children: [
      const SizedBox(height: 120),
      Center(child: Text(message, style: TextStyle(color: Colors.grey.shade600))),
    ]);
  }
}
