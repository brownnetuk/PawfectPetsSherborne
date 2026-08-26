import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/audit_log_entry.dart';

/// Read-only timeline of a customer's system activity (invoices, quotes,
/// payments, emails sent/read, deposits, etc.) from the audit log.
class CustomerActivityScreen extends StatefulWidget {
  final String customerId;
  final String customerName;
  const CustomerActivityScreen({super.key, required this.customerId, required this.customerName});

  @override
  State<CustomerActivityScreen> createState() => _CustomerActivityScreenState();
}

class _CustomerActivityScreenState extends State<CustomerActivityScreen> {
  late Future<List<AuditLogEntry>> _future;
  static final _fmt = DateFormat('d MMM yyyy, HH:mm');
  final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');

  @override
  void initState() {
    super.initState();
    _future = context.read<Repository>().listCustomerActivity(widget.customerId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Activity')),
      body: FutureBuilder<List<AuditLogEntry>>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            final message = snapshot.error is ApiException
                ? (snapshot.error as ApiException).message
                : 'Failed to load activity';
            return Center(child: Text(message, textAlign: TextAlign.center));
          }
          final entries = snapshot.data ?? [];
          if (entries.isEmpty) {
            return const Center(child: Text('No activity yet.'));
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
        },
      ),
    );
  }

  IconData _icon(String type) {
    if (type.contains('payment')) return Icons.payments_outlined;
    if (type.contains('deposit')) return Icons.savings_outlined;
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

  Color _color(String type) {
    if (type.contains('read')) return Colors.blue.shade600;
    if (type.contains('payment') || type.contains('deposit')) return Colors.green.shade700;
    if (type.contains('removed')) return Colors.red.shade600;
    return Colors.grey.shade700;
  }
}
