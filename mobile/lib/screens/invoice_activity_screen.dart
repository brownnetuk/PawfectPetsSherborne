import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/audit_log_entry.dart';
import '../widgets/activity_timeline.dart';

/// Everything that has happened to one invoice -- created, sent, opened by
/// the customer, deposit requested, payments, reminders, schedule changes --
/// from the audit log. The staff counterpart of the admin's
/// InvoiceActivityPanel, opened from the invoice screen's Activity button.
class InvoiceActivityScreen extends StatefulWidget {
  final String invoiceId;
  final String invoiceNumber;
  const InvoiceActivityScreen({super.key, required this.invoiceId, required this.invoiceNumber});

  @override
  State<InvoiceActivityScreen> createState() => _InvoiceActivityScreenState();
}

class _InvoiceActivityScreenState extends State<InvoiceActivityScreen> {
  late Future<List<AuditLogEntry>> _future;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    _future = context.read<Repository>().listInvoiceActivity(widget.invoiceId);
  }

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('${widget.invoiceNumber} activity')),
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
          return RefreshIndicator(
            onRefresh: _refresh,
            child: ActivityTimeline(
              entries: snapshot.data ?? [],
              emptyMessage: 'Nothing has happened to this invoice yet.',
            ),
          );
        },
      ),
    );
  }
}
