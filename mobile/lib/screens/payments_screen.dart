import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../api/api_client.dart';
import '../api/repository.dart';
import '../models/payment.dart';

/// Read-only list of payments received against invoices.
class PaymentsScreen extends StatefulWidget {
  const PaymentsScreen({super.key});

  @override
  State<PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends State<PaymentsScreen> {
  late Future<List<Payment>> _future;
  final _money = NumberFormat.currency(locale: 'en_GB', symbol: '£');
  final _dateFmt = DateFormat('d MMM yyyy');

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() => _future = context.read<Repository>().listPayments();

  Future<void> _refresh() async {
    setState(_load);
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payments')),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<Payment>>(
          future: _future,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              final message = snapshot.error is ApiException
                  ? (snapshot.error as ApiException).message
                  : 'Failed to load payments';
              return ListView(children: [const SizedBox(height: 80), Center(child: Text(message, textAlign: TextAlign.center))]);
            }
            final payments = snapshot.data ?? [];
            if (payments.isEmpty) {
              return ListView(children: const [SizedBox(height: 80), Center(child: Text('No payments yet.'))]);
            }
            return ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: payments.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final p = payments[i];
                final subtitleParts = [
                  if ((p.invoiceNumber ?? '').isNotEmpty) p.invoiceNumber!,
                  if ((p.paymentMethod ?? '').isNotEmpty) p.paymentMethod!,
                  if ((p.accountName ?? '').isNotEmpty) p.accountName!,
                  _dateFmt.format(p.date),
                ];
                return ListTile(
                  title: Text(p.paymentId),
                  subtitle: Text(subtitleParts.join(' · ')),
                  trailing: Text(
                    _money.format(p.amount),
                    style: TextStyle(fontWeight: FontWeight.w600, color: Colors.green.shade700),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
