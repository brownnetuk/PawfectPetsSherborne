import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/audit_log_entry.dart';
import '../widgets/activity_timeline.dart';

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
          return ActivityTimeline(entries: snapshot.data ?? []);
        },
      ),
    );
  }
}
